/**
 * StockHeader — 顶部股票选择条（金融科技风格）。
 * sticky 贴顶，含 [上一只] + 股票选择器 + [下一只]。
 * 带玻璃模糊效果，微动画交互。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StockHeaderProps {
  stockCodes: string[];
  stockNames: Record<string, string>;
  currentCode: string;
  onSelect: (code: string) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function StockHeader({
  stockCodes, stockNames, currentCode,
  onSelect, onPrev, onNext, hasPrev, hasNext,
}: StockHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 border-b border-border/50
                 bg-background/80 backdrop-blur-xl safe-top"
    >
      <div className="flex items-center gap-1 px-2 py-2.5">
        {/* 上一只 */}
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="上一只"
          className={cn(
            'tap-target shrink-0 flex items-center justify-center rounded-xl transition-all duration-200',
            hasPrev
              ? 'text-foreground hover:bg-secondary/80 active:scale-90'
              : 'text-muted-foreground/20',
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* 中间：当前股票选择器 */}
        <div className="flex-1 min-w-0 relative flex items-center justify-center">
          {/* 视觉展示 */}
          <div className="flex flex-col items-center min-w-0 px-2">
            <span className="text-base font-semibold tracking-tight truncate max-w-full">
              {stockNames[currentCode] ?? currentCode}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono bg-secondary/50 px-2 py-0.5 rounded-full mt-0.5">
              {currentCode}
            </span>
          </div>
          {/* 透明原生 select */}
          <select
            value={currentCode}
            onChange={e => onSelect(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="选择股票"
          >
            {stockCodes.map(code => (
              <option key={code} value={code}>{code} - {stockNames[code] ?? code}</option>
            ))}
          </select>
          {/* 下拉指示 */}
          <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 border-r-[1.5px] border-b-[1.5px] border-muted-foreground/40 -rotate-45 translate-y-[-2px]" />
            <div className="w-1.5 h-1.5 border-r-[1.5px] border-b-[1.5px] border-muted-foreground/40 -rotate-45 translate-y-[-2px] -ml-1" />
          </div>
        </div>

        {/* 下一只 */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          aria-label="下一只"
          className={cn(
            'tap-target shrink-0 flex items-center justify-center rounded-xl transition-all duration-200',
            hasNext
              ? 'text-foreground hover:bg-secondary/80 active:scale-90'
              : 'text-muted-foreground/20',
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}