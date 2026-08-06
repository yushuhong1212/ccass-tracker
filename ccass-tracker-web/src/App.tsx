import { useState, useEffect } from 'react';
import { useCCASSData, useStockSelector } from '@/hooks/use-ccass-data';
import { detectDroppedInstitutions, detectBigReducers } from '@/components/dashboard/Tables';
import { analyzeAll } from '@/lib/analysis';
import {
  AppHeader,
  StatusBar,
  StockSelector,
  AlertBanner,
  DashboardTabs,
} from '@/components/dashboard/Layout';
import { Top10Table, GainerRanking, FullBrokerTable } from '@/components/dashboard/Tables';
import { HoldingsChart } from '@/components/dashboard/Charts';
import { ForceAnalysis } from '@/components/dashboard/Analysis';
import { StockScanner } from '@/components/dashboard/Scanner';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

type TabId = 'dashboard' | 'scanner';

function App() {
  const { data, loading, error } = useCCASSData();
  const { currentCode, currentStock, stockCodes, selectCode, goNext, goPrev, hasNext, hasPrev } =
    useStockSelector(data);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // Scan rows for stock selector display names
  const scanRows = data ? analyzeAll(data) : [];

  // 键盘快捷键：←/→ 或 ↑/↓ 在已有股票间切换（与原始版一致）。
  // 注意：所有 hooks 必须在任何 early return 之前调用，否则会触发
  // "Rendered more hooks than during the previous render" 导致整个应用崩溃白屏。
  useEffect(() => {
    if (!data) return;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [data, goNext, goPrev]);

  // Refresh handler
  const handleRefresh = () => {
    location.reload();
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">CCASS Tracker</h1>
          <p className="text-muted-foreground text-sm">港股经纪商持股追踪</p>
        </div>
        <div className="space-y-3 w-80">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h1 className="text-xl font-semibold text-foreground">数据加载失败</h1>
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error || '未能加载港股持仓数据，请检查网络连接'}</AlertDescription>
        </Alert>
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" /> 重试
        </Button>
      </div>
    );
  }

  // Empty state (no stocks)
  if (stockCodes.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold text-foreground">CCASS Tracker</h1>
        <p className="text-muted-foreground text-sm">暂无股票数据，请等待数据更新</p>
      </div>
    );
  }

  const droppedInstitutions = currentStock ? detectDroppedInstitutions(currentStock) : [];
  const bigReducers = currentStock ? detectBigReducers(currentStock) : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Header */}
      <AppHeader onRefresh={handleRefresh} />

      {/* Status Bar */}
      <StatusBar generatedAt={data.generatedAt} stockCount={stockCodes.length} />

      {/* Stock Selector */}
      <StockSelector
        stockCodes={stockCodes}
        currentCode={currentCode}
        currentStock={currentStock}
        onSelect={selectCode}
        onPrev={goPrev}
        onNext={goNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
        scanRows={scanRows}
      />

      {/* Alert Banner */}
      <AlertBanner
        droppedInstitutions={droppedInstitutions}
        bigReducers={bigReducers}
        currentStock={currentStock}
      />

      {/* Tabs */}
      <DashboardTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stockCount={stockCodes.length}
      />

      {/* Main Content */}
      <div className="p-4">
        {activeTab === 'scanner' ? (
          <StockScanner data={data} onSelectStock={(code) => { selectCode(code); setActiveTab('dashboard'); }} />
        ) : currentStock ? (
          <div className="space-y-4">
            {/* Chart */}
            <HoldingsChart stock={currentStock} />

            {/* Top 10 + Gainers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Top10Table stock={currentStock} />
              <GainerRanking stock={currentStock} />
            </div>

            {/* Force Analysis */}
            <ForceAnalysis stock={currentStock} />

            {/* Full Broker Table */}
            <FullBrokerTable stock={currentStock} />
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-muted-foreground border-t border-border">
        CCASS Tracker · 数据来源：港交所 CCASS ·
        最后更新：{new Date(data.generatedAt).toLocaleString('zh-CN')}
      </footer>
    </div>
  );
}

export default App;
