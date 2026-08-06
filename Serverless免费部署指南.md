# Serverless 免费部署指南：港股 CCASS 持股变化看板

零服务器、零数据库、零成本，把本地的「经纪持股变化」看板部署成公司内部可访问的网站，并实现**每个交易日自动更新**。

## 整体架构（免费方案）

```
GitHub Actions 定时任务（工作日 18:00 北京时间）
   └─→ 运行 python update.py（增量抓取港交所 CCASS 数据）
         └─→ 更新 data/holdings.json 并 git commit + push
               └─→ Vercel 检测到 push → 自动重新部署静态站点
                     └─→ https://xxx.vercel.app 网页读取 data/holdings.json 渲染看板
```

- **定时任务层**：GitHub Actions，每天自动跑抓取脚本，无需自己开着电脑
- **数据层**：直接是仓库里的 `data/holdings.json`（Git 本身就是数据库，天然带历史版本）
- **托管层**：Vercel 静态托管，浏览器直接读取 JSON，无后端

> 相比原方案最大的简化：**不需要 Supabase 数据库**。你的项目本来就是「脚本抓数据 → 写 JSON → 前端读 JSON」，让 GitHub Actions 替你跑脚本、提交 JSON 即可，链路更短、故障点更少。

---

## 一、推送项目到 GitHub

1. 注册 GitHub 账号，新建一个**私有仓库**（Private），例如 `ccass-tracker`，不要勾选自动生成 README。
2. 在项目根目录执行：

```bash
git init
git add .
git commit -m "init: ccass holdings dashboard"
git branch -M main
git remote add origin https://github.com/<你的用户名>/ccass-tracker.git
git push -u origin main
```

> 重要：**把 `data/` 目录一起提交**。`update.py` 的月级缓存（`data/raw_cache/`）提交进仓库后，CI 每次运行时历史月份直接命中缓存，只抓最新一个月，又快又不给港交所添负担。

---

## 二、GitHub Actions：每日自动更新

### 2.1 创建工作流文件

在仓库中新建 `.github/workflows/daily-update.yml`：

```yaml
name: Daily CCASS Update

on:
  schedule:
    - cron: "0 10 * * 1-5"   # 工作日 UTC 10:00 = 北京时间 18:00
  workflow_dispatch:         # 支持手动触发

permissions:
  contents: write            # 允许机器人提交数据

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run incremental update
        # 换成你要监控的股票；-m 12 保留最近 12 个自然月
        run: python update.py -c 00700 09988 01810 -m 12

      - name: Commit updated data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/holdings.json data/raw_cache
          # 若无变化（如非交易日/数据未发布）则不提交，也不会触发重新部署
          git diff --cached --quiet || git commit -m "chore: update ccass data $(date +%Y-%m-%d)"
          git push
```

### 2.2 工作原理与细节

- **时间选择**：港交所 CCASS 数据每个交易日约 08:30（香港时间）发布「昨天」的数据，脚本会自动按「今天 −1、遇周末回退」选取最新可查日；安排 18:00 运行留足余量，工作日 5 天各跑一次。
- **幂等提交**：`git diff --cached --quiet || git commit ...` 保证「没有新数据就不提交、不触发部署」，不会产生空提交刷版本。
- **GITHUB_TOKEN 足够**：工作流用内置的 `GITHUB_TOKEN` 即可完成提交推送，无需创建 Personal Access Token（前提是声明 `permissions: contents: write`）。
- **私有仓库配额**：免费套餐每月 2000 分钟；单次运行约 2–3 分钟，一个月约 22 次约 70 分钟，远远用不完。若用公开仓库则无限分钟（看板数据本身是公开行情，公开仓库也可接受，但**访问控制**见第四节）。
- **改股票清单**：直接改 `update.py` 的 `-c` 参数，或加一个环境变量/配置文件按需调整。

---

## 三、Vercel：托管静态站点

1. 登录 [vercel.com](https://vercel.com)，用 GitHub 账号授权（只需勾选刚才的 `ccass-tracker` 仓库）。
2. **Add New Project → Import** `ccass-tracker`。
3. Framework Preset 选 **Other**；Root Directory 保持 `/`（项目根目录）；Build Command / Output 留空（纯静态）。
4. 点 **Deploy**，几秒后得到 `https://ccass-tracker.vercel.app`。
5. 以后每次 push（包括 GitHub Actions 提交的数据更新）Vercel **自动重新部署**，无需任何手工操作。

> 本地验证一致：Vercel 部署的实际上就是 `index.html` + `data/holdings.json`，与本地 `python -m http.server 8000` 效果相同。

---

## 四、访问控制（内部使用）

> 先说清一个事实：Vercel 免费版**没有 IP 白名单、没有 Basic Auth**，且看板数据是**公开静态文件**——前端加密码只能挡住页面，懂行的人直接访问 `https://xxx.vercel.app/data/holdings.json` 照样能拿到数据。CCASS 数据本身是公开行情，无个人隐私，通常可接受；若公司要求严格，选以下方式：

| 方案 | 成本 | 说明 |
|------|------|------|
| 前端简单密码（`prompt` 或登录页） | 免费 | 防君子不防小人，挡普通访客；数据文件仍可被直接访问 |
| **Cloudflare 代理 + Cloudflare Access** | 免费（最多 50 用户） | 把自定义域名解析到 Cloudflare，套上 Access 登录验证（邮箱验证码/GitHub 登录），能真正挡住包括 JSON 在内的一切访问；适合公司内部 |
| 私有仓库 + 只信任域名 | 免费 | 最简单：数据不敏感、只给同事发链接即可 |

Cloudflare Access 简要步骤（可选）：在 Cloudflare 添加站点（需一个域名）→ 把 `ccass-tracker.vercel.app` 的访问通过 `Cloudflare 规则 → 重写 URL/代理` 指到 Vercel 部署（或用 CNAME 方式）→ 在 **Zero Trust → Access → Applications** 添加该域名并启用登录验证。Vercel 免费版也支持自定义域名绑定，可一并配置。

---

## 五、首次运行验证（端到端检查清单）

1. 仓库 `Actions` 页面 → 选中 `Daily CCASS Update` → **Run workflow** 手动触发一次。
2. 等待运行结束，查看日志：
   - `update.py` 应显示「最新参考日 → 调整为…」，并打印各股票抓取结果；
   - 最后应有 `chore: update ccass data ...` 的 commit 输出。
3. 回仓库 **Commits** 页确认数据提交成功；若提示 `data/holdings.json` 有变化，说明数据已更新。
4. Vercel **Deployments** 页应自动出现一次新部署；部署完成后打开网站，确认：
   - 看板正常渲染、无「无法加载持仓数据」提示；
   - 数据药丸显示的「数据月」是最新的。
5. 等第二个工作日 18:00，确认自动触发也正常。

> 若 Vercel 页面出现 CORS 报错（部署后跨域环境与本地不同），确认 `index.html` 用相对路径读取 `data/holdings.json`（而非绝对 URL）；相对路径在 Vercel 与本地均可用。

---

## 六、免费额度与注意事项

| 服务 | 免费额度 | 注意 |
|------|---------|------|
| GitHub Actions | 公开仓库不限；私有仓库 2000 分钟/月 | 每天 1 次约 3 分钟，月耗约 70 分钟，充足 |
| Vercel | 静态托管免费，100 GB 带宽/月 | 看板几十 KB 页面，随便用 |
| 港交所 CCASS | 无官方 API | 脚本已内置 ≥1 秒请求间隔，勿调低、勿并发、勿商用 |

注意事项：

- **港交所条款**：自动化抓取有限制，仅限个人学习与研究用途，商业使用请先取得授权。脚本已做礼貌限速。
- **解析失败**：若港交所改版导致抓不到数据，日志会出现 `failedMonths` 或警告，参考 `README.md` 的「解析选择器排查」章节；此时看板会显示旧数据，不会崩。
- **时区**：workflow 的 cron 用的是 UTC，`0 10 * * 1-5` 就是北京时间 18:00（夏令时不影响，香港无夏令时）。
- **新增股票**：改了 `-c` 参数后手动触发一次即可，无需动部署配置。
- **缓存即历史**：`data/holdings.json` 每次更新都会进 Git，等于自带全量历史版本，可随时回溯任一天的数据。

---

## 七、备选方案（如需更复杂的能力）

| 需求 | 方案 |
|------|------|
| 不想用 Vercel | GitHub Pages（同为免费，Actions 提交后自动发布，见 `peaceiris/actions-gh-pages` 等） |
| 需要按机构长期趋势分析、SQL 查询 | 在原方案基础上引入 Supabase（PostgreSQL），采集脚本写库、前端读库；代价是多一层维护 |
| 需要浏览器内「现查现显示」任意股票 | 在 Vercel 加一个 Serverless Function（Python/Node）做抓取代理，注意 Vercel 函数免费版有运行时长与外部请求限制 |

---

## 八、本指南对应的真实项目文件

| 文件 | 作用 |
|------|------|
| `update.py` | 日常增量更新：月级缓存 + 同月取最新，CI 每天跑它 |
| `fetch_ccass.py` | 首次全量抓取建库；`update.py` 复用了它的抓取与聚合逻辑 |
| `index.html` + `analyze.js` | 看板前端，读取 `data/holdings.json` 渲染 |
| `data/holdings.json` | 最终数据，随每次更新提交进 Git |
| `data/raw_cache/` | 按月原始缓存，提交进 Git 让 CI 复用、少抓历史 |
| `.github/workflows/daily-update.yml` | 每日自动更新工作流（本指南第二节） |
