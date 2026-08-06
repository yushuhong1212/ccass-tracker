# CCASS Tracker Web — 项目交接文档

> 文档日期：2026-08-01
> 作者：WorkBuddy AI 助手
> 目的：将 CCASS Tracker 从原始纯 HTML/JS 迁移到现代化 React 技术栈后，完整交接给下一位开发者

---

## 一、项目概述

### 1.1 项目目的
追踪港交所 CCASS（中央结算及交收系统）中著名机构（汇丰、花旗、高盛等 9 家）的经纪商持股比例变化，提供量化分析和投资建议。

### 1.2 与原始项目的关系
| 维度 | 原始项目 (`ccass-tracker/`) | 新版前端 (`ccass-tracker-web/`) |
|------|---------------------------|-------------------------------|
| 技术栈 | 纯 HTML + CSS + JS（单页 1227 行） | React 19 + TypeScript + Vite 7 |
| UI 框架 | 手写 CSS | Tailwind CSS 3 + shadcn/ui |
| 图表 | Chart.js | Recharts |
| 构建 | 无（浏览器直开 index.html） | Vite 构建 |
| 主题 | 仅暗色 | 浅色（默认）+ 暗色（`.dark` 类切换） |
| 数据来源 | `data/holdings.json` | `public/data/holdings.json`（同一份文件） |
| Python 后端 | `fetch_ccass.py`（不变） | 不涉及（纯前端） |

### 1.3 原始项目仓库
- GitHub: `https://github.com/yushuhong1212/ccass-tracker.git`
- 原始项目包含：`index.html`（旧版前端）、`fetch_ccass.py`（Python 数据抓取）、`analyze.js`（量化引擎）、`data/holdings.json`（持仓数据）

---

## 二、技术栈详情

| 层 | 技术 | 版本 | 说明 |
|----|------|------|------|
| 框架 | React | 19.2 | 函数组件 + Hooks |
| 语言 | TypeScript | 5.9 | strict 模式 |
| 构建 | Vite | 7.2 | dev/build/preview |
| 样式 | Tailwind CSS | 3.4 | + tailwindcss-animate |
| 组件库 | shadcn/ui | - | 50+ Radix UI 组件（`src/components/ui/`） |
| 图表 | Recharts | 2.15 | 折线图 |
| 图标 | Lucide React | 0.562 | 全量图标 |
| 字体 | IBM Plex Sans | - | Google Fonts |

**注意**：`tailwind.config.js` 中有两处 `colors` 键重复（第 7 行和第 55 行），后一个会覆盖前一个。这是有意为之——`bullish`/`bearish` 等金融语义色会覆盖 shadcn 默认色板。若需调整，注意合并而非追加。

---

## 三、目录结构

```
ccass-tracker-web/
├── public/
│   └── data/
│       └── holdings.json          # 持仓数据（从原始项目复制，由 Python 后端更新）
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui 基础组件（50+，不要手动改）
│   │   │   ├── card.tsx
│   │   │   ├── table.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── alert.tsx
│   │   │   └── ... (其余省略)
│   │   └── dashboard/             # 业务组件（本次开发的核心）
│   │       ├── Layout.tsx         # 布局：StockSelector + AlertBanner + InfoPills + DashboardTabs
│   │       ├── Tables.tsx         # 表格：Top10Table + GainerRanking + FullBrokerTable
│   │       ├── Charts.tsx         # 图表：HoldingsChart（Recharts 折线图）
│   │       ├── Analysis.tsx       # 分析：ForceGauge + ForceAnalysis
│   │       └── Scanner.tsx        # 扫描：StockScanner
│   ├── hooks/
│   │   └── use-ccass-data.ts      # 数据加载 hooks
│   ├── lib/
│   │   ├── analysis.ts            # 量化分析引擎（从 analyze.js 移植）
│   │   └── dashboard.ts           # 桶文件（统一 re-export）
│   ├── types/
│   │   └── ccass.ts               # TypeScript 类型定义 + 常量
│   ├── App.tsx                    # 根组件
│   ├── App.css                    # 空文件（仅占位）
│   ├── main.tsx                   # React 入口
│   └── index.css                  # 全局样式 + CSS 变量主题
├── index.html                     # HTML 入口
├── tailwind.config.js             # Tailwind 配置
├── package.json
├── tsconfig.json
├── vite.config.ts
└── dist/                          # 构建产物（npm run build 生成）
```

---

## 四、数据流

### 4.1 数据格式 (`holdings.json`)

