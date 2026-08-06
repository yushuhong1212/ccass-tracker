/**
 * ScannerList — 多股扫描列表（金融科技风格）。
 * 带卡片式设计、动画入场、更好的视觉层级。
 */
import { useMemo } from 'react';
import type { HoldingsData } from '@/types/ccass';
import { ACTION_CONFIG } from '@/types/ccass';
import { analyzeAll } from '@/lib/analysis';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScannerListProps {
  data: HoldingsData;
  currentCode: string;
  onSelect: (code: string) => void;
}

export function ScannerList({ data, currentCode, onSelect }: ScannerListProps) {
  const rows = useMemo(() => {
    const all = analyzeAll(data);
    return all.sort((a, b) => b.forceScore - a.forceScore);
  }, [data]);

  return (
    <div className="px-4 pt-2">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
          <h2 className="text-sm font-semibold">全部股票</h2>
        </div>
        <span className="text-[10px] text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full font-mono">
          {rows.length} 只 · 按合力分排序
        </span>
      </div>

      {/* 列表 */}
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const cfg = ACTION_CONFIG[row.action];
          const isActive = row.code === currentCode;
          const scoreColor =
            row.forceScore > 0 ? 'text-bullish' :
            row.forceScore < 0 ? 'text-bearish' : 'text-muted-foreground';

          const IconComponent = row.forceScore > 0 ? TrendingUp :
            row.forceScore < 0 ? TrendingDown : Minus;

          return (
            <button
              key={row.code}
              onClick={() => onSelect(row.code)}
              className={cn(
                'w-full tap-target flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all duration-200',
                'border shadow-card hover:shadow-elevated active:scale-[0.98]',
                isActive
                  ? 'border-primary/30 bg-primary/5 shadow-primary/5'
                  : 'border-border/60 bg-card',
              )}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              {/* 排名 */}
              <span className="w-5 text-center font-mono text-[10px] text-muted-foreground shrink-0">
                {idx + 1}
              </span>

              {/* 代码 + 名称 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{row.code}</span>
                  <span className="text-sm font-medium truncate">{row.name}</span>
                </div>
              </div>

              {/* 合力分 */}
              <div className="flex items-center gap-1.5">
                <IconComponent className={cn('w-3.5 h-3.5', scoreColor)} strokeWidth={2.5} />
                <span className={cn('font-mono text-base font-semibold tabular-nums', scoreColor)}>
                  {row.forceScore > 0 ? '+' : ''}{row.forceScore}
                </span>
              </div>

              {/* 建议标签 */}
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
                style={{ borderColor: cfg.color, color: cfg.color, backgroundColor: cfg.color + '10' }}
              >
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}