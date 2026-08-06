#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_ccass.py — 港交所 CCASS 中央结算系统持股数据抓取脚本

功能：
    从港交所「CCASS 股份查询」页面 (searchsdw.aspx, ASP.NET WebForm)
    抓取指定股票、指定历史月份的前 N 名 CCASS 参与者持股数据，
    聚合为 data/holdings.json，供 index.html 仪表盘读取展示。

为什么需要这个脚本：
    - 该页面是 ASP.NET 表单，需 POST 提交且携带 __VIEWSTATE/__EVENTVALIDATION 等隐藏字段；
    - 港交所未提供公开 REST API；
    - 浏览器内 fetch() 会被 CORS 拦截，无法直接从前端抓取，
      因此用本脚本离线抓取后写成 JSON，页面再读取本地 JSON。

⚠️ 合规与礼貌使用：
    - 仅用于个人研究/学习。港交所网站使用条款对自动化抓取有限制；
      商业用途前请先咨询合规并取得授权。
    - 脚本默认每个请求之间 sleep ≥ MIN_DELAY 秒，请勿调低、勿并发、勿商用。
    - 数据口径：CCASS 仅统计「在中央结算系统内登记」的股份，
      不含以实物证书持有的部分，故「占比」是占 CCASS 持仓 / 占总发行股本，
      与真实流通筹码口径略有差异。

用法示例：
    # 1) 安装依赖（只需一次）
    pip install -r requirements.txt

    # 2) 抓取腾讯(00700)与阿里(09988)近 12 个月数据
    #    （最新采样日自动取「今天 −1，遇周末取上周五」，即港交所网页最大可选日，无需手填 -d）
    python fetch_ccass.py -c 00700 09988 -m 12

    # 3) 仅抓取某只股票当前最新一天（快速验证）
    python fetch_ccass.py -c 00700 -m 1

    # 4) 指定结束日期（若 -d 晚于「今天 −1」，会自动回退到该日）
    python fetch_ccass.py -c 00700 -m 6 -d 2026-07-31 -o data/holdings.json

    # 5) 若确需查「今天」本身（明知可能无数据），加 --allow-today 跳过 −1 延迟
    python fetch_ccass.py -c 00700 -m 1 --allow-today

    # 抓取完成后，启动本地静态服务（避免 file:// 下 fetch 被 CORS 拦截）：
    python -m http.server 8000
    # 然后浏览器打开 http://localhost:8000/

关于采样日期（以港交所网页为准，实测）：
    查询页隐藏字段 today = 今天，而日期栏默认/最大可选日 = 今天 − 1（遇周末取上周五）。
    即「今天能查到的最新持仓 = 昨天的工作日数据」。
    例：今天 7/31(周五) → 最新可查 7/30(周四)；今天 8/3(周一) → 最新可查 7/31(上周五)。
    脚本默认按此规则取最新采样日（不依赖节假日表，仅按周末回退），并在日志打印实际日期。
    若凌晨（交易日 08:30 数据发布前）运行，会再退一天，避免取到未发布数据。
    如确需查更晚的日期（明知可能无数据），加 --allow-today。
