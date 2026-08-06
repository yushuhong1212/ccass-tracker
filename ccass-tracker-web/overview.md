# CCASS Tracker — 现代化 Web 应用重构

## 项目概述

基于 `yushuhong1212/ccass-tracker` 仓库，将原生 HTML/CSS/JS (1227 行单文件) 重构为现代 React + TypeScript + shadcn/ui 技术栈。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | React 19 + TypeScript 5.9 (strict mode) |
| **构建** | Vite 7 |
| **样式** | Tailwind CSS 3.4 + shadcn/ui (50+ 组件) |
| **图表** | Recharts 2.15 |
| **图标** | Lucide React |
| **数据** | public/data/holdings.json (24 只港股，12 个月历史) |

---

## 设计系统

基于 **ui-ux-pro-max** 分析引擎产出：

| 维度 | 方案 |
|------|------|
| **风格** | OLED 暗色模式 |
| **背景色** | `#020617` (hsl 222 47% 5%) |
| **主色** | `#0F172A` / `#1E293B` |
| **CTA 色** | `#22C55E` (看涨绿) |
| **字体** | IBM Plex Sans (金融/可信赖) |
| **语义色** | bullish 绿、bearish 红、warning 金、track-accent 金 |

---

## 组件架构

```
App.tsx
├── InfoPills           — 数据状态指示器
├── StockSelector       — 股票下拉 + 方向键导航
├── AlertBanner         — 主力出货预警
├── DashboardTabs       — 仪表盘/多股扫描切换
├── HoldingsChart       — Recharts 折线趋势图
├── Top10Table          — 前十大经纪商排名
├── GainerRanking       — 环比增持排行
├── ForceAnalysis       — 合力分析看板 + 仪表盘
├── FullBrokerTable     — 全部经纪搜索/排序/分页
└── StockScanner        — 多股扫描对比表
```

---

## 状态覆盖

- ✅ **Loading**: Skeleton 骨架屏
- ✅ **Error**: 错误提示 + 重试按钮
- ✅ **Empty**: 无数据友好提示
- ✅ **Normal**: 完整仪表盘展示

---

## 启动命令

```bash
cd ccass-tracker-web
npm install
npm run dev     # http://localhost:5173
npm run build   # 输出 dist/
```
