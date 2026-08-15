import type { StockData } from '@/types/ccass';
import { ACTION_CONFIG } from '@/types/ccass';
import { analyzeStock } from '@/lib/analysis';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain } from 'lucide-react';

// -------- Force Gauge Widget --------
function ForceGauge({ score }: { score: number }) {
  const rotation = ((score + 100) / 200) * 180 - 90;
  const color = score >= 55 ? 'hsl(var(--bullish))'
    : score >= 20 ? 'hsl(var(--bullish)/0.7)'
    : score > -20 ? 'hsl(var(--warning))'
    : score > -55 ? 'hsl(var(--bearish)/0.7)'
    : 'hsl(var(--bearish))';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <path d="M 10 90 A 80 80 0 0 1 190 90" fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" />
          <path
            d="M 10 90 A 80 80 0 0 1 190 90"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${Math.abs(score / 100) * 251} 999`}
            strokeLinecap="round"
          />
          <line
            x1="100" y1="30" x2="100" y2="90"
            stroke="hsl(var(--foreground))" strokeWidth="2"
            transform={`rotate(${Math.max(-85, Math.min(85, rotation))}, 100, 90)`}
            style={{ transformOrigin: '100px 90px' }}
          />
          <circle cx="100" cy="90" r="5" fill="hsl(var(--foreground))" />
        </svg>
      </div>
      <div className="font-display text-2xl font-bold tabular-nums mt-1" style={{ color }}>
        {score > 0 ? '+' : ''}{score}
      </div>
      <div className="text-[10px] text-muted-foreground -mt-0.5">机构合力分</div>
    </div>
  );
}

// -------- Force Analysis --------
interface ForceAnalysisProps {
  stock: StockData;
}

export function ForceAnalysis({ stock }: ForceAnalysisProps) {
  const analysis = analyzeStock(stock);
  const { action, forceScore, actionLabel, narrative, totalTrackedHolding, totalTrackedChangeMoM, activeInstitutions, movements } = analysis;

  const actionColor = ACTION_CONFIG[action]?.color || 'hsl(var(--muted-foreground))';
  const adders = movements.filter(m => m.action === 'add' || m.action === 'buy').length;
  const reducers = movements.filter(m => m.action === 'reduce' || m.action === 'exit').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="w-4 h-4 text-info" />
          机构合力方向 & 投资建议
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="flex flex-col items-center">
            <ForceGauge score={forceScore} />
            <Badge
              className="mt-2 text-xs px-3 py-0.5 font-semibold"
              style={{ backgroundColor: actionColor, color: '#fff' }}
            >
              {actionLabel}
            </Badge>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">合力分</span>
              <span className="font-mono font-semibold" style={{ color: actionColor }}>{forceScore}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">合计持股</span>
              <span className="font-mono">{totalTrackedHolding}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">环比变化</span>
              <span className={`font-mono ${totalTrackedChangeMoM > 0 ? 'text-bullish' : totalTrackedChangeMoM < 0 ? 'text-bearish' : ''}`}>
                {totalTrackedChangeMoM > 0 ? '+' : ''}{totalTrackedChangeMoM}pp
              </span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">加仓/建仓</span>
              <span className="font-mono text-bullish">{adders} 家</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">减仓/清仓</span>
              <span className="font-mono text-bearish">{reducers} 家</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">活跃机构</span>
              <span className="font-mono">{activeInstitutions} 家</span>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground leading-relaxed">{narrative}</p>
          </div>
        </div>

        {/* Institution Movements */}
        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">著名机构动向明细</div>
          <div className="flex flex-wrap gap-2">
            {movements.map(m => {
              const cfg = ACTION_CONFIG[m.action];
              return (
                <div
                  key={m.instId}
                  className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2 text-xs"
                >
                  <span className="font-medium">{m.brokerName}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                    style={{ borderColor: cfg.color, color: cfg.color }}
                  >
                    {cfg.label}
                  </Badge>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {m.currentHolding}%
                  </span>
                  <span className={`font-mono tabular-nums ${m.changeMoM > 0 ? 'text-bullish' : m.changeMoM < 0 ? 'text-bearish' : 'text-muted-foreground'}`}>
                    {m.changeMoM > 0 ? '+' : ''}{m.changeMoM}pp
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
