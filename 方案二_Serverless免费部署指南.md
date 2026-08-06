<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>方案二：Serverless 免费部署指南 - MD文档导出</title>
    <style>
        :root {
            --bg: #0d1117;
            --surface: #161b22;
            --border: #30363d;
            --text: #c9d1d9;
            --green: #3fb950;
            --red: #f85149;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: var(--bg);
            color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }
        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 2.5rem;
            max-width: 680px;
            width: 100%;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            text-align: center;
        }
        .icon { font-size: 3rem; margin-bottom: 1rem; }
        h1 { font-size: 1.6rem; margin-bottom: 0.75rem; color: #f0f6fc; }
        p { color: #8b949e; line-height: 1.6; margin-bottom: 1.5rem; font-size: 0.95rem; }
        .file-info {
            background: #0d1117;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 12px;
            text-align: left;
        }
        .file-icon { font-size: 2rem; flex-shrink: 0; }
        .file-name { font-weight: 600; color: #f0f6fc; word-break: break-all; }
        .file-meta { font-size: 0.8rem; color: #8b949e; margin-top: 4px; }
        .btn-group { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 14px 28px;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            border: none;
            text-decoration: none;
        }
        .btn-primary { background: var(--green); color: #fff; }
        .btn-primary:hover { background: #2ea043; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(63,185,80,0.3); }
        .btn-secondary { background: #21262d; color: #c9d1d9; border: 1px solid var(--border); }
        .btn-secondary:hover { background: #30363d; }
        .btn:active { transform: translateY(0); }
        .secondary-text { font-size: 0.82rem; color: #6e7681; margin-top: 1rem; }
        #copyArea {
            display: none;
            width: 100%;
            height: 200px;
            margin-top: 1.5rem;
            background: #0d1117;
            color: #c9d1d9;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 0.8rem;
            resize: vertical;
        }
        .alert {
            display: none;
            margin-top: 1rem;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            font-size: 0.9rem;
        }
        .alert-warning { background: rgba(248,81,73,0.15); color: var(--red); border: 1px solid rgba(248,81,73,0.4); }
        .alert-success { background: rgba(63,185,80,0.15); color: var(--green); border: 1px solid rgba(63,185,80,0.4); }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">☁️</div>
        <h1>方案二：Serverless 免费部署指南</h1>
        <p>Vercel + GitHub Actions + Supabase 组合，零服务器运维，实现港股CCASS看板定时增量更新与内部访问。</p>

        <div class="file-info">
            <span class="file-icon">📄</span>
            <div>
                <div class="file-name">方案二_Serverless免费部署指南.md</div>
                <div class="file-meta">Markdown · 约 18 KB · 适用于提交给AI辅助编写代码</div>
            </div>
        </div>

        <div class="btn-group">
            <button class="btn btn-primary" id="downloadBtn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载 MD 文件
            </button>
            <button class="btn btn-secondary" id="copyBtn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                复制全文并手动保存
            </button>
        </div>

        <div class="alert alert-warning" id="alertWarning"></div>
        <div class="alert alert-success" id="alertSuccess"></div>

        <textarea id="copyArea" readonly></textarea>
        <p class="secondary-text">
            <strong>下载说明：</strong>部分浏览器或AI内嵌浏览器可能屏蔽自动下载。<br>
            请优先使用<strong>"复制全文"</strong>按钮，然后将内容粘贴到本地文本编辑器中，保存为 <code>.md</code> 文件即可。
        </p>
    </div>

    <script>
        const mdContent = '# 方案二：Serverless 免费部署指南（Vercel + GitHub Actions + Supabase）\n' +
            '\n' +
            '无需管理服务器，使用免费云服务搭建港股CCASS看板，实现定时增量更新与内部访问。\n' +
            '\n' +
            '## 整体架构\n' +
            '```\n' +
            '定时任务层: GitHub Actions (每日 18:00 CST) → 运行 Python 采集脚本\n' +
            '数据库层: Supabase (PostgreSQL) → ccass_holdings / institution_tracking / update_log\n' +
            '前端托管层: Vercel (静态 HTML + JS) → 直接通过 Supabase Client 读取数据\n' +
            '```\n' +
            '\n' +
            '## 一、Supabase 数据库创建\n' +
            '\n' +
            '### 1.1 注册 Supabase\n' +
            '前往 [supabase.com](https://supabase.com) 用 GitHub 账户注册。\n' +
            '免费计划包含：500 MB 数据库，无限 API 请求，自动生成的 RESTful API。\n' +
            '\n' +
            '### 1.2 创建项目\n' +
            '点击 "New project"，输入项目名（如 `ccass-monitor`），设置数据库密码，选择区域（推荐 Singapore），等待数据库就绪。\n' +
            '\n' +
            '### 1.3 执行建表 SQL\n' +
            '进入项目的 **SQL Editor**，执行以下语句：\n' +
            '\n' +
            '```sql\n' +
            'CREATE TABLE ccass_holdings (\n' +
            '    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n' +
            '    trade_date DATE NOT NULL,\n' +
            '    stock_code VARCHAR(10) NOT NULL,\n' +
            '    participant_name VARCHAR(200) NOT NULL,\n' +
            '    shareholding BIGINT DEFAULT 0,\n' +
            '    percentage DECIMAL(10,6) DEFAULT 0,\n' +
            '    rank_position INTEGER DEFAULT 0,\n' +
            '    created_at TIMESTAMPTZ DEFAULT NOW()\n' +
            ');\n' +
            '\n' +
            'CREATE TABLE institution_tracking (\n' +
            '    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n' +
            '    trade_date DATE NOT NULL,\n' +
            '    stock_code VARCHAR(10) NOT NULL,\n' +
            '    institution_id VARCHAR(50) NOT NULL,\n' +
            '    institution_name VARCHAR(200),\n' +
            '    shareholding BIGINT DEFAULT 0,\n' +
            '    percentage DECIMAL(10,6) DEFAULT 0,\n' +
            '    rank_position INTEGER DEFAULT 0,\n' +
            '    change_from_prev DECIMAL(10,6) DEFAULT 0,\n' +
            '    is_top10 BOOLEAN DEFAULT FALSE,\n' +
            '    alert_triggered BOOLEAN DEFAULT FALSE,\n' +
            '    created_at TIMESTAMPTZ DEFAULT NOW()\n' +
            ');\n' +
            '\n' +
            'CREATE TABLE update_log (\n' +
            '    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n' +
            '    trade_date DATE,\n' +
            '    stock_code VARCHAR(10),\n' +
            '    status VARCHAR(20),\n' +
            '    records_count INTEGER DEFAULT 0,\n' +
            '    error_message TEXT,\n' +
            '    started_at TIMESTAMPTZ DEFAULT NOW(),\n' +
            '    completed_at TIMESTAMPTZ\n' +
            ');\n' +
            '\n' +
            'CREATE INDEX idx_holdings_date ON ccass_holdings(trade_date);\n' +
            'CREATE INDEX idx_holdings_stock ON ccass_holdings(stock_code, trade_date);\n' +
            'CREATE INDEX idx_tracking_inst ON institution_tracking(institution_id, trade_date);\n' +
            '```\n' +
            '\n' +
            '### 1.4 获取 API 密钥\n' +
            '进入 **Settings → API**，复制 `URL` 和 `anon` public key，备用。\n' +
            '\n' +
            '## 二、GitHub 仓库与 Actions 定时任务\n' +
            '\n' +
            '### 2.1 仓库结构\n' +
            '```\n' +
            'ccass-tracker/\n' +
            '├── collector/\n' +
            '│   ├── config.py\n' +
            '│   ├── main.py\n' +
            '│   └── requirements.txt\n' +
            '├── frontend/\n' +
            '│   └── index.html\n' +
            '└── .github/\n' +
            '    └── workflows/\n' +
            '        └── daily-update.yml\n' +
            '```\n' +
            '\n' +
            '### 2.2 采集脚本 (config.py)\n' +
            '```python\n' +
            'import os\n' +
            '\n' +
            'SUPABASE_URL = os.environ.get("SUPABASE_URL")\n' +
            'SUPABASE_KEY = os.environ.get("SUPABASE_KEY")  # service_role key\n' +
            '\n' +
            'MONITORED_STOCKS = [\n' +
            '    {"code": "00700", "name": "腾讯控股"},\n' +
            '    {"code": "09988", "name": "阿里巴巴-SW"},\n' +
            '    # ... 其他股票\n' +
            ']\n' +
            '\n' +
            'TRACKED_INSTITUTIONS = {\n' +
            '    "hsbc": {"name": "汇丰银行", "keywords": ["hsbc", "汇丰"]},\n' +
            '    "jpmorgan": {"name": "摩根大通", "keywords": ["jpmorgan", "摩根大通"]},\n' +
            '    # ... 其他投行\n' +
            '}\n' +
            '```\n' +
            '\n' +
            '### 2.3 主脚本 (main.py)\n' +
            '```python\n' +
            'import time, logging\n' +
            'from datetime import datetime\n' +
            'from supabase import create_client\n' +
            'import config\n' +
            '\n' +
            'logging.basicConfig(level=logging.INFO)\n' +
            'supabase = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)\n' +
            '\n' +
            'def collect_stock_data(stock_code, trade_date):\n' +
            '    # 1. 下载/读取CSV\n' +
            '    # 2. 解析CSV\n' +
            '    # 3. supabase.table("ccass_holdings").upsert(records).execute()\n' +
            '    # 4. 识别机构，计算变化，插入institution_tracking\n' +
            '    # 5. 记录日志\n' +
            '\n' +
            'def daily_update(date_str=None):\n' +
            '    date_str = date_str or datetime.now().strftime("%Y-%m-%d")\n' +
            '    for stock in config.MONITORED_STOCKS:\n' +
            '        collect_stock_data(stock["code"], date_str)\n' +
            '        time.sleep(2)\n' +
            '\n' +
            'if __name__ == "__main__":\n' +
            '    daily_update()\n' +
            '```\n' +
            '\n' +
            '### 2.4 GitHub Actions 工作流\n' +
            '在 `.github/workflows/daily-update.yml`：\n' +
            '```yaml\n' +
            'name: Daily CCASS Update\n' +
            '\n' +
            'on:\n' +
            '  schedule:\n' +
            '    - cron: "0 10 * * 1-5"   # 工作日 UTC 10:00 (北京时间 18:00)\n' +
            '  workflow_dispatch:\n' +
            '\n' +
            'jobs:\n' +
            '  update:\n' +
            '    runs-on: ubuntu-latest\n' +
            '    steps:\n' +
            '      - uses: actions/checkout@v4\n' +
            '      - uses: actions/setup-python@v5\n' +
            '        with:\n' +
            '          python-version: "3.10"\n' +
            '      - run: pip install -r collector/requirements.txt\n' +
            '      - name: Run collector\n' +
            '        env:\n' +
            '          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}\n' +
            '          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}\n' +
            '        run: python collector/main.py\n' +
            '```\n' +
            '\n' +
            '### 2.5 添加 Secrets\n' +
            '在仓库 Settings → Secrets → Actions 中添加：\n' +
            '- `SUPABASE_URL`：Supabase 项目 URL\n' +
            '- `SUPABASE_KEY`：**service_role** key（具备写入权限）\n' +
            '\n' +
            '## 三、前端看板开发\n' +
            '\n' +
            '### 3.1 引入 Supabase 客户端\n' +
            '```html\n' +
            '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n' +
            '```\n' +
            '\n' +
            '### 3.2 初始化连接\n' +
            '```javascript\n' +
            'const supabase = window.supabase.createClient(\n' +
            '  "https://your-project.supabase.co",\n' +
            '  "your-anon-key"\n' +
            ');\n' +
            '```\n' +
            '\n' +
            '### 3.3 数据查询函数\n' +
            '```javascript\n' +
            '// 获取前十持仓\n' +
            'async function fetchTop10(stockCode, date) {\n' +
            '  const { data } = await supabase\n' +
            '    .from("ccass_holdings")\n' +
            '    .select("*")\n' +
            '    .eq("stock_code", stockCode)\n' +
            '    .eq("trade_date", date)\n' +
            '    .order("rank_position")\n' +
            '    .limit(10);\n' +
            '  return data;\n' +
            '}\n' +
            '\n' +
            '// 获取机构趋势\n' +
            'async function fetchInstitutionTrend(stockCode, days = 90) {\n' +
            '  const start = new Date(Date.now() - days*86400000)\n' +
            '    .toISOString().split("T")[0];\n' +
            '  const { data } = await supabase\n' +
            '    .from("institution_tracking")\n' +
            '    .select("*")\n' +
            '    .eq("stock_code", stockCode)\n' +
            '    .gte("trade_date", start)\n' +
            '    .order("trade_date");\n' +
            '  return data;\n' +
            '}\n' +
            '\n' +
            '// 获取预警\n' +
            'async function fetchAlerts() {\n' +
            '  const { data } = await supabase\n' +
            '    .from("institution_tracking")\n' +
            '    .select("*")\n' +
            '    .eq("alert_triggered", true)\n' +
            '    .order("trade_date", { ascending: false })\n' +
            '    .limit(50);\n' +
            '  return data;\n' +
            '}\n' +
            '```\n' +
            '\n' +
            '### 3.4 集成到原有图表\n' +
            '将上述函数的真实数据替换硬编码的模拟数据，驱动表格和 Chart.js 图表即可。\n' +
            '\n' +
            '## 四、部署到 Vercel\n' +
            '\n' +
            '### 4.1 部署步骤\n' +
            '1. 登录 [Vercel.com](https://vercel.com)，用 GitHub 账户授权。\n' +
            '2. 点击 **Add New Project**，导入 GitHub 仓库。\n' +
            '3. 框架预设选 **Other**，输出目录设为 `frontend`（若前端在该子目录）。\n' +
            '4. 环境变量添加：\n' +
            '   - `SUPABASE_URL` → 你的 Supabase URL\n' +
            '   - `SUPABASE_ANON_KEY` → anon public key\n' +
            '5. 点击部署，获得 `https://xxx.vercel.app` 访问地址。\n' +
            '\n' +
            '## 五、访问控制与安全（内部使用）\n' +
            '\n' +
            '### 5.1 简易密码保护\n' +
            '在 `index.html` 中加入：\n' +
            '```javascript\n' +
            'const pw = prompt("请输入访问密码");\n' +
            'if (pw !== "内部设定的密码") {\n' +
            '  document.body.innerHTML = "拒绝访问";\n' +
            '  throw new Error("Unauthorized");\n' +
            '}\n' +
            '```\n' +
            '\n' +
            '### 5.2 IP 限制（可选）\n' +
            'Vercel 免费版不支持 IP 白名单。如需更严格限制，可：\n' +
            '- 使用 Cloudflare Access（免费）为域名添加身份验证。\n' +
            '- 或将前端也部署到 Oracle 免费 VPS（方案一）并设置防火墙规则。\n' +
            '\n' +
            '## 六、免费额度与注意事项\n' +
            '\n' +
            '| 服务 | 免费额度 | 注意 |\n' +
            '|------|---------|------|\n' +
            '| Supabase | 500 MB 数据库，无限 API | 定期清理旧数据 |\n' +
            '| GitHub Actions | 公共仓库每月 2000 分钟 | 仅工作日 UTC 10:00 触发 |\n' +
            '| Vercel | 无限静态网站，100 GB 带宽/月 | 商业使用请遵守条款 |\n' +
            '| 采集脚本 | 依赖港交所网站 | 若无法自动下载，请手动上传 CSV |\n' +
            '\n' +
            '## 七、首次运行\n' +
            '1. 在 GitHub Actions 中手动触发 `Daily CCASS Update` 测试。\n' +
            '2. 检查 Supabase 表格是否已有数据。\n' +
            '3. 打开 Vercel 前端，确认看板正常显示。\n' +
            '\n' +
            '---\n' +
            '\n' +
            '通过以上步骤，即可零成本搭建一个公司内部可用的港股CCASS持股追踪看板，实现全自动每日更新。\n';

        const downloadBtn = document.getElementById('downloadBtn');
        const copyBtn = document.getElementById('copyBtn');
        const copyArea = document.getElementById('copyArea');
        const alertWarning = document.getElementById('alertWarning');
        const alertSuccess = document.getElementById('alertSuccess');

        function hideAlerts() {
            alertWarning.style.display = 'none';
            alertSuccess.style.display = 'none';
        }

        // 方案1：Blob 下载
        function downloadBlob() {
            hideAlerts();
            try {
                const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Serverless部署指南.md';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                // 延迟清理，确保下载触发
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 200);
                alertSuccess.textContent = '✅ 下载已触发，请检查浏览器下载列表。若未弹出，请用"复制全文"按钮。';
                alertSuccess.style.display = 'block';
            } catch (e) {
                alertWarning.textContent = '❌ 自动下载被浏览器拦截，请使用下方"复制全文"按钮手动保存。';
                alertWarning.style.display = 'block';
                console.error('下载失败:', e);
            }
        }

        // 方案2：直接打开 MD 内容为新页面（部分浏览器会显示下载提示）
        function downloadDataUri() {
            hideAlerts();
            try {
                const dataUri = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(mdContent);
                const newWindow = window.open(dataUri, '_blank');
                if (!newWindow || newWindow.closed) {
                    // 被拦截，回退到复制
                    fallbackToCopy('浏览器阻止了弹出窗口，请允许弹出后重试，或使用"复制全文"按钮。');
                } else {
                    alertSuccess.textContent = '✅ 新页面已打开，请在页面中右键 → 另存为 .md 文件。';
                    alertSuccess.style.display = 'block';
                }
            } catch (e) {
                fallbackToCopy('打开新页面失败，请使用"复制全文"按钮。');
            }
        }

        function fallbackToCopy(msg) {
            alertWarning.textContent = '⚠️ ' + msg;
            alertWarning.style.display = 'block';
            copyArea.value = mdContent;
            copyArea.style.display = 'block';
        }

        // 主下载按钮：先尝试 Blob，若失败则尝试 Data URI
        downloadBtn.addEventListener('click', () => {
            downloadBlob();
        });

        // 复制全文功能
        copyBtn.addEventListener('click', () => {
            hideAlerts();
            copyArea.value = mdContent;
            copyArea.style.display = 'block';
            copyArea.select();
            copyArea.setSelectionRange(0, 99999);

            try {
                navigator.clipboard.writeText(mdContent).then(() => {
                    alertSuccess.textContent = '✅ 全文已复制到剪贴板！请打开文本编辑器（记事本/VSCode），粘贴并保存为 .md 文件。';
                    alertSuccess.style.display = 'block';
                }).catch(() => {
                    alertWarning.textContent = '⚠️ 自动复制失败，请手动选中下方文本框内容，按 Ctrl+C 复制。';
                    alertWarning.style.display = 'block';
                });
            } catch (e) {
                alertWarning.textContent = '⚠️ 请手动选中下方文本框内容并复制（Ctrl+C 或右键复制）。';
                alertWarning.style.display = 'block';
            }
        });

        // 页面加载时提示
        console.log('💡 提示：如果下载按钮无效，请使用"复制全文"按钮，手动保存为 .md 文件。');
    </script>
</body>
</html>