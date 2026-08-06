/**
 * AnalysisPanel — 机构合力分析（金融科技风格）。
 * 仪表盘 + 关键指标 + 叙述 + 机构动向 chips，带微动画。
 */
import type { StockData } from '@/types/ccass';
import { ACTION_CONFIG } from '@/types/ccass';
import { analyzeStock } from '@/lib/analysis';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AnalysisPanelProps {
  stock: StockData;
}

// 半圆仪表（金融科技风格）
function ForceGauge({ score }: { score: number }) {
  const rotation = ((score + 100) / 200) * 180 - 90;
  const color = score >= 55 ? 'hsl(var(--bullish))'
    : score >= 20 ? 'hsl(var(--bullish)/0.7)'
    : score > -20 ? 'hsl(var(--warning))'
    : score > -55 ? 'hsl(var(--bearish)/0.7)'
    : 'hsl(var(--bearish))';

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-14 shrink-0">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          {/* 背景弧 */}
          <path d="M 10 90 A 80 80 0 0 1 190 90" fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" />
          {/* 填充弧 */}
          <path
            d="M 10 90 A 80 80 0 0 1 190 90"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${Math.abs(score / 100) * 251} 999`}
            strokeLinecap="round"
          />
          {/* 指针 */}
          <line
            x1="100" y1="30" x2="100" y2="90"
            stroke="hsl(var(--foreground))" strokeWidth="2"
            transform={`rotate(${Math.max(-85, Math.min(85, rotation))}, 100, 90)`}
            style={{ transformOrigin: '100px 90px' }}
            className="gauge-needle"
          />
          <circle cx="100" cy="90" r="5" fill="hsl(var(--foreground))" />
        </svg>
      </div>
      <div>
        <div className="text-3xl font-bold font-mono tabular-nums animate-number" style={{ color }}>
          {score > 0 ? '+' : ''}{score}
        </div>
        <div className="text-[10px] text-muted-foreground font-medium">机构合力分</div>
      </div>
    </div>
  );
}

export function AnalysisPanel({ stock }: AnalysisPanelProps) {
  const analysis = analyzeStock(stock);
  const {
    action, forceScore, actionLabel, narrative,
    totalTrackedHolding, totalTrackedChangeMoM, activeInstitutions, movements,
  } = analysis;
  const actionColor = ACTION_CONFIG[action]?.color || 'hsl(var(--muted-foreground))';
  const adders = movements.filter(m => m.action === 'add' || m.action === 'buy').length;
  const reducers = movements.filter(m => m.action === 'reduce' || m.action === 'exit').length;

  const MetricRow = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
    <div className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-sm tabular-nums font-medium', valueClass)}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 仪表 + 评分 + 建议标签 */}
      <div className="flex items-center justify-between gap-2 bg-card rounded-xl border border-border/40 p-3 shadow-card">
        <ForceGauge score={forceScore} />
        <Badge
          className="text-xs px-3 py-1.5 font-semibold rounded-lg shadow-sm"
          style={{ backgroundColor: actionColor, color: '#fff' }}
        >
          {actionLabel}
        </Badge>
      </div>

      {/* 关键指标 */}
      <div className="bg-card rounded-xl border border-border/40 p-3 shadow-card">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0">
          <MetricRow label="合力分" value={`${forceScore > 0 ? '+' : ''}${forceScore}`} valueClass="font-semibold" />
          <MetricRow label="合计持股" value={`${totalTrackedHolding}%`} />
          <MetricRow
            label="环比变化"
            value={`${totalTrackedChangeMoM > 0 ? '+' : ''}${totalTrackedChangeMoM}pp`}
            valueClass={totalTrackedChangeMoM > 0 ? 'text-bullish' : totalTrackedChangeMoM < 0 ? 'text-bearish' : ''}
          />
          <MetricRow label="活跃机构" value={`${activeInstitutions} 家`} />
          <MetricRow label="加仓/建仓" value={`${adders} 家`} valueClass="text-bullish" />
          <MetricRow label="减仓/清仓" value={`${reducers} 家`} valueClass="text-bearish" />
        </div>
      </div>

      {/* 叙述 */}
      <div className="bg-card rounded-xl border border-border/40 p-3 shadow-card">
        <p className="text-xs text-muted-foreground leading-relaxed">{narrative}</p>
      </div>

      {/* 机构动向 chips */}
      <div>
        <div className="flex items-center gap-2 mb-2.5 px-1">
          <div className="w-1 h-1 rounded-full bg-primary/60" />
          <span className="text-xs font-medium text-muted-foreground">著名机构动向明细</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {movements.map(m => {
            const cfg = ACTION_CONFIG[m.action];
            return (
              <div
                key={m.instId}
                className="flex items-center gap-1.5 bg-card rounded-xl border border-border/40 px-2.5 py-1.5 shadow-card text-[11px]"
              >
                <span className="font-medium truncate max-w-[100px]">{m.brokerName}</span>
                <span
                  className="px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                  style={{ backgroundColor: cfg.color + '15', color: cfg.color }}
                >
                  {cfg.label}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">{m.currentHolding}%</span>
              </div>
            );
          })}
          {movements.length === 0 && (
            <span className="text-xs text-muted-foreground px-1">暂无机构动向数据</span>
          )}
        </div>
      </div>
    </div>
  );
}