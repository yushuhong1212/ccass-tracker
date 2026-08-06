import { useState, useEffect } from 'react';
import { useCCASSData, useStockSelector } from '@/hooks/use-ccass-data';
import { StockHeader } from '@/components/mobile/StockHeader';
import { AlertStrip } from '@/components/mobile/AlertStrip';
import { StockPanels } from '@/components/mobile/StockPanels';
import { ScannerList } from '@/components/mobile/ScannerList';
import { BottomNav, type MobileTab } from '@/components/mobile/BottomNav';
import { AlertCircle, RefreshCw, BarChart3 } from 'lucide-react';

function App() {
  const { data, loading, error } = useCCASSData();
  const {
    currentCode, currentStock, stockCodes,
    selectCode, goNext, goPrev, hasNext, hasPrev,
  } = useStockSelector(data);
  const [activeTab, setActiveTab] = useState<MobileTab>('stock');
  const [contentKey, setContentKey] = useState(0);

  // Trigger re-animation on stock change
  useEffect(() => {
    setContentKey(prev => prev + 1);
  }, [currentCode]);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">CCASS 持仓追踪</h1>
          <p className="text-sm text-muted-foreground">港股经纪商持股追踪</p>
        </div>
        <div className="space-y-3 w-full max-w-sm">
          <div className="shimmer h-14 w-full rounded-xl" />
          <div className="shimmer h-4 w-2/3 rounded-lg" />
          <div className="shimmer h-48 w-full rounded-xl" />
          <div className="shimmer h-24 w-full rounded-xl" />
        </div>
        <p className="text-xs text-muted-foreground animate-pulse-soft">加载数据中...</p>
      </div>
    );
  }

  // Error
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">数据加载失败</h1>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            {error || '未能加载持仓数据，请检查网络连接'}
          </p>
        </div>
        <button
          onClick={() => location.reload()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium shadow-card active:scale-95 transition-transform"
        >
          <RefreshCw className="w-4 h-4" /> 重试
        </button>
      </div>
    );
  }

  // Empty
  if (stockCodes.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-6 text-center">
        <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
        <h1 className="text-lg font-semibold">CCASS 持仓追踪</h1>
        <p className="text-sm text-muted-foreground">暂无股票数据，请等待数据更新</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* 顶部股票选择（sticky 贴顶） */}
      <StockHeader
        stockCodes={stockCodes}
        stockNames={Object.fromEntries(
          Object.entries(data.stocks).map(([code, s]) => [code, s.name || code]),
        )}
        currentCode={currentCode}
        onSelect={selectCode}
        onPrev={goPrev}
        onNext={goNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
      />

      {/* 数据更新时间 */}
      <div className="px-4 pt-2.5 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-primary/60" />
          <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">
            CCASS Data
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {new Date(data.generatedAt).toLocaleDateString('zh-CN')} · {stockCodes.length} stocks
        </span>
      </div>

      {/* Tab 内容 with animation key */}
      <div key={contentKey}>
        {activeTab === 'scanner' ? (
          <ScannerList
            data={data}
            currentCode={currentCode}
            onSelect={(code) => { selectCode(code); setActiveTab('stock'); }}
          />
        ) : currentStock ? (
          <div className="animate-fade-in">
            <AlertStrip stock={currentStock} />
            <StockPanels stock={currentStock} />
          </div>
        ) : null}
      </div>

      {/* 底部 Tab 栏 */}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

export default App;