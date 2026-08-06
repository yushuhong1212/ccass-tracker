/**
 * Top10Panel — 前十大经纪商持股（金融科技风格卡片列表）。
 * 带排名徽标、色块、动画入场。
 */
import type { StockData } from '@/types/ccass';
import { cn } from '@/lib/utils';

interface Top10PanelProps {
  stock: StockData;
}

function RankBadge({ rank }: { rank: number }) {
  const cls = rank === 1 ? 'rank-badge-1' : rank === 2 ? 'rank-badge-2' : rank === 3 ? 'rank-badge-3' : 'rank-badge-default';
  return (
    <span className={cn('rank-badge', cls)}>
      {rank}
    </span>
  );
}

export function Top10Panel({ stock }: Top10PanelProps) {
  const top10 = stock.top10Current || [];

  if (top10.length === 0) {
    return <div className="text-xs text-muted-foreground py-6 text-center">暂无前十数据</div>;
  }

  return (
    <div className="space-y-1">
      {top10.map((item, idx) => {
        const change = item.change;
        return (
          <div
            key={`${item.participant_id}-${idx}`}
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-200',
              'border border-border/40 shadow-card',
              item.isTracked ? 'bg-primary/3 border-primary/10' : 'bg-card',
            )}
          >
            {/* 排名徽标 */}
            <RankBadge rank={item.rank} />

            {/* 名称 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {item.isTracked && <span className="text-primary text-xs">★</span>}
                <span className="text-[13px] font-medium truncate" title={item.rawName || item.broker}>
                  {item.broker}
                </span>
                {item.isTracked && (
                  <span className="text-[9px] font-medium text-primary bg-primary/8 px-1.5 py-0.5 rounded-full">跟踪</span>
                )}
              </div>
              {item.rawName && item.rawName !== item.broker && (
                <div className="text-[9px] text-muted-foreground/60 truncate mt-0.5 font-mono">{item.rawName}</div>
              )}
            </div>

            {/* 持股比例 */}
            <span className="font-mono text-sm font-semibold tabular-nums shrink-0">
              {item.holding != null ? item.holding.toFixed(2) + '%' : '—'}
            </span>

            {/* 环比变化 */}
            <span
              className={cn(
                'font-mono text-xs font-medium tabular-nums w-14 text-right shrink-0',
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
  );
}