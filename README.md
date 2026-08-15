# 港股经纪商持股追踪（CCASS 版）

记录每只主板港股的**前十大 CCASS 经纪商持股比例**，追踪汇丰、摩根大通、高盛、瑞银等**世界著名机构投行**的持股比例变化，当某机构**跌出前十**时自动标注「**主力出货**」预警。

本仓库基于 [DeepSeek 分享的对话](https://chat.deepseek.com/share/5ucmy56wc22s28lcge) 中的单页仪表盘改造：**去掉了硬编码的示例数据**，改为由 Python 脚本从港交所 CCASS 抓取真实数据写入 JSON，前端再读取展示。

```
经纪持股变化/
├── index.html              # 旧版仪表盘（纯静态，仅留档；日常使用 ccass-tracker-web）
├── analyze.js              # 量化分析引擎（机构合力分 → 投资建议，旧版前端用）
├── fetch_ccass.py          # CCASS 全量抓取脚本（首次建库用）
├── update.py               # 增量更新脚本（日常追加用，月级缓存 + 同月取最新）
├── requirements.txt        # Python 依赖：requests / beautifulsoup4 / lxml
├── vercel.json             # Vercel 部署配置（静态目录指向 ccass-tracker-web/dist）
├── data/
│   ├── holdings.json       # 唯一数据源（紧凑 JSON；前端副本由 CI 构建前复制）
│   └── raw_cache/          # update.py 的按月原始缓存（<code>.json）
├── ccass-tracker-web/      # 主前端：React 19 + Vite（CI 每日构建并部署到 Vercel）
│   └── public/data/        #   holdings.json 不进 git，本地开发手动复制（见下）
├── ccass-tracker-mobile/   # 移动端 H5（手机优先布局；尚未接入 CI 部署）
└── .github/workflows/      # 每日抓数 → 提交 → 构建 → 部署 Vercel
```

> 本地开发前端时，先同步数据（该副本已从 git 移除，避免仓库里躺过期数据）：
> ```bash
> cp data/holdings.json ccass-tracker-web/public/data/holdings.json
> cp data/holdings.json ccass-tracker-mobile/public/data/holdings.json   # 移动端同理
> ```

---

## 快速开始

### 1. 安装依赖（只需一次）

```bash
pip install -r requirements.txt
```

### 2. 抓取真实持仓数据

```bash
# 抓取腾讯(00700)、阿里(09988) 近 12 个月数据（默认并入 data/holdings.json）
# 最新采样日自动取「今天 −1，遇周末取上周五」（港交所网页最大可选日），无需手填 -d
python fetch_ccass.py -c 00700 09988 -m 12

# 只验证单只股票、只取最近一个月（最快）
python fetch_ccass.py -c 00700 -m 1

# 指定结束日期 / 取前 20 名 / 覆盖式输出
python fetch_ccass.py -c 00700 01810 -m 6 -d 2026-07-31 -n 20 --replace
```

> ⚠️ **关于采样日期（以港交所网页为准）**：实测查询页的隐藏字段 `today=今天`，而**日期栏默认/最大可选日 = 今天 − 1**（遇周末取上周五）。即「今天能查到的最新持仓 = 昨天的工作日数据」。
>
> 例：今天 **7/31(周五) → 最新可查 7/30(周四)**；今天周一 → 上周五；今天周六/周日 → 上周五。
>
> 因此脚本默认把最新采样日设为「**今天 −1，遇周末回退到上周五**」（不依赖节假日表，仅按周末推算），日志会打印实际采用的日期。即使你 `-d` 指定更晚的日期，也会自动回退。若**凌晨（交易日 08:30 前）运行**，会再退一天（因为昨天的数据 08:30 左右才发布）。如确需查「今天」本身（明知可能无数据），加 `--allow-today`。

脚本会向港交所 `searchsdw.aspx` 发请求（先 GET 取表单状态，再 POST 查询），解析「前 N 名参与者」，并把其中匹配的知名投行打上追踪标记，最终写出 `data/holdings.json`。

> 默认每次请求之间 **≥ 1 秒**间隔（礼貌限速，请勿调低）。股票多、月份多时耗时较长，属正常。

### 2.5（推荐）增量更新：`update.py`

`fetch_ccass.py` 每次都「从头全量抓取」，适合首次建库。日常追加最新数据请用 **`update.py`**——它维护一份按「股票 × 自然月」的原始缓存，**同一个月内多次抓取只保留最新一次**，已缓存的月份不重复请求：

```bash
# 日常增量更新：只抓「最新自然月」(+ 任何新月份)，其余月份走缓存
python update.py -c 00700 09988 01810 -m 12

# 强制刷新最近 N 个月（即便缓存命中也重抓）
python update.py -c 00700 -m 12 --refresh-recent 3

# 强制重抓某只股票全部月份（忽略缓存）
python update.py -c 00700 -m 12 --refresh-all

# 仅用现有缓存重建 holdings.json，不发起任何网络请求（秒级完成）
python update.py -c 00700 09988 --rebuild-only
```

**工作原理：**
- 原始每日数据缓存在 `data/raw_cache/<code>.json`，按 `YYYY-MM` 索引，并记录「该月实际抓到的日期」；
- 默认 `--refresh-recent 1`：最新一个自然月**总是刷新**（拿到该月最新一天的数据），其余命中缓存；
- 同一自然月再次抓到更新的数据 → 覆盖旧值（**同月取最新**）；
- 最后用缓存数据重建 `holdings.json`（复用 `fetch_ccass.py` 的全部 build 逻辑）。

`holdings.json` 中每只股票多了一个 `dataDates` 字段（各自然月实际抓取到的日期），便于核对「同月取最新」是否生效。

### 3. 用本地静态服务打开页面（重要）

```bash
python -m http.server 8000
```

然后浏览器访问 **http://localhost:8000/**。

> ⚠️ **不要直接双击 `index.html`**。`file://` 协议下，浏览器会因 **CORS** 拦截 `fetch('data/holdings.json')`，页面会显示「无法加载持仓数据」。必须用上面的本地服务通过 `http://` 打开。

---

## 输入任意股票代码

页面顶部除了下拉框，还有一个「**或输入代码**」框 + 「**＋ 查询此股票**」按钮：

- 若 `holdings.json` 中**已有**该代码 → 直接切换显示；
- 若**没有** → 因浏览器无法跨域直连 CCASS，页面会提示你运行对应命令，例如：
  ```bash
  python fetch_ccass.py -c 01810 -m 12
  ```
  抓取后刷新页面即可在下拉框看到该股票。

（如需在浏览器内「现查现显示」，可在脚本基础上加一个极简本地代理，见下文「可选：本地代理」。）

---

## 功能说明

- **股票选择**：下拉框切换已有股票，或键盘 ← / → 方向键切换。
- **前十大经纪商排名表**：当前月份的持股比例、环比变化；被追踪的投行（汇丰/摩根大通/高盛/瑞银/花旗/美林/巴克莱/摩根士丹利）高亮并标「★ 追踪」。
- **机构持股比例变化图**：各投行近 N 个月的趋势折线；当前**跌出前十**的投行线条变为**虚线**并在末端红点标记。
- **跌出前十 / 主力出货预警**：当某投行上月在前十、本月不在，且**连续减持**满足阈值时，顶部横幅与表格下方会显示「**主力出货**」警示。
- **数据时效标识**：信息药丸里显示「数据月」与「更新时间」；若读到的 `generatedAt` 含「示例」字样，页面会提示当前为**示例数据**。

---

## 数据口径与局限（如实告知）

1. **CCASS 只统计在中央结算系统内登记的股份**，不含以实物证书持有的部分，因此「占比」是「占总发行股本」，与真实流通筹码口径略有差异。
2. **月度趋势**取「每月最后一天」的数据点；若该日非交易日或数据未更新，该月会缺值（图表对应位置留空），脚本会在 `failedMonths` 中记录。
3. **知名投行的 CCASS 参与者 ID** 位于 `fetch_ccass.py` 的 `TRACKED_PARTICIPANTS`。⚠️ **这些是参考值，请务必到港交所官方「List of CCASS Participants」核对后修正**——这是唯一需要你本地确认的环节。未命中 ID 的，脚本会用名称关键词兜底识别。
4. **市值/股价**不在 CCASS 数据中，`marketCap`/`price` 留空；如需要可自行接入行情接口填充。

---

## 解析选择器排查（抓不到数据时）

若脚本运行后某股票 `failedMonths` 很满或全空，可能是结果页 DOM 与解析逻辑不匹配：

1. 用浏览器手动打开 `https://www3.hkexnews.hk/sdw/search/searchsdw.aspx`，输入同样的代码+日期，确认**确实有结果**。
2. 在结果页按 F12，定位参与者表格的 HTML 结构。
3. 对比 `fetch_ccass.py` 中 `parse_results()` 的「行扫描」与 `_parse_div_fallback()`：
   - 当前行扫描逻辑识别「第 1 列形如 `字母+4~6位数字` 的参与者 ID 行」，并从中找「带 % 的占比列」与「纯数字的持股量列」。
   - 若新版页面改用 `<div>` 结构，请按实际选择器补全 `_parse_div_fallback()`。
4. 临时调试：在 `query()` 里把 `r.text` 写到一个本地 html 文件查看。

---

## ⚠️ 合规提示

- 港交所网站使用条款对**自动化抓取有限制**。本脚本**仅供个人学习与研究**，请**控制频率、勿并发、勿商用**。
- 商业用途请先咨询合规并取得授权，或改用官方/付费数据源（如 Refinitiv、Bloomberg 等）。

---

## 可选：本地代理（在浏览器内现查现显示）

> 默认不启用，避免引入额外依赖。仅当你希望页面里「查询此股票」按钮能直接拿到数据时使用。

在 `fetch_ccass.py` 基础上加一个最小 Flask 端点（需 `pip install flask`）：

```python
# fetch_ccass_serve.py（自行新建）
from flask import Flask, request, jsonify
from fetch_ccass import CcassClient, fetch_stock, month_ends
from datetime import date

app = Flask(__name__)

@app.get("/api/fetch")
def api_fetch():
    code = request.args.get("code", "")
    m = int(request.args.get("months", "1"))
    client = CcassClient()
    client.load_form()
    res = fetch_stock(client, code, month_ends(m, date.today()), top_n=10)
    return jsonify(res)
```

然后把页面里「查询此股票」按钮的点击逻辑改为 `fetch('/api/fetch?code=' + code)` 拉取单只数据后渲染即可。完成后 `python fetch_ccass_serve.py` 启动，前端访问 `http://localhost:5000`。

---

## 依赖版本

见 `requirements.txt`：`requests`、`beautifulsoup4`、`lxml`。Python 3.8+。

---

## CI：每日抓数，push 即自动部署

> 架构（2026-08-15 起）：**CI 只负责数据，部署全部交给 Vercel Git 集成**。
> 任何 push 到 `main`（含 CI 的每日数据提交）→ Vercel 自动拉取仓库、按
> `ccass-tracker-web/vercel.json` 构建（复制 `data/holdings.json` → vite build）→ 发布生产。
> 不需要任何部署密钥（GitHub Secrets 已清空），前端构建失败会收到 Vercel 邮件通知。

GitHub Actions 工作流 `.github/workflows/daily-update.yml` 在**每个交易日（北京时间 09:00）**自动执行：

1. `update.py` 增量抓取 29 只监控股票的最新 CCASS 数据（历史月份走缓存，只有最新月发请求）；
2. 数据有实质变化则 commit + push（无变化不提交，也不触发部署——`generatedAt` 只在数据真变时更新）；
3. push 触发 Vercel 自动构建部署，1-2 分钟后线上更新。

**访问地址**（Vercel 后台 → 项目 → Settings → Domains 可管理）：

| 域名 | 说明 |
|------|------|
| `ccass.jeremyyu.top` | 自定义域名（国内友好，推荐使用） |
| `ccass-tracker.vercel.app` | Vercel 默认域名（国内访问不稳定） |

**Vercel 项目关键设置**（改动了要在后台同步检查）：

- Root Directory = `ccass-tracker-web`，Framework = Vite
- 构建配置在 `ccass-tracker-web/vercel.json`（构建时自动复制数据文件）

### 当前监控股票清单（29 只）

`00020 00100 00148 00300 00700 01288 01347 01548 01810 01815 01888 02359 02388 02513 02723 02865 03308 03317 03986 06181 06809 06869 06915 06990 09606 09660 09880 09903 09988`

改 `.github/workflows/daily-update.yml` 里 `update.py -c ...` 那行的股票代码即可增删。