```json
{
  "generatedAt": "2026-08-01T10:00:00",
  "months": ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01"],
  "stocks": {
    "00700": {
      "code": "00700",
      "name": "腾讯控股",
      "marketCap": "3.5万亿",
      "price": "380.00",
      "months": ["2025-09", ...],
      "dataDates": ["2025-09-15", ...],
      "trackedData": {
        "hsbc": [12.5, 12.3, 12.8, null, 13.1],
        "citigroup": [null, null, 8.2, 8.5, 8.3],
        ...
      },
      "top10Current": [...],
      "top10Prev": [...],
      "allParticipants": [...],
      "failedMonths": []
    }
  }
}
```

**关键字段说明**：
- `trackedData[instId]` — 9 家被追踪机构的持股百分比时间序列，`null` 表示当月无数据
- `allParticipants[]` — 所有经纪商的历史序列，元素含 `id`/`name`/`instId`/`series`/`shareholding`
- `instId` — 机构标识（如 `"hsbc"`, `"goldman"`），仅被追踪的 9 家有值，其余为 `null`

### 4.2 数据加载流程

```
浏览器请求 /data/holdings.json
    ↓
useCCASSData() hook
    ├── fetch('/data/holdings.json')
    ├── 检查 generatedAt 是否包含"示例"（防脏数据）
    └── 返回 { data, loading, error }
    ↓
App.tsx 根据状态渲染
    ├── loading → Skeleton 骨架屏
    ├── error → 错误提示 + 重试按钮
    ├── data.stocks 为空 → 空状态提示
    └── 正常 → 渲染完整仪表盘
```

### 4.3 状态管理
无全局状态库。组件间通过 props 传递，`App.tsx` 持有：
- `activeTab: 'dashboard' | 'scanner'` — 当前标签页
- `useStockSelector` — 当前选中股票代码、前后导航

---

## 五、核心类型定义 (`src/types/ccass.ts`)

### 5.1 数据接口

| 接口 | 用途 |
|------|------|
| `HoldingsData` | 顶层 JSON 结构 |
| `StockData` | 单只股票完整数据 |
| `TopParticipant` | 前十大经纪商条目 |
| `ParticipantSeries` | 单个经纪商全时间序列 |
| `StockAnalysis` | 量化分析结果 |
| `InstitutionMovement` | 单机构动向明细 |
| `ScanRow` | 多股扫描行 |

### 5.2 常量

```typescript
TRACKED_INSTITUTIONS: InstitutionMeta[]  // 9 家机构元数据
ACTION_CONFIG: Record<InstitutionAction, {label, color}>  // 动作标签映射
VERDICT_THRESHOLDS = { strongBuy: 55, buy: 20, watch: -20, reduce: -55 }
```

### 5.3 工具函数

```typescript
getVerdict(score: number) → { action, label }
// score >= 55 → 强烈买入, >= 20 → 买入, > -20 → 观望, > -55 → 减仓, else → 清仓
```

---

## 六、量化分析引擎 (`src/lib/analysis.ts`)

从原始 `analyze.js` 完整移植，逻辑不变，增加了 TypeScript 类型安全。

### 6.1 基础序列工具

| 函数 | 作用 |
|------|------|
| `lastNonNull(series)` | 取序列最后一个非 null 值 |
| `changeMoM(series)` | 环比变化 = 最后两个非 null 值之差 |
| `changePeriod(series)` | 区间变化 = 最后非 null 值 - 首个非 null 值 |
| `trendSlope(series)` | 最小二乘法线性回归斜率 |
| `round(v, d)` | 四舍五入到 d 位小数 |

### 6.2 机构动作分类 (`classifyInstitution`)

输入一个机构的持股比例时间序列，输出动作判定：

```
持股比例 <= 0.05%                    → exit（清仓）
持股比例 < 0.3% 且区间跌幅 >= 0.2pp  → exit
起始 <= 0.1% 且最新 >= 0.2%         → buy（新建仓）
环比变化 <= -0.05 且斜率 < 0         → reduce（减仓）
环比变化 >= +0.05 且斜率 >= 0        → add（加仓）
其他                                 → watch（观望）
```

### 6.3 合力分计算 (`analyzeStock`)

```
对每个被追踪机构:
  weight = ln(1 + max(lastHolding, 0)) + 0.5
  score  = ACTION_SCORE[action] × weight

ACTION_SCORE: buy=+2, add=+1, watch=0, reduce=-1, exit=-2

合力分 = clamp(Σ(score) / Σ(weight) × 50, -100, +100)
合力分 += clamp(总序列斜率 × 10, -8, +8)   // 趋势修正
最终 clamp 到 [-100, +100]
```

### 6.4 多股扫描 (`analyzeAll`)

遍历所有股票，分别调用 `analyzeStock`，返回 `ScanRow[]`。`sortScanRows` 提供排序。

---

## 七、组件详解

### 7.1 Layout.tsx — 布局组件