"""

import argparse
import json
import logging
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "[ERROR] 缺少依赖，请先运行：  pip install -r requirements.txt\n"
        "        需要: requests, beautifulsoup4 （lxml 可选，缺失会自动回退到内置解析器）\n"
    )
    sys.exit(1)


# ----------------------------------------------------------------------------
# 常量
# ----------------------------------------------------------------------------
SEARCH_URL = "https://www3.hkexnews.hk/sdw/search/searchsdw.aspx"

# 每次请求之间的最小间隔（秒），礼貌限速，请勿调低
MIN_DELAY = 1.0
# 请求超时（秒）
REQUEST_TIMEOUT = 30
# 最大重试次数（单次请求）
MAX_RETRIES = 3
# 重试退避基数（秒）
RETRY_BACKOFF = 2.0

# 模拟真实浏览器，避免被简单拦截
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": SEARCH_URL,
    "Origin": "https://www3.hkexnews.hk",
}

# ----------------------------------------------------------------------------
# 知名投行 CCASS 参与者 ID 映射
# ----------------------------------------------------------------------------
# CCASS 参与者 ID 形如 "C00019" / "A00003"（字母前缀 + 5 位数字；C=Clearing，
# A=Investment/其它，B=Broker 等）。
# 命中后，top10 中对应行会被打上 isTracked=true / instId=<id> 标记，
# 并纳入仪表盘的「著名机构投行持股比例变化」趋势图与「跌出前十/主力出货」预警。
#
# ✅ 全部 PID 均已用 raw_cache 真实数据核对（2026-08，核对方法见下文）。
#    核对方式：从 data/raw_cache/*.json 提取每个 PID 的 CCASS 登记英文名。
# 同一机构可能有多个 PID（不同账户实体，如花旗有 C00010/B01228/B02213/C00058），
# 都应映射到同一 instId，仪表盘会把它们合并计算。
#
# ⚠️ 2026-08-03 调整：跟踪清单按用户指定更新，聚焦「中登 + 主流投行」。
#    每个机构用独立 instId，便于仪表盘分别画线。
#    注意：A00003/A00004/A00005 三个 PID 在 CCASS 登记英文名完全相同
#    （均为 CHINA SECURITIES DEPOSITORY AND CLEARING），只能靠 PID 区分。
#    港股通（沪）A00003、港股通（深）A00004、中国证券登记结算（香港）A00005
#    均已于用户要求移除追踪。
#
# 格式: "CCASS参与者ID": (instId, 中文名简称)
TRACKED_PARTICIPANTS = {
    "B01654": ("cicc", "中金"),                        # CHINA INTERNATIONAL CAPITAL CORP ✅实测
    "C00010": ("citigroup", "花旗银行"),               # CITIBANK N.A. ✅实测
    "C00019": ("hsbc", "上海汇丰银行"),                # THE HONGKONG AND SHANGHAI BANKING ✅实测
    "C00039": ("standardchartered", "渣打银行"),       # STANDARD CHARTERED BANK (HONG KONG) ✅实测
    "B01161": ("ubs", "瑞银"),                         # UBS SECURITIES HONG KONG ✅实测
    "B01274": ("morganstanley", "大摩"),               # MORGAN STANLEY HONG KONG SECURITIES ✅实测
    "B01224": ("merrill", "美林"),                     # MERRILL LYNCH FAR EAST ✅实测
    "B01110": ("jpmorgan", "小摩"),                    # J.P. MORGAN BROKING (HONG KONG) ✅实测
    "B01451": ("goldman", "高盛"),                     # GOLDMAN SACHS (ASIA) SECURITIES ✅实测
}

# 名称兜底匹配：已禁用（保留空列表 + 兼容代码，因为 classify_participant 仍会遍历它）。
# 历史上这里曾用关键词把名称含 "hsbc"/"goldman" 等的参与者也纳入跟踪，但实测会把
# 同一集团的副账户（如 B01089 HSBC BROKING）也拉进来，与「只跟踪指定 PID」的需求冲突。
# 现在跟踪判定 100% 由上方 TRACKED_PARTICIPANTS 的 PID 精确匹配决定，行为可预期。
# 若未来需要重新启用名称兜底（例如数据缺失 participant_id 的历史月份），可在此补充。
NAME_KEYWORD_MAP: list = []


# ----------------------------------------------------------------------------
# 日志
# ----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fetch_ccass")


# ----------------------------------------------------------------------------
# 日期工具
# ----------------------------------------------------------------------------
def end_of_month(d: date) -> date:
    """返回 d 所在月份的最后一天。"""
    # 下个月第 1 天 - 1 天
    if d.month == 12:
        nxt = date(d.year + 1, 1, 1)
    else:
        nxt = date(d.year, d.month + 1, 1)
    return nxt - timedelta(days=1)


def latest_available_date(ref: date, allow_today: bool = False, lag: int = 1) -> date:
    """返回「最可能有 CCASS 数据」的日期（默认 = ref − 1 个日历日，遇周末回退）。

    实测港交所 CCASS 查询页：隐藏字段 today=今天，而日期栏默认/最大可选日 = 今天 − 1。
    即「今天能查到的最新持仓数据 = 昨天的工作日数据」（按日历日 −1，遇周末取上周五）。
    例：今天 7/31(周五) → 最新可查 = 7/30(周四)；今天 8/3(周一) → 最新可查 = 7/31(上周五)。

    规则（以港交所页面 today/最大可选日 为准，不依赖节假日表，仅按周末回退）：
      - 默认 ref − lag 个日历日（lag=1，即昨天），若落到周末则继续回退到最近工作日；
      - 若 allow_today=True，则用 ref 本身的工作日（关闭 −1 延迟，用于 --allow-today）。

    参数：
      ref:        参考日（通常是今天，或 -d 指定的日期）。
      allow_today:True 表示不应用 −1 延迟（用于 --allow-today）。
      lag:        日历日延迟天数（默认 1，对应港交所「最大可选日 = 今天 −1」）。
    """
    def is_weekday(d: date) -> bool:
        return d.weekday() < 5  # 0=周一 … 4=周五

    def to_weekday(d: date) -> date:
        while not is_weekday(d):
            d -= timedelta(days=1)
        return d

    if allow_today:
        return to_weekday(ref)

    return to_weekday(ref - timedelta(days=lag))


# CCASS 每个交易日上午约 08:30（香港时间）发布「昨天」的持仓数据
CCASS_PUBLISH_HOUR = 8
CCASS_PUBLISH_MINUTE = 30


def latest_ref_today() -> date:
    """返回「用于推算最新可查日的参考日」。

    港交所网页的最大可选日 = 今天 − 1（昨天），但该数据在交易日 08:30 左右才发布。
    因此若脚本在交易日 08:30 之前运行，连「昨天」的数据都还没出，应把参考日再退一天。
    返回：当前 >= 08:30 → 今天；< 08:30 → 昨天。
    （再由 latest_available_date(ref) 取 ref −1，得到最终最新可查日。）
    """
    now = datetime.now()
    publish = now.replace(hour=CCASS_PUBLISH_HOUR, minute=CCASS_PUBLISH_MINUTE, second=0, microsecond=0)
    return now.date() if now >= publish else (now.date() - timedelta(days=1))


def month_ends(n: int, end_date: date) -> list:
    """
    返回最近 n 个采样日期（含 end_date），按时间升序。
    - 最新一个点 = end_date 本身（即 -d 指定的日期，或今天）；
    - 更早的点 = 依次往前推一个月的同一天（用于月度趋势）。
    CCASS 数据按日提供；建议 end_date 取「已发布数据的最近交易日」。
    """
    months = []
    cur = end_date
    for _ in range(n):
        months.append(cur)
        # 退一个月：先把当月剩余天数减掉、再减到上月同一天
        try:
            cur = cur.replace(month=cur.month - 1) if cur.month > 1 else cur.replace(year=cur.year - 1, month=12)
        except ValueError:
            # 当前日在上月不存在（如 31 号），取上月最后一天
            cur = end_of_month(cur.replace(day=1) - timedelta(days=1))
    months.reverse()
    return months


def to_hkex_date(d: date) -> str:
    """港交所表单要求的日期格式：yyyy/mm/dd（占位符 placeholder="yyyy/mm/dd"）"""
    return d.strftime("%Y/%m/%d")


def to_iso_month(d: date) -> str:
    """仪表盘用到的月份标签：YYYY-MM"""
    return d.strftime("%Y-%m")


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
class CcassClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self._viewstate = None
        self._eventvalidation = None
        self._viewstategenerator = None
        self._form_fields = None

    def _delay(self):
        time.sleep(MIN_DELAY)

    def load_form(self):
        """GET 表单页，提取 ASP.NET 所有隐藏字段，确保后续 POST 有效。

        实际表单页字段（已核实）：
          __EVENTTARGET / __EVENTARGUMENT / __VIEWSTATE / __VIEWSTATEGENERATOR
          today(yyyymmdd) / sortBy(shareholding) / sortDirection(desc)
          / originalShareholdingDate / alertMsg / txtSelPartID
        注意：该页不使用 __EVENTVALIDATION，故不强制要求。
        """
        resp = self._get_with_retry(SEARCH_URL)
        soup = make_soup(resp.text)
        # 收集所有 <input type="hidden"> 的 name->value，作为 POST 基底
        hidden = {}
        for el in soup.find_all("input"):
            if (el.get("type") or "").lower() == "hidden" and el.get("name"):
                hidden[el["name"]] = el.get("value") or ""
        self._form_fields = hidden
        self._viewstate = hidden.get("__VIEWSTATE")
        self._viewstategenerator = hidden.get("__VIEWSTATEGENERATOR", "")
        self._eventvalidation = hidden.get("__EVENTVALIDATION", "")
        if not self._viewstate:
            raise RuntimeError(
                "未能从表单页提取 __VIEWSTATE，页面结构可能已变化或被拦截。"
            )
        log.debug("已加载表单状态（%d 个隐藏字段）。", len(hidden))

    @staticmethod
    def _find_val(soup, name):
        el = soup.find("input", {"name": name}) or soup.find("input", {"id": name})
        return el.get("value") if el else None

    def _get_with_retry(self, url):
        last = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                self._delay()
                r = self.session.get(url, timeout=REQUEST_TIMEOUT)
                r.raise_for_status()
                r.encoding = "utf-8"
                return r
            except requests.RequestException as e:
                last = e
                wait = RETRY_BACKOFF * attempt
                log.warning("GET %s 失败(第%d次): %s；%ds 后重试", url, attempt, e, wait)
                time.sleep(wait)
        raise RuntimeError(f"GET {url} 多次重试均失败：{last}")

    def query(self, stock_code: str, shareholding_date: date):
        """
        查询某只股票在某日的 CCASS 参与者持股。
        返回 list[dict]：[{participant_id, name, address, shareholding, percent}, ...]
        若需重新加载表单状态（VIEWSTATE 过期），会自动重试一次。
        """
        if self._viewstate is None:
            self.load_form()

        stock_code = self._normalize_code(stock_code)
        # 以表单页的所有隐藏字段作为基底，再覆盖查询参数
        payload = dict(self._form_fields) if self._form_fields else {}
        payload.update({
            # 搜索按钮走 __doPostBack('btnSearch','') → 即 __EVENTTARGET=btnSearch
            "__EVENTTARGET": "btnSearch",
            "__EVENTARGUMENT": "",
            "__VIEWSTATE": self._viewstate,
            "__VIEWSTATEGENERATOR": self._viewstategenerator or "",
            "txtStockCode": stock_code,
            "txtShareholdingDate": to_hkex_date(shareholding_date),
            "txtStockName": "",
            "txtParticipantID": "",
            "txtParticipantName": "",
            "txtSelPartID": "",
            "sortBy": "shareholding",
            "sortDirection": "desc",
        })
        if self._eventvalidation:
            payload["__EVENTVALIDATION"] = self._eventvalidation

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                self._delay()
                r = self.session.post(SEARCH_URL, data=payload, timeout=REQUEST_TIMEOUT)
                r.raise_for_status()
                r.encoding = "utf-8"
                rows = parse_results(r.text)
                # 检测是否被弹回表单页（VIEWSTATE 过期/校验失败）：
                # 结果页会含 "Participant ID" 表头且结果表非空；若 0 行则重载状态重试一次。
                if not rows:
                    if attempt == 1:
                        log.warning("查询 %s @ %s 返回空结果，重载表单状态后重试一次。",
                                    stock_code, shareholding_date)
                        self.load_form()
                        payload["__VIEWSTATE"] = self._viewstate
                        payload["__VIEWSTATEGENERATOR"] = self._viewstategenerator or ""
                        payload["__EVENTTARGET"] = "btnSearch"
                        payload["txtShareholdingDate"] = to_hkex_date(shareholding_date)
                        payload["txtStockCode"] = stock_code
                        if self._eventvalidation:
                            payload["__EVENTVALIDATION"] = self._eventvalidation
                        continue
                return rows, r.text
            except requests.RequestException as e:
                wait = RETRY_BACKOFF * attempt
                log.warning("POST 查询 %s @ %s 失败(第%d次): %s；%ds 后重试",
                            stock_code, shareholding_date, attempt, e, wait)
                time.sleep(wait)
        log.error("查询 %s @ %s 多次重试均失败。", stock_code, shareholding_date)
        return [], ""

    @staticmethod
    def _normalize_code(code: str) -> str:
        """港股代码补零至 5 位，去掉前导 0 留 4 位亦可，CCASS 通常用 5 位。"""
        code = re.sub(r"\D", "", str(code))
        if not code:
            raise ValueError(f"无效股票代码: {code!r}")
        return code.zfill(5)


# ----------------------------------------------------------------------------
# 解析
# ----------------------------------------------------------------------------
def _to_int(s: str):
    """把 '1,234,567' 这类字符串转成 int。"""
    if s is None:
        return None
    s = re.sub(r"[,\s]", "", s)
    return int(s) if s.isdigit() else None


def _to_float(s: str):
    if s is None:
        return None
    s = s.strip().replace("%", "").replace(",", "").replace("％", "")
    try:
        return float(s)
    except ValueError:
        return None


def make_soup(html: str):
    """构造 BeautifulSoup：优先用 lxml（更快），缺失则回退到内置 html.parser。
    Python 3.14 等较新版本可能尚无 lxml 预编译 wheel，因此做容错。"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:  # pragma: no cover
        raise
    for parser in ("lxml", "html.parser"):
        try:
            return BeautifulSoup(html, parser)
        except Exception:
            continue
    return BeautifulSoup(html, "html.parser")


def _strip_label(cell_text: str):
    """结果页单元格形如 'Participant ID: C00019'（移动端把表头放进了每个单元格）。
    去掉 'Label:' / 'Label ：' 前缀，返回值部分。若无前缀则原样返回。"""
    if ":" in cell_text:
        return cell_text.split(":", 1)[1].strip()
    if "：" in cell_text:
        return cell_text.split("：", 1)[1].strip()
    return cell_text.strip()


def parse_results(html: str):
    """
    解析 CCASS 结果页，返回参与者列表（已按持股量降序，即 top N）。

    实际结果表（已核实，2026）：表格 class 含
    'table table-scroll table-sort table-mobile-list'，每行 5 个单元格，
    单元格内容形如 'Participant ID: C00019'、'Name of CCASS Participant ...: HSBC'、
    'Address: ...'、'Shareholding: 2,993,061,702'、'% of the total ...: 6.71%'。
    参与者 ID 形如 C00019 / A00003（字母 + 5 位数字）。
    """
    soup = make_soup(html)
    results = []

    # 选取结果表：class 含 'table-mobile-list' 的表格（行数最多者）即为参与者表
    tables = soup.find_all("table")
    target = None
    for t in tables:
        cls = t.get("class") or []
        if "table-mobile-list" in cls:
            target = t
            break
    if target is None:
        # 回退：取行数最多的表格
        target = max(tables, key=lambda t: len(t.find_all("tr"))) if tables else None

    if target is not None:
        for tr in target.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if len(cells) < 4:
                continue
            texts = [c.get_text(" ", strip=True) for c in cells]
            # 跳过表头行：首列原文恰好是 'Participant ID'（无冒号、无 ID 值）
            # 注意：数据行首列是 'Participant ID: C00019'，不能被误跳过。
            if texts[0].strip().lower() == "participant id":
                continue

            # 取每列「去掉标签前缀」后的值
            vals = [_strip_label(t) for t in texts]
            participant_id = vals[0]
            if not re.match(r"^[A-Za-z]\d{4,6}$", participant_id):
                continue

            name = vals[1] if len(vals) > 1 else ""
            address = vals[2] if len(vals) > 2 else ""
            shareholding = None
            percent = None
            # 按原始文本中的标签语义识别「持股量」「占比」，更稳健
            for raw in texts:
                low = raw.lower()
                val = _strip_label(raw)
                if "%" in low and ("issued shares" in low or "warrants" in low or "units" in low or "%" in val):
                    if percent is None:
                        percent = _to_float(val)
                elif "shareholding" in low and "of" not in low[: len("shareholding") + 4]:
                    cand = _to_int(val)
                    if cand is not None:
                        shareholding = cand
            # 兜底：占比取最后一个含 % 的值，持股量取最大的纯数字
            if percent is None:
                for raw in reversed(texts):
                    v = _strip_label(raw)
                    if "%" in v or "％" in v:
                        percent = _to_float(v)
                        if percent is not None:
                            break
            if shareholding is None:
                cands = [_to_int(_strip_label(raw)) for raw in texts if _to_int(_strip_label(raw))]
                if cands:
                    shareholding = max(cands)

            if shareholding is None and percent is None:
                continue

            results.append({
                "participant_id": participant_id,
                "name": name,
                "address": address,
                "shareholding": shareholding,
                "percent": percent,  # 占总发行股本比例(%)
            })

    # 若仍失败，尝试 div 结构兜底
    if not results:
        results = _parse_div_fallback(soup)

    # 去重（同一参与者ID可能重复出现），并按持股量降序
    seen = {}
    for r in results:
        pid = r["participant_id"]
        if pid not in seen:
            seen[pid] = r
    ordered = sorted(
        seen.values(),
        key=lambda r: (r.get("shareholding") or 0),
        reverse=True,
    )

    # 补算占比：部分股票（如 18C 章生物科技公司 09606 等）港交所 CCASS 页面
    # 不返回「占总发行股本」百分比列。此时用「占 CCASS 总持仓」近似补算，
    # 让看板的「持股比例」与「环比变化」能正常显示。
    # 分母 = 所有参与者持股数之和（不含实物证书部分，与港交所口径一致）。
    if ordered and all(r.get("percent") is None for r in ordered):
        total_shares = sum(r.get("shareholding") or 0 for r in ordered)
        if total_shares > 0:
            for r in ordered:
                sh = r.get("shareholding") or 0
                r["percent"] = round(sh / total_shares * 100, 2)

    return ordered


def _parse_div_fallback(soup):
    """div 结构兜底（部分移动端版本用 div 而非 table）。"""
    results = []
    # 占位实现：实际页面若用 div 结构，可在此补充选择器。
    # 这里仅做最小占位，鼓励在真实页面下用浏览器 DevTools 确认选择器后补全。
    for node in soup.select(".mobile-table-body > div, .participant-row"):
        txt = node.get_text(" ", strip=True)
        m = re.match(r"([A-Za-z]\d{4,6})\s+(.+?)\s+([\d,]+)\s+([\d.]+)\s*%?", txt)
        if m:
            results.append({
                "participant_id": m.group(1),
                "name": m.group(2).strip(),
                "address": "",
                "shareholding": _to_int(m.group(3)),
                "percent": _to_float(m.group(4)),
            })
    return results


# ----------------------------------------------------------------------------
# 机构映射
# ----------------------------------------------------------------------------
def classify_participant(row: dict):
    """
    判断该参与者是否属于被追踪的著名投行。
    优先用 Participant ID 映射；ID 未命中时用名称关键词兜底。
    返回 (is_tracked: bool, inst_id: str|None, short_name: str)
    """
    pid = (row.get("participant_id") or "").upper()
    if pid in TRACKED_PARTICIPANTS:
        inst_id, short_name = TRACKED_PARTICIPANTS[pid]
        return True, inst_id, short_name

    name = (row.get("name") or "").lower()
    for inst_id, keywords in NAME_KEYWORD_MAP:
        if any(kw.lower() in name for kw in keywords):
            # 用关键词兜底时，short_name 取该 inst 最后一个关键词中的中文（若有）
            cn = next((kw for kw in keywords if not re.match(r"^[a-z .]+$", kw.lower())), keywords[0])
            return True, inst_id, cn
    return False, None, row.get("name", "")


# ----------------------------------------------------------------------------
# 聚合
# ----------------------------------------------------------------------------
def build_top10(rows: list, top_n: int = 10):
    """把参与者行列表转成仪表盘 top10Current 结构（含环比 change 占位 0）。

    name 字段：被追踪机构用映射表中的中文简称（易读），其余用原始名。
    rawName：始终保留 CCASS 原始登记名（供前端 tooltip / 核对真实身份），
             被追踪机构因 name 被替换为简称，rawName 尤其重要。
    """
    out = []
    for i, r in enumerate(rows[:top_n], start=1):
        is_tracked, inst_id, short_name = classify_participant(r)
        pid = r.get("participant_id", "")
        out.append({
            "rank": i,
            "broker": short_name,
            # rawName 用 CCASS 查询返回的原始登记名（英文全称），供前端核对真实身份
            "rawName": r.get("name", ""),
            "participant_id": pid,
            "holding": r.get("percent"),  # 占比 %
            "shareholding": r.get("shareholding"),  # 股数
            "change": 0.0,  # 环比，稍后统一计算
            "isTracked": is_tracked,
            "instId": inst_id,
        })
    return out

def compute_changes(top10_current: list, top10_prev: list):
    """
    用上月 top10 计算环比 change：
      若本月、上月同一参与者在两月都存在，则 change = 本月holding - 上月holding；
      否则 change 设为 None（仪表盘会显示为 —）。
    参与者匹配优先用 participant_id（唯一），名称(broker)仅作兜底——
    否则同名经纪商（如多个「中国证券登记结算」账户）会互相覆盖，change 算错。
    返回更新后的 top10_current。
    """
    # 1) 按 participant_id 建主映射（唯一，正确区分同名账户）
    prev_by_pid = {}
    for r in top10_prev:
        pid = r.get("participant_id")
        if pid:
            prev_by_pid[pid] = r.get("holding")
    # 2) 按 broker 名称建兜底映射（仅用于无 participant_id 的旧数据）
    prev_by_name = {}
    for r in top10_prev:
        name = r.get("broker")
        if name:
            prev_by_name[name] = r.get("holding")

    for r in top10_current:
        cur_h = r.get("holding")
        pid = r.get("participant_id")
        # 优先用 participant_id 精确匹配
        prev_h = prev_by_pid.get(pid) if pid else None
        # 兜底：无 pid 或 pid 未命中时，再用名称匹配
        if prev_h is None and r.get("broker"):
            prev_h = prev_by_name.get(r.get("broker"))
        if prev_h is not None and cur_h is not None:
            r["change"] = round(cur_h - prev_h, 4)
        else:
            r["change"] = None
    return top10_current



def build_tracked_series(month_top_lists: list, months_iso: list):
    """
    从各月份的完整参与者列表（前 N 或全部）中，
    为每个被追踪投行抽取「每月占比」，得到 12 点趋势序列。

    month_top_lists: list[list[dict]] 每月原始参与者行（建议传入全部行而非仅 top10，
                     否则跌出 top10 的月份会缺失该机构数据点 → 趋势线断裂）。
    返回: { inst_id: [pct_m1, pct_m2, ...] }，缺失月份用 None。
    """
    series = {inst_id: [] for inst_id, _ in TRACKED_PARTICIPANTS.values()}
    # 兼容关键词兜底出现的 inst_id
    inst_ids = set(series.keys())
    for month_rows in month_top_lists:
        month_hit = {}
        for r in month_rows:
            is_tracked, inst_id, _ = classify_participant(r)
            if is_tracked and inst_id:
                pct = r.get("percent")
                if inst_id not in month_hit:  # 同月同机构取最大值
                    month_hit[inst_id] = pct
                elif pct is not None:
                    prev = month_hit[inst_id]
                    month_hit[inst_id] = pct if (prev is None or pct > prev) else prev
        for inst_id in inst_ids:
            series[inst_id].append(month_hit.get(inst_id))
    # 关键词兜底可能引入 inst_ids 之外无意义，已在 inst_ids 固定为映射表中的，忽略
    return {k: v for k, v in series.items() if k in inst_ids}


def build_all_participants(month_full_rows: list):
    """
    把每月「全部参与者」聚合成「每个参与者 ID 的历史序列」，
    供前端「全部经纪持股排行」「环比增持排行」「图表任选经纪商」使用。

    返回 list[dict]，每项形如：
      {
        "id": "C00019", "name": "汇丰银行", "instId": "hsbc" | null,
        "series": [pct_m1, pct_m2, ...],   # 与 months 一一对应，缺失月为 null
        "shareholding": 2993061702          # 最新月持股数（用于排序）
      }
    同一参与者 ID 在一个月里可能出现多次（如中证登 A00003/A00004 是不同账户），
    这里按 participant_id 聚合：月内取该 ID 所有行的占比之和、持股数之和，
    名称取出现频次最高者。
    """
    # pid -> { "name":..., "names":{name:count}, "series":[per-month aggregated pct], "sh":[..] }
    agg = {}
    n_months = len(month_full_rows)
    for mi, rows in enumerate(month_full_rows):
        month_by_pid = {}
        for r in rows:
            pid = (r.get("participant_id") or "").upper()
            if not pid:
                continue
            slot = month_by_pid.setdefault(pid, {"pct": 0.0, "pct_ok": False, "sh": 0, "sh_ok": False,
                                                  "names": {}})
            pct = r.get("percent")
            if pct is not None:
                slot["pct"] += pct
                slot["pct_ok"] = True
            sh = r.get("shareholding")
            if sh is not None:
                slot["sh"] += sh
                slot["sh_ok"] = True
            nm = r.get("name") or ""
            if nm:
                slot["names"][nm] = slot["names"].get(nm, 0) + 1
            # 标记是否被追踪投行（任一行命中即可）
            slot.setdefault("inst_info", None)
            is_tracked, inst_id, _ = classify_participant(r)
            if is_tracked and inst_id and not slot["inst_info"]:
                slot["inst_info"] = inst_id
        for pid, slot in month_by_pid.items():
            entry = agg.setdefault(pid, {
                "names": {}, "series": [None] * n_months, "sh": [None] * n_months,
                "inst_info": None,
            })
            entry["series"][mi] = round(slot["pct"], 4) if slot["pct_ok"] else None
            entry["sh"][mi] = slot["sh"] if slot["sh_ok"] else None
            if slot["inst_info"] and not entry["inst_info"]:
                entry["inst_info"] = slot["inst_info"]
            for nm, c in slot["names"].items():
                entry["names"][nm] = entry["names"].get(nm, 0) + c

    out = []
    for pid, e in agg.items():
        # 取出现频次最高的名称作为显示名；若被追踪投行，优先用映射里的简称
        inst_id = e["inst_info"]
        short_name = None
        if inst_id and inst_id in dict((v[0], v[1]) for v in TRACKED_PARTICIPANTS.values()):
            short_name = dict((v[0], v[1]) for v in TRACKED_PARTICIPANTS.values())[inst_id]
        if not short_name and e["names"]:
            short_name = max(e["names"].items(), key=lambda kv: kv[1])[0]
        # 最新月持股数（取最后一个非空）
        latest_sh = next((v for v in reversed(e["sh"]) if v is not None), None)
        # 原始登记名：取 CCASS 查询结果中出现频次最高的名称（英文全称）
        raw_name = max(e["names"].items(), key=lambda kv: kv[1])[0] if e["names"] else ""
        out.append({
            "id": pid,
            "name": short_name or pid,
            "rawName": raw_name,  # CCASS 原始登记名，供前端核对真实身份
            "instId": inst_id,
            "series": e["series"],
            "shareholding": latest_sh,
        })
    return out


# ----------------------------------------------------------------------------
# 股票名称（简易，CCASS 不返回中文名，这里维护少量常见代码→名称；其余留空）
# ----------------------------------------------------------------------------
# 人工校对过的常见代码→简体名称，作为 stock_name() 的「优先来源」；
# 不在此字典的代码，会自动从港交所「证券名单」XLSX 兜底查询。
STOCK_NAMES = {
    "00700": "腾讯控股",
    "09988": "阿里巴巴-SW",
    "03690": "美团-W",
    "01299": "友邦保险",
    "00388": "香港交易所",
    "00941": "中国移动",
    "00005": "汇丰控股",
    "02318": "中国平安",
    "00939": "建设银行",
    "03988": "中国银行",
    "01398": "工商银行",
    "01088": "中国神华",
    "01810": "小米集团-W",
    "09888": "百度集团-SW",
    "09618": "京东集团-SW",
    "09999": "网易-S",
}

# 港交所「证券名单」XLSX（含全部主板/创业板证券的代码、名称、分类）
SEC_LIST_URL = "https://www.hkex.com.hk/chi/services/trading/securities/securitieslists/ListOfSecurities_c.xlsx"
SEC_LIST_PATH = Path("data/sec_list/ListOfSecurities_c.xlsx")
SEC_LIST_TTL = timedelta(hours=24)  # 名单缓存有效期（CI 每天跑一次，正好每天刷新）

# 繁→简转换器（懒加载，避免 opencc 未安装时整模块无法 import）
_T2S = None


def _t2s(text: str) -> str:
    """繁体转简体；opencc 不可用时原样返回。"""
    global _T2S
    if _T2S is None:
        try:
            from opencc import OpenCC
            _T2S = OpenCC("t2s").convert
        except Exception:
            _T2S = lambda s: s  # 无 opencc 则不转换（降级，不阻断流程）
    return _T2S(text)


def _normalize_name(raw: str) -> str:
    """把港交所原始名称规整为简体 + 半角后缀（与 STOCK_NAMES 风格一致）。"""
    if not raw:
        return ""
    n = _t2s(str(raw)).strip()
    # 港交所常用全角字符 → 半角，统一风格
    for full, half in (("－", "-"), ("Ｗ", "W"), ("Ｓ", "S"), ("，", ","), ("（", "("), ("）", ")")):
        n = n.replace(full, half)
    return n


# 证券名单的内存缓存：{code5: 简体名称}，仅含「股本」分类且非 08 开头（主板股本证券）
_SEC_NAME_MAP: dict | None = None


def _load_sec_name_map() -> dict:
    """下载（若过期或缺失）并解析港交所证券名单，返回 {code5: 简体名称}。

    筛选规则（与用户需求一致）：
      - 分类(C 列) = 「股本」
      - 代码(A 列) 非「08」开头（排除创业板/衍生品类，只要主板股本证券）
    失败时返回空 dict，调用方照常运行（名称留空，不影响抓数）。
    """
    global _SEC_NAME_MAP
    if _SEC_NAME_MAP is not None:
        return _SEC_NAME_MAP

    # 1) 确保本地有最新名单（缺失或过期则下载）
    need_download = (not SEC_LIST_PATH.exists())
    if not need_download:
        age = datetime.now().timestamp() - SEC_LIST_PATH.stat().st_mtime
        need_download = age > SEC_LIST_TOTAL_SECONDS
    if need_download:
        try:
            SEC_LIST_PATH.parent.mkdir(parents=True, exist_ok=True)
            log.info("下载港交所证券名单 → %s", SEC_LIST_PATH)
            resp = requests.get(SEC_LIST_URL, headers=HEADERS, timeout=60)
            resp.raise_for_status()
            SEC_LIST_PATH.write_bytes(resp.content)
        except Exception as e:
            log.warning("下载证券名单失败：%s（将尝试用本地旧文件）", e)

    # 2) 解析（若文件仍不存在则返回空）
    if not SEC_LIST_PATH.exists():
        _SEC_NAME_MAP = {}
        return _SEC_NAME_MAP

    try:
        import openpyxl
        # 注意：read_only=True 在该 xlsx 上只能读到前几行（实测缓存不全），
        # 必须用完整加载模式。
        wb = openpyxl.load_workbook(SEC_LIST_PATH)
        ws = wb.active
        m = {}
        # 表头在第 3 行：A=股份代号 B=股份名称 C=分类；数据从第 4 行起
        for row in ws.iter_rows(min_row=4, values_only=True):
            code = str(row[0]).strip() if row[0] else ""
            cat = str(row[2]).strip() if row[2] else ""
            name = str(row[1]).strip() if row[1] else ""
            if not code or cat != "股本" or code.startswith("08"):
                continue
            m[code] = _normalize_name(name)
        _SEC_NAME_MAP = m
        log.info("证券名单解析完成：共 %d 只主板股本证券。", len(m))
    except Exception as e:
        log.warning("解析证券名单失败：%s", e)
        _SEC_NAME_MAP = {}
    return _SEC_NAME_MAP


# timedelta → 秒（避免反复计算）
SEC_LIST_TOTAL_SECONDS = SEC_LIST_TTL.total_seconds()


def stock_name(code: str) -> str:
    """返回股票简体名称：先查人工字典，再查港交所证券名单兜底，均无则空串。"""
    code5 = code.strip().lstrip("0").zfill(5)
    name = STOCK_NAMES.get(code5, "")
    if name:
        return name
    return _load_sec_name_map().get(code5, "")


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
def fetch_stock(client: CcassClient, stock_code: str, months: list, top_n: int = 10):
    """
    抓取单只股票在 months（日期列表，升序）的前 N 参与者数据，
    返回仪表盘所需的该股票结构。
    """
    code5 = CcassClient._normalize_code(stock_code)
    log.info("开始抓取 %s (%s)，共 %d 个月。", code5, stock_name(code5) or "未命名", len(months))

    month_full_rows = []   # 每月「全部参与者」（用于趋势；若解析只给前若干名则用其）
    month_top10 = []       # 每月 top10（结构化）
    months_iso = [to_iso_month(d) for d in months]
    failed_months = []

    for d in months:
        rows, _html = client.query(code5, d)
        if not rows:
            log.warning("  %s @ %s：无数据（非交易日/数据未更新/被拦？）。", code5, d)
            failed_months.append(d.isoformat())
        else:
            log.info("  %s @ %s：取到 %d 个参与者。", code5, d, len(rows))
        month_full_rows.append(rows)
        month_top10.append(build_top10(rows, top_n=top_n))

    # 当前月 = 最后一个月；上月 = 倒数第二个月
    top10_current = month_top10[-1] if month_top10 else []
    top10_prev = month_top10[-2] if len(month_top10) >= 2 else []
    top10_current = compute_changes(top10_current, top10_prev)

    tracked_series = build_tracked_series(month_full_rows, months_iso)
    all_participants = build_all_participants(month_full_rows)

    result = {
        "code": code5,
        "name": stock_name(code5),
        "marketCap": "",   # CCASS 不提供，留空
        "price": "",       # CCASS 不提供，留空
        "months": months_iso,
        "trackedData": tracked_series,
        "top10Current": top10_current,
        # 保留上月 top10 完整字段（含 holding/shareholding），供前端对比「持股数量」环比
        "top10Prev": [{"broker": r.get("broker"), "rawName": r.get("rawName", ""),
                       "participant_id": r.get("participant_id"),
                       "instId": r.get("instId"),
                       "holding": r.get("holding"), "shareholding": r.get("shareholding")} for r in top10_prev],
        "allParticipants": all_participants,   # 全部参与者历史（供任选图表/增持榜/全部排行）
        "failedMonths": failed_months,
    }
    return result


def merge_into_existing(existing: dict, stock_result: dict, months_iso: list):
    """
    将单只股票结果并入已有数据集（保留其余股票；months 以本次为准）。
    """
    if "stocks" not in existing or not isinstance(existing["stocks"], dict):
        existing["stocks"] = {}
    existing["stocks"][stock_result["code"]] = stock_result
    existing["months"] = months_iso
    existing["generatedAt"] = datetime.now().astimezone().isoformat()
    return existing


def main():
    ap = argparse.ArgumentParser(
        description="抓取港交所 CCASS 前 N 参与者持股，输出 data/holdings.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例:\n  python fetch_ccass.py -c 00700 09988 -m 12",
    )
    ap.add_argument("-c", "--codes", nargs="+", required=True,
                    help="一个或多个股票代码，如 00700 09988（可加前导0或省略）")
    ap.add_argument("-m", "--months", type=int, default=12,
                    help="抓取最近 N 个月（默认 12），取每月最后一天")
    ap.add_argument("-d", "--date", default=None,
                    help="结束日期 YYYY-MM-DD（默认：今天 −1，遇周末取上周五 = 港交所网页最大可选日）")
    ap.add_argument("-n", "--top", type=int, default=10,
                    help="每月取前 N 名参与者（默认 10）")
    ap.add_argument("-o", "--out", default="data/holdings.json",
                    help="输出 JSON 路径（默认 data/holdings.json）")
    ap.add_argument("--merge", action="store_true", default=True,
                    help="并入已有输出文件中的其他股票（默认开启）")
    ap.add_argument("--replace", action="store_true",
                    help="覆盖式输出（清空旧数据，只保留本次抓取结果）")
    ap.add_argument("--allow-today", action="store_true",
                    help="跳过 −1 延迟，允许把「今天/指定日」作为最新点（明知可能无数据）")
    ap.add_argument("--debug", action="store_true", help="开启 DEBUG 日志")
    args = ap.parse_args()

    if args.debug:
        log.setLevel(logging.DEBUG)

    # 港交所网页最大可选日 = 今天 −1；交易日 08:30 才发布「昨天」数据，凌晨跑则再退一天
    ref_date = latest_ref_today() if not args.date else \
        datetime.strptime(args.date, "%Y-%m-%d").date()
    end_date = latest_available_date(ref_date, allow_today=args.allow_today)
    if end_date != ref_date:
        log.info("最新采样日调整为 %s（港交所网页最大可选日 = %s −1，遇周末回退）。",
                 end_date.isoformat(), ref_date.isoformat())

    months = month_ends(max(1, args.months), end_date)
    months_iso = [to_iso_month(d) for d in months]

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # 读取已有数据（便于增量）
    dataset = {"generatedAt": "", "months": months_iso, "stocks": {}}
    if args.merge and not args.replace and out_path.exists():
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                dataset = json.load(f)
            log.info("已载入既有数据：%d 只股票。", len(dataset.get("stocks", {})))
        except (json.JSONDecodeError, OSError) as e:
            log.warning("读取旧文件失败，将覆盖：%s", e)
            dataset = {"generatedAt": "", "months": months_iso, "stocks": {}}
    if args.replace:
        dataset = {"generatedAt": "", "months": months_iso, "stocks": {}}

    client = CcassClient()
    try:
        client.load_form()
    except Exception as e:
        log.error("加载表单页失败：%s", e)
        log.error("请检查网络是否能访问 https://www3.hkexnews.hk/sdw/search/searchsdw.aspx")
        return 2

    for code in args.codes:
        try:
            res = fetch_stock(client, code, months, top_n=args.top)
            dataset = merge_into_existing(dataset, res, months_iso)
        except Exception as e:
            log.exception("抓取 %s 时出错：%s", code, e)

    dataset["generatedAt"] = datetime.now().astimezone().isoformat()

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)
    log.info("✅ 已写出：%s（共 %d 只股票）", out_path, len(dataset.get("stocks", {})))


if __name__ == "__main__":
    sys.exit(main() or 0)
