/**
 * AllBrokersPanel — 全部经纪持股排行（金融科技风格）。
 * 带搜索、排序、分页，卡片式设计。
 */
import { useMemo, useState } from 'react';
import type { StockData } from '@/types/ccass';
import { flattenBrokers } from '@/lib/chart-colors';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Search, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type SortKey = 'holding' | 'changeUp' | 'changeDown';

interface AllBrokersPanelProps {
  stock: StockData;
}

export function AllBrokersPanel({ stock }: AllBrokersPanelProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('holding');
  const [page, setPage] = useState(0);
  const perPage = 20;

  const entries = useMemo(() => {
    const list = flattenBrokers(stock).filter(e =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.id || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.rawName || '').toLowerCase().includes(search.toLowerCase()),
    );
    list.sort((a, b) => {
      if (sortKey === 'holding') return (b.holding ?? -1e9) - (a.holding ?? -1e9);
      if (sortKey === 'changeUp') return (b.change ?? -1e9) - (a.change ?? -1e9);
      return (a.change ?? 1e9) - (b.change ?? 1e9);
    });
    return list;
  }, [stock, search, sortKey]);

  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = entries.slice(safePage * perPage, (safePage + 1) * perPage);

  return (
    <div className="space-y-2.5">
      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
        <Input
          placeholder="搜索经纪商名称 / ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="h-9 text-xs pl-8 rounded-xl border-border/60 bg-card shadow-card"
        />
      </div>

      {/* 排序选项 */}
      <div className="flex items-center gap-1.5">
        {([
          { k: 'holding' as SortKey, label: '持股比例' },
          { k: 'changeUp' as SortKey, label: '增持↑' },
          { k: 'changeDown' as SortKey, label: '减持↓' },
        ]).map(opt => (
          <button
            key={opt.k}
            onClick={() => { setSortKey(opt.k); setPage(0); }}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-all duration-200',
              sortKey === opt.k
                ? 'border-primary/30 text-primary bg-primary/5 shadow-sm'
                : 'border-border/60 text-muted-foreground bg-card shadow-card hover:bg-secondary/60',
            )}
          >
            <ArrowUpDown className="w-3 h-3" />
            {opt.label}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground font-mono bg-secondary/60 px-2 py-1 rounded-lg ml-auto">
          {entries.length}
        </span>
      </div>

      {/* 列表 */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto ios-scroll">
        {pageItems.map((e, idx) => {
          const change = e.change;
          return (
            <div
              key={e.id}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-200',
                'border border-border/40 shadow-card',
                e.instId ? 'bg-primary/3 border-primary/8' : 'bg-card',
              )}
            >
              {/* 序号 */}
              <span className="w-6 text-center font-mono text-[10px] text-muted-foreground shrink-0">
                {safePage * perPage + idx + 1}
              </span>

              {/* 名称 + ID */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {e.instId && <span className="text-primary text-[10px]">★</span>}
                  <span className="text-[12px] font-medium truncate" title={e.rawName || e.name}>{e.name}</span>
                  <span className="text-[8px] text-muted-foreground/50 font-mono shrink-0">{e.id}</span>
                </div>
              </div>

              {/* 持股比例 */}
              <span className="font-mono text-xs font-semibold tabular-nums shrink-0">
                {e.holding != null ? e.holding.toFixed(2) + '%' : '—'}
              </span>

              {/* 环比变化 */}
              <span
                className={cn(
                  'font-mono text-[11px] font-medium tabular-nums w-12 text-right shrink-0',
                  change == null ? 'text-muted-foreground'
                  : change > 0 ? 'text-bullish'
                  : change < 0 ? 'text-bearish'
                  : 'text-muted-foreground',
                )}
              >
                {change == null ? '—' : (change > 0 ? '+' : '') + change.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1 px-1">
          <span className="text-[10px] text-muted-foreground font-mono">
            {safePage + 1}/{totalPages}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className={cn(
                'tap-target flex items-center justify-center rounded-lg border border-border/60 bg-card shadow-card px-2.5 transition-all duration-200',
                safePage === 0 ? 'text-muted-foreground/30' : 'hover:bg-secondary/60 active:scale-90',
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className={cn(
                'tap-target flex items-center justify-center rounded-lg border border-border/60 bg-card shadow-card px-2.5 transition-all duration-200',
                safePage >= totalPages - 1 ? 'text-muted-foreground/30' : 'hover:bg-secondary/60 active:scale-90',
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}