#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update.py — CCASS 持仓数据「增量更新」脚本

与 fetch_ccass.py 的区别：
    - fetch_ccass.py：每次都「从头全量抓取」指定月份，覆盖式写出 holdings.json。
    - update.py    ：「增量更新」——
        1) 维护一份按「股票 × 自然月(YYYY-MM)」的原始每日缓存（data/raw_cache/<code>.json）；
        2) 同一个自然月内多次抓取，**只保留最新一次有数据的结果**（同月取最新）；
        3) 已经缓存成功且非「最新月」的月份直接跳过，**不重复请求**（月级缓存，省时省流量）；
        4) 默认只刷新「最新自然月」与「尚未抓取的新月份」，其余从缓存读；
        5) 最后用缓存数据重建 holdings.json（trackedData / top10 / allParticipants / 分析所需字段）。

适用场景：
    - 你想每天/每周追加最新数据，又不想把过去 12 个月全抓一遍；
    - 同一个月内多次运行，数据会更新到该月「最近一次有数据的工作日」（按港交所网页最大可选日 = 今天 −1）。

用法示例：
    # 首次：抓最近 6 个月（会写入 raw_cache 并生成 holdings.json）
    python update.py -c 00700 09988 -m 6

    # 之后：增量更新（只抓「最新自然月」+ 任何新月份，其余走缓存）
    python update.py -c 00700 09988 -m 6

    # 强制刷新最近 N 个自然月（即便缓存命中也重抓）
    python update.py -c 00700 -m 12 --refresh-recent 2

    # 强制重抓某只股票全部月份
    python update.py -c 00700 -m 12 --refresh-all

    # 仅用现有缓存重建 holdings.json，不发起任何网络请求
    python update.py -c 00700 09988 --rebuild-only

    # 打开页面：
    python -m http.server 8000   → http://localhost:8000/

缓存目录：
    data/raw_cache/<code>.json   形如：
      {
        "2025-08": { "date": "2025-08-29", "count": 415, "participants": [ {participant_id, name, address, shareholding, percent}, ... ] },
        "2026-07": { "date": "2026-07-30", "count": 419, "participants": [...] }
      }
    其中 date 是「该月实际抓取到数据的日期」（同月取最新时会被更晚的日期覆盖）。