| 组件 | Props | 说明 |
|------|-------|------|
| `StockSelector` | stockCodes, currentCode, currentStock, onSelect, onPrev, onNext, hasPrev, hasNext, scanRows | 顶部股票选择器，含前后导航按钮和下拉列表 |
| `AlertBanner` | droppedInstitutions, currentStock | 主力出货预警横幅（红色） |
| `InfoPills` | generatedAt, stockCount | 顶部信息栏（"实时追踪中" + 股票数量 + 时间） |
| `DashboardTabs` | activeTab, onTabChange | 标签页切换（仪表盘 / 多股扫描） |

**预警逻辑**（`detectDroppedInstitutions` 在 Tables.tsx 中）：
- 对比 `top10Current` 和 `top10Prev`，找出跌出前十的被追踪机构
- 检查该机构 `trackedData` 中连续减持月数
- `consecutiveMonths >= 4` 才触发预警

### 7.2 Tables.tsx — 表格组件

| 组件 | 说明 |
|------|------|
| `Top10Table` | 前十大经纪商排名，追踪机构高亮 + ★标记，底部显示跌出前十的预警标签 |
| `GainerRanking` | 环比增持排行（前 10），水平进度条可视化 |
| `FullBrokerTable` | 全部经纪商列表，支持搜索、按列排序、分页（15 条/页） |

**`computeGainers` 逻辑**：遍历 `allParticipants`，取每个经纪商最新和次新非 null 值，计算差值，降序排列取前 10。

**`FullBrokerTable` 排序**：支持 `holding`（持股比例）、`shareholding`（持股数）、`changeUp`/`changeDown`（环比变化）四种排序。

### 7.3 Charts.tsx — 图表组件

`HoldingsChart` 使用 Recharts 的 `LineChart` 展示 9 家机构的持股比例变化趋势。

- 数据源：`stock.trackedData[instId]`
- 点击标签可切换显示/隐藏某机构折线
- 颜色映射在 `CHART_COLORS` 常量中定义
- `connectNulls={true}` 跳过 null 数据点
- 外层包裹 shadcn 的 `ChartContainer` 提供主题适配

### 7.4 Analysis.tsx — 分析组件

| 组件 | 说明 |
|------|------|
| `ForceGauge` | 半圆仪表盘，SVG 绘制，指针角度 = (score + 100) / 200 × 180° - 90° |
| `ForceAnalysis` | 合力方向分析完整看板，含仪表盘 + 统计数据 + 机构动向明细 |

**仪表盘配色**：
- score >= 55 → 绿色（bullish）
- score >= 20 → 浅绿色
- score > -20 → 黄色（warning）
- score > -55 → 浅红色
- score <= -55 → 红色（bearish）

### 7.5 Scanner.tsx — 多股扫描

`StockScanner` 展示所有股票的合力分对比表，支持按代码/名称/合力分排序，点击行跳转到该股票的仪表盘视图。

### 7.6 App.tsx — 根组件

```
App
├── useCCASSData()          → 加载数据
├── useStockSelector(data)  → 管理股票选择
├── analyzeAll(data)        → 计算扫描行（用于 StockSelector 显示名称）
│
├── Loading    → 居中 Skeleton 骨架屏
├── Error      → AlertCircle 图标 + 重试按钮
├── Empty      → 提示信息
│
└── 正常渲染
    ├── InfoPills           → 顶部信息栏
    ├── StockSelector       → 股票选择器
    ├── AlertBanner         → 预警横幅（条件渲染）
    ├── DashboardTabs       → 标签切换
    └── 内容区
        ├── scanner tab     → StockScanner
        └── dashboard tab
            ├── HoldingsChart
            ├── Top10Table + GainerRanking (grid 2列)
            ├── ForceAnalysis
            └── FullBrokerTable
```

---

## 八、主题系统

### 8.1 CSS 变量

主题通过 `index.css` 中的 CSS 自定义属性实现，使用 HSL 色彩空间：

```css
:root {
  --background: 0 0% 100%;        /* 白色背景 */
  --foreground: 222 47% 11%;      /* 深色文字 */
  --card: 0 0% 100%;
  --border: 214 32% 91%;          /* 浅灰边框 */
  --bullish: 142 71% 35%;         /* 绿（涨） */
  --bearish: 0 72% 51%;           /* 红（跌） */
  --warning: 35 80% 41%;          /* 金（提醒） */
  --info: 217 91% 54%;            /* 蓝（信息） */
  --track-accent: 32 95% 44%;     /* 追踪标记色 */
  --font-sans: 'IBM Plex Sans', ...;
}

.dark {
  /* 暗色主题变量（保留，当前未激活） */
}
```

### 8.2 切换暗色主题

在 `index.html` 的 `<html>` 标签上添加 `class="dark"` 即可：

```html
<html lang="zh-HK" class="dark">
```

**注意**：暗色主题变量已定义但当前未激活（用户要求浅色背景）。

### 8.3 Tailwind 中的使用

```tsx
className="bg-background text-foreground border-border"
className="text-bullish"           // 绿色
className="text-bearish"           // 红色
className="text-track-accent"      // 追踪标记色
className="bg-destructive/10"      // 10% 透明度红色背景
```

---

## 九、构建与运行

### 9.1 开发

```bash
cd ccass-tracker-web
npm install        # 首次安装依赖
npm run dev        # 启动开发服务器 http://localhost:5173
```

### 9.2 构建

```bash
npm run build      # 输出到 dist/
```

构建流程：`tsc -b`（TypeScript 检查）→ `vite build`（打包）

### 9.3 部署

`dist/` 目录是纯静态文件，可部署到任何静态托管：
- Vercel / Netlify：直接关联 Git 仓库，build command = `npm run build`，output = `dist`
- 腾讯云 CloudBase / 阿里云 OSS：上传 `dist/` 内容
- **注意**：`public/data/holdings.json` 需要在部署环境中保持更新（原始项目通过 CI 自动更新）

### 9.4 数据更新

`holdings.json` 由原始项目的 `fetch_ccass.py` 生成。新前端只是消费者：
1. 将最新的 `holdings.json` 放入 `public/data/`
2. 前端每次加载时 fetch 该文件
3. 无需重启服务（静态文件，Vite dev 模式下热更新）

---

## 十、已安装的 shadcn/ui 组件

以下组件已在 `src/components/ui/` 中就绪，可直接 import 使用：

accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip

**业务组件目前用到的**：card, table, badge, button, input, skeleton, alert, chart

**未使用但可快速扩展的**：dialog（弹窗）、select（下拉）、tabs（标签页）、sidebar（侧边栏）等

---

## 十一、已知限制与后续建议

### 11.1 当前限制
1. **无路由** — 单页面应用，无 URL 路由（如 `/stock/00700`）。股票切换不记录在 URL 中
2. **无暗色切换按钮** — 暗色 CSS 变量已定义，但未提供 UI 切换入口
3. **无数据缓存** — 每次加载都 fetch holdings.json，无 localStorage 缓存
4. **无响应式侧边栏** — 布局为顶部导航 + 内容区，未使用 shadcn sidebar 组件
5. **tailwind.config.js colors 重复** — 两处 `colors` 键，后者覆盖前者（功能正常但不规范）

### 11.2 后续建议（按优先级）

| 优先级 | 建议 | 说明 |
|--------|------|------|
| P0 | 添加 React Router | 支持 `/stock/:code` 路由，可分享特定股票链接 |
| P1 | 暗色模式切换 | 利用 `next-themes`（已安装）+ 现有 `.dark` CSS 变量 |
| P2 | 股票搜索/收藏 | 在 StockSelector 中加搜索框，收藏常用股票 |
| P2 | 数据缓存 | localStorage 缓存 holdings.json，减少重复请求 |
| P3 | 更多图表类型 | 柱状图（月度变化量）、饼图（持股分布） |
| P3 | 导出功能 | 导出 CSV / 截图分享 |
| P4 | WebSocket 实时推送 | 替代手动刷新 |

---

## 十二、文件变更清单

相对于原始项目，本次开发**新建**的所有文件：

| 文件 | 说明 |
|------|------|
| `src/types/ccass.ts` | TypeScript 类型 + 常量 |
| `src/lib/analysis.ts` | 量化分析引擎（从 analyze.js 移植） |
| `src/lib/dashboard.ts` | 桶文件（统一 re-export） |
| `src/hooks/use-ccass-data.ts` | 数据加载 hooks |
| `src/components/dashboard/Layout.tsx` | 布局组件 |
| `src/components/dashboard/Tables.tsx` | 表格组件 |
| `src/components/dashboard/Charts.tsx` | 图表组件 |
| `src/components/dashboard/Analysis.tsx` | 分析组件 |
| `src/components/dashboard/Scanner.tsx` | 多股扫描 |
| `src/App.tsx` | 根组件（重写） |
| `src/App.css` | 空占位文件 |
| `public/data/holdings.json` | 数据文件（复制） |

**修改的文件**：

| 文件 | 变更内容 |
|------|---------|
| `index.html` | 语言改 `zh-HK`，移除 `class="dark"` |
| `src/index.css` | 完整重写 CSS 变量主题（浅色金融主题） |
| `tailwind.config.js` | 添加金融语义色、IBM Plex Sans 字体 |
| `package.json` | 由脚手架生成，包含全部依赖 |

---

## 十三、联系与资源

- **原始仓库**: https://github.com/yushuhong1212/ccass-tracker.git
- **shadcn/ui 文档**: https://ui.shadcn.com
- **Tailwind CSS 文档**: https://tailwindcss.com/docs
- **Recharts 文档**: https://recharts.org/en-US
- **Lucide 图标**: https://lucide.dev/icons
