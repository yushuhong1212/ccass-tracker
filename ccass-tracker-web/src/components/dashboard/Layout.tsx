import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  LayoutDashboard,
  Search,
  Moon,
  Sun,
  RefreshCw,
  Activity,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  X,
  TrendingUp,
} from 'lucide-react';
import type { StockData, ScanRow } from '@/types/ccass';
import type { DroppedInst, BigReducer } from '@/components/dashboard/Tables';
import { REDUCE_WARN_THRESHOLD } from '@/components/dashboard/Tables';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

// ============================================================
// AppHeader —— 全局顶栏：Logo + 暗色模式 + 刷新
// ============================================================
interface AppHeaderProps {
  onRefresh: () => void;
}

export function AppHeader({ onRefresh }: AppHeaderProps) {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
          <Activity className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold tracking-wide text-foreground">
              CCASS Tracker
            </span>
            <span className="hidden rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-muted-foreground sm:inline">
              港股持仓
            </span>
          </div>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            经纪商持股追踪 · 机构合力分析
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          title={theme === 'dark' ? '亮色模式' : '暗色模式'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          aria-label="刷新数据"
          title="刷新数据"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

// ============================================================
// StatusBar —— 原 InfoPills：实时状态 + 数据时间 + 股票数
// ============================================================
interface StatusBarProps {
  generatedAt: string;
  stockCount: number;
}

export function StatusBar({ generatedAt, stockCount }: StatusBarProps) {
  const date = new Date(generatedAt);
  const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/30 px-4 py-1.5 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-bullish/10 px-2.5 py-0.5 font-medium text-bullish">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bullish opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bullish" />
        </span>
        实时追踪
      </span>
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">{stockCount}</span> 只股票
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span className="text-muted-foreground">
        数据更新：<span className="font-medium text-foreground">{dateStr}</span> {timeStr}
      </span>
    </div>
  );
}

// ============================================================
// StockSelector —— 可搜索下拉 + 上一只/下一只 + 摘要
// ============================================================
interface StockSelectorProps {
  stockCodes: string[];
  currentCode: string;
  currentStock: StockData | null;
  onSelect: (code: string) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  scanRows: ScanRow[];
}

export function StockSelector({
  stockCodes, currentCode, currentStock, onSelect, onPrev, onNext, hasPrev, hasNext, scanRows,
}: StockSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const nameOf = (code: string) => scanRows.find((r) => r.code === code)?.name || code;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? stockCodes.filter(
        (c) => c.toLowerCase().includes(q) || nameOf(c).toLowerCase().includes(q),
      )
    : stockCodes;

  const selectAndClose = (code: string) => {
    onSelect(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative z-40 flex items-center gap-3 border-b border-border bg-card/40 px-4 py-3 backdrop-blur-sm">
      <Button
        variant="outline"
        size="icon"
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="上一只股票"
        title="上一只 (←)"
        className="shrink-0"
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>

      <div ref={containerRef} className="relative min-w-0 flex-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-muted-foreground/40',
            open && 'ring-1 ring-ring',
          )}
        >
          <span className="font-mono text-sm font-semibold text-foreground">{currentCode}</span>
          <span className="truncate text-sm text-muted-foreground">
            {currentStock ? currentStock.name : nameOf(currentCode)}
          </span>
          {currentStock && (
            <span className="ml-auto hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
              {currentStock.months.length} 月数据
              {currentStock.price && <span className="ml-2 font-mono">{currentStock.price}</span>}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered[0]) selectAndClose(filtered[0]);
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="搜索代码 / 名称…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-center text-xs text-muted-foreground">无匹配股票</li>
              )}
              {filtered.map((code) => {
                const active = code === currentCode;
                return (
                  <li key={code}>
                    <button
                      onClick={() => selectAndClose(code)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                        active && 'bg-accent',
                      )}
                    >
                      <span className={cn('font-mono text-xs', active ? 'text-foreground' : 'text-muted-foreground')}>
                        {code}
                      </span>
                      <span className="truncate text-foreground">{nameOf(code)}</span>
                      {active && <span className="ml-auto text-xs text-info">当前</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              共 {stockCodes.length} 只 · 键盘 ← / → 切换
            </div>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="下一只股票"
        title="下一只 (→)"
        className="shrink-0"
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================================
// AlertBanner —— 预警横幅（语义保持不变，仅样式升级）
// 与原始 index.html 一致，分三类预警内容：
//   ① 主力出货：跌出前十且近4月连续下降、累计降幅>0.2pp（最高级别，红色标签）
//   ② 普通跌出：跌出前十但不满足连续下降条件（提示关注）
//   ③ 环比大幅减持：仍在榜但环比≤-3pp 且持股数量也减少（提示警惕）
// ============================================================
interface AlertBannerProps {
  droppedInstitutions: DroppedInst[];
  bigReducers: BigReducer[];
  currentStock: StockData | null;
}

export function AlertBanner({ droppedInstitutions, bigReducers, currentStock }: AlertBannerProps) {
  if (!currentStock) return null;
  const shipOutList = droppedInstitutions.filter((d) => d.isShipOut);
  const otherDropped = droppedInstitutions.filter((d) => !d.isShipOut);
  if (shipOutList.length === 0 && otherDropped.length === 0 && bigReducers.length === 0) return null;

  return (
    <div className="mx-4 mt-4">
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* ① 主力出货 */}
          {shipOutList.length > 0 && (
            <div className="text-xs text-destructive">
              <span className="mr-2 inline-block rounded bg-destructive px-1.5 py-0.5 align-middle text-[10px] font-bold text-destructive-foreground">
                主力出货警示
              </span>
              <strong className="font-semibold">
                {shipOutList.map((d) => d.shortName).join('、')}
              </strong>
              等主力持续减持，已跌出前十持仓！
              {shipOutList.length === 1 && shipOutList[0].totalDrop3m != null && (
                <>
                  {' '}近3个月累计减持约
                  <span className="font-bold"> {shipOutList[0].totalDrop3m!.toFixed(2)} 个百分点</span>
                  。
                </>
              )}
            </div>
          )}
          {/* ② 普通跌出前十 */}
          {otherDropped.length > 0 && (
            <div className="text-xs text-destructive/80">
              📉 <strong className="font-semibold">
                {otherDropped.map((d) => d.shortName).join('、')}
              </strong>
              也已跌出前十，当前持股比例分别降至
              {otherDropped.map((d) => (d.holding != null ? d.holding.toFixed(2) + '%' : '—')).join('、')}
              ，请密切关注后续动向。
            </div>
          )}
          {/* ③ 环比大幅减持 */}
          {bigReducers.length > 0 && (
            <div className="text-xs text-destructive/90">
              <span className="mr-2 inline-block rounded bg-destructive px-1.5 py-0.5 align-middle text-[10px] font-bold text-destructive-foreground">
                ⚠️ 环比大幅减持
              </span>
              前十大经纪商中，
              <strong className="font-semibold">
                {bigReducers
                  .map((it) => {
                    const shTxt = it.shareholdingChangePct != null ? `（持股量${it.shareholdingChangePct.toFixed(1)}%）` : '';
                    return `${it.broker} 比例${it.change.toFixed(2)}%${shTxt}`;
                  })
                  .join('、')}
              </strong>
              {' '}单月减持超过{-REDUCE_WARN_THRESHOLD}个百分点且持股量下降，需警惕主力出货。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DashboardTabs —— segmented control 风格，带计数
// ============================================================
type TabId = 'dashboard' | 'scanner' | 'forecast';

interface DashboardTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  stockCount?: number;
}

export function DashboardTabs({ activeTab, onTabChange, stockCount }: DashboardTabsProps) {
  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: '仪表盘', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'scanner', label: '多股扫描', icon: <Search className="h-4 w-4" />, badge: stockCount },
    { id: 'forecast', label: '成交量预测', icon: <TrendingUp className="h-4 w-4" /> },
  ];

  return (
    <div className="px-4 pt-3">
      <div className="inline-flex gap-1 rounded-lg bg-secondary p-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.badge != null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[10px] font-semibold',
                    active ? 'bg-info/15 text-info' : 'bg-muted-foreground/15 text-muted-foreground',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// EmptyState —— 统一空状态
// ============================================================
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/30 px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