"""

import argparse
import json
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import fetch_ccass as fc

log = logging.getLogger("update")

RAW_CACHE_DIR = Path("data/raw_cache")
OUT_DEFAULT = Path("data/holdings.json")


# ----------------------------------------------------------------------------
# 自然月工具
# ----------------------------------------------------------------------------
def calendar_months(n: int, end_date: date) -> list:
    """返回最近 n 个「自然月」的 (YYYY-MM, 代表日期) 列表，按时间升序。

    代表日期取该月内 end_date 的同一天（用于首次抓取时的落点）；
    增量更新里实际会优先用 latest_available_date() 取「今天 −1，遇周末取上周五」作为最新可查日。
    """
    out = []
    y, m = end_date.year, end_date.month
    for _ in range(n):
        try:
            rep = date(y, m, min(end_date.day, _days_in_month(y, m)))
        except ValueError:
            rep = date(y, m, _days_in_month(y, m))
        out.append(("%04d-%02d" % (y, m), rep))
        # 退一个月
        if m == 1:
            y, m = y - 1, 12
        else:
            m -= 1
    out.reverse()
    return out


def _days_in_month(y: int, m: int) -> int:
    if m == 12:
        nxt = date(y + 1, 1, 1)
    else:
        nxt = date(y, m + 1, 1)
    return (nxt - timedelta(days=1)).day


def ym_key(d: date) -> str:
    return "%04d-%02d" % (d.year, d.month)


# ----------------------------------------------------------------------------
# 原始缓存读写
# ----------------------------------------------------------------------------
def load_cache(code: str) -> dict:
    p = RAW_CACHE_DIR / ("%s.json" % code)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            log.warning("缓存文件 %s 损坏，将重建。", p)
    return {}


def save_cache(code: str, cache: dict):
    RAW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    p = RAW_CACHE_DIR / ("%s.json" % code)
    p.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


# ----------------------------------------------------------------------------
# 单股增量抓取
# ----------------------------------------------------------------------------
def update_stock(client, code: str, want: list, end_date: date,
                 refresh_recent: int = 1, refresh_all: bool = False):
    """
    want: [(ym, rep_date), ...] 想要的自然月（升序）。
    end_date: 全局最新可查日（港交所网页最大可选日 = 今天 −1）。最新月份落点不超过它。
    refresh_recent: 强制刷新「最近 N 个自然月」（默认 1，即最新月总是刷新以取最新数据）。
    refresh_all: 强制刷新所有月份。
    返回更新后的缓存 dict。
    """
    code5 = fc.CcassClient._normalize_code(code)
    cache = load_cache(code5)
    name = fc.stock_name(code5) or code5
    end_date_ym = ym_key(end_date)

    want_ym = [ym for ym, _ in want]
    latest_ym = want_ym[-1] if want_ym else None
    refresh_set = set()
    if refresh_all:
        refresh_set = set(want_ym)
    else:
        # 最近 refresh_recent 个月强制刷新
        refresh_set = set(want_ym[-max(1, refresh_recent):])

    to_fetch = []  # [(ym, rep_date)]
    for ym, rep in want:
        cached = cache.get(ym)
        if cached and cached.get("participants") and ym not in refresh_set:
            log.info("  [缓存命中] %s @ %s（数据日 %s，%d 家）", code5, ym, cached.get("date"), len(cached["participants"]))
            continue
        # 已标记为「确认无数据」（如新股上市前的月份），跳过，避免每次重复抓取
        if cached and cached.get("empty") and ym not in refresh_set:
            log.info("  [跳过·确认无数据] %s @ %s（落点 %s 曾查无数据）", code5, ym, cached.get("checked"))
            continue
        to_fetch.append((ym, rep))

    if not to_fetch:
        log.info("%s (%s)：全部 %d 个月命中缓存，无需请求。", code5, name, len(want))
    else:
        log.info("%s (%s)：需抓取 %d 个月（共 %d 个月）。", code5, name, len(to_fetch), len(want))

    for ym, rep in to_fetch:
        # 落点逻辑：
        #  - 历史月份：数据早已发布，直接用「该月最后一个工作日」（月末，跳过周末）。
        #  - 最新月份（== end_date 所在月）：不能超过全局最新可查日 end_date，
        #    落点 = min(月末, end_date)，再跳过周末。
        # 注意：−1 延迟已在全局 end_date 处应用过一次，这里不再重复回退，避免「双重回退」。
        month_end = fc.end_of_month(rep)
        if ym == end_date_ym:
            d = min(month_end, end_date)
        else:
            d = month_end
        # 跳过周末：往前退到最近工作日
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        # 若退到上一个月（极罕见，如月末是周六且全月无更早工作日——不会发生），兜底
        if ym_key(d) != ym:
            d = month_end
            while d.weekday() >= 5:
                d -= timedelta(days=1)
        rows, _html = client.query(code5, d)
        if not rows:
            log.warning("  %s @ %s（落点 %s）：无数据 → 写入「空标记」缓存，下次跳过（避免重复抓取）。",
                        code5, ym, d.isoformat())
            cache[ym] = {"empty": True, "checked": d.isoformat()}
            continue
        log.info("  %s @ %s（落点 %s）：取到 %d 家 → 写入缓存（同月取最新）。",
                 code5, ym, d.isoformat(), len(rows))
        cache[ym] = {
            "date": d.isoformat(),
            "count": len(rows),
            "participants": rows,
        }

    save_cache(code5, cache)
    return cache


# ----------------------------------------------------------------------------
# 由缓存重建仪表盘数据（复用 fetch_ccass 的 build_* 函数）
# ----------------------------------------------------------------------------
def build_from_cache(code: str, cache: dict, want_ym: list):
    """
    用缓存中 want_ym 这些自然月的原始数据，重建一只股票的仪表盘结构。
    缺失月份用空列表占位（参与者为 0），并在 failedMonths 记录。
    """
    code5 = fc.CcassClient._normalize_code(code)
    months_iso = list(want_ym)
    month_full_rows = []
    month_top10 = []
    failed = []
    for ym in want_ym:
        entry = cache.get(ym)
        rows = entry.get("participants", []) if entry else []
        if not rows:
            failed.append(ym)
        month_full_rows.append(rows)
        month_top10.append(fc.build_top10(rows, top_n=10))

    top10_current = month_top10[-1] if month_top10 else []
    top10_prev = month_top10[-2] if len(month_top10) >= 2 else []
    top10_current = fc.compute_changes(top10_current, top10_prev)

    # 采样日期（用于展示「数据月」的实际日期）
    data_dates = [(cache.get(ym, {}) or {}).get("date") for ym in want_ym]

    result = {
        "code": code5,
        "name": fc.stock_name(code5),
        "marketCap": "",
        "price": "",
        "months": months_iso,
        "dataDates": data_dates,  # 各自然月实际抓取到的日期（便于核对「同月取最新」）
        "trackedData": fc.build_tracked_series(month_full_rows, months_iso),
        "top10Current": top10_current,
        # 保留上月 top10 完整字段（含 holding/shareholding），供前端对比「持股数量」环比
        "top10Prev": [{"broker": r.get("broker"), "rawName": r.get("rawName", ""),
                       "participant_id": r.get("participant_id"),
                       "instId": r.get("instId"),
                       "holding": r.get("holding"), "shareholding": r.get("shareholding")} for r in top10_prev],
        "allParticipants": fc.build_all_participants(month_full_rows),
        "failedMonths": failed,
    }
    return result


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="CCASS 持仓数据增量更新（同月取最新，月级缓存，省时省流量）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例:\n  python update.py -c 00700 09988 -m 6\n  python update.py -c 00700 --rebuild-only",
    )
    ap.add_argument("-c", "--codes", nargs="+", required=True,
                    help="一个或多个股票代码，如 00700 09988")
    ap.add_argument("-m", "--months", type=int, default=12,
                    help="保留最近 N 个自然月（默认 12）")
    ap.add_argument("-d", "--date", default=None,
                    help="结束日期 YYYY-MM-DD（默认：今天 −1，遇周末取上周五 = 港交所网页最大可选日）")
    ap.add_argument("-o", "--out", default=str(OUT_DEFAULT),
                    help="输出 holdings.json 路径（默认 data/holdings.json）")
    ap.add_argument("--refresh-recent", type=int, default=1,
                    help="强制刷新最近 N 个自然月（默认 1，即最新月总刷新以取最新数据）")
    ap.add_argument("--refresh-all", action="store_true",
                    help="强制刷新所有月份（忽略缓存，全部重抓）")
    ap.add_argument("--rebuild-only", action="store_true",
                    help="不发起任何网络请求，仅用现有缓存重建 holdings.json")
    ap.add_argument("--keep-extra-months", action="store_true",
                    help="缓存中超出 -m 窗口的旧月份也保留在缓存文件里（默认会裁剪到窗口内）")
    ap.add_argument("--debug", action="store_true", help="开启 DEBUG 日志")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")

    # 默认参考日 = 今天（当前 < 08:30 则用昨天，因 08:30 才发布昨天数据）
    ref_date = fc.latest_ref_today() if not args.date else \
        datetime.strptime(args.date, "%Y-%m-%d").date()
    end_date = fc.latest_available_date(ref_date)
    if end_date != ref_date:
        log.info("最新参考日 %s → 按港交所规则调整为 %s（网页最大可选日 = ref −1）。", ref_date.isoformat(), end_date.isoformat())

    want = calendar_months(max(1, args.months), end_date)
    want_ym = [ym for ym, _ in want]

    # 载入既有 holdings.json（保留未参与本次更新的股票）
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    dataset = {"generatedAt": "", "months": want_ym, "stocks": {}}
    if out_path.exists():
        try:
            dataset = json.loads(out_path.read_text(encoding="utf-8"))
            if "stocks" not in dataset or not isinstance(dataset["stocks"], dict):
                dataset["stocks"] = {}
            log.info("已载入既有 %s（%d 只股票）。", out_path, len(dataset["stocks"]))
        except (json.JSONDecodeError, OSError):
            log.warning("读取 %s 失败，将重建。", out_path)
            dataset = {"generatedAt": "", "months": want_ym, "stocks": {}}

    client = None
    if not args.rebuild_only:
        client = fc.CcassClient()
        try:
            client.load_form()
        except Exception as e:
            log.error("加载表单页失败：%s", e)
            log.error("请检查网络是否能访问港交所。或用 --rebuild-only 仅用缓存重建。")
            return 2

    updated_count = 0
    for code in args.codes:
        cache = load_cache(code) if args.rebuild_only else \
            update_stock(client, code, want, end_date,
                         refresh_recent=args.refresh_recent, refresh_all=args.refresh_all)
        # 裁剪缓存到窗口内（除非 --keep-extra-months）
        if not args.keep_extra_months:
            cache = {ym: v for ym, v in cache.items() if ym in set(want_ym)}
            save_cache(code, cache)

        stock_result = build_from_cache(code, cache, want_ym)
        dataset["stocks"][stock_result["code"]] = stock_result
        # 顺带回写缓存（裁剪后）
        updated_count += 1

    # 统一 months（取所有股票共同的月份并集，按时间升序）
    all_months = sorted({m for s in dataset["stocks"].values() for m in s.get("months", [])})
    dataset["months"] = all_months
    dataset["generatedAt"] = datetime.now().astimezone().isoformat()

    out_path.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("✅ 已写出 %s（%d 只股票，月份 %s ~ %s）。",
             out_path, len(dataset["stocks"]),
             all_months[0] if all_months else "-", all_months[-1] if all_months else "-")
    log.info("   原始按月缓存目录：%s", RAW_CACHE_DIR.resolve())


if __name__ == "__main__":
    sys.exit(main() or 0)
