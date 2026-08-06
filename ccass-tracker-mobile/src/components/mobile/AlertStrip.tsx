/**
 * AlertStrip — 紧凑警示横幅（金融科技风格）。
 * 带图标 + 彩色标签 + 动画入场。
 */
import { ShieldAlert, TrendingDown, AlertTriangle } from 'lucide-react';
import type { StockData } from '@/types/ccass';
import { detectDroppedInstitutions, detectBigReducers } from '@/lib/detectors';
import { cn } from '@/lib/utils';

interface AlertStripProps {
  stock: StockData;
}

export function AlertStrip({ stock }: AlertStripProps) {
  const dropped = detectDroppedInstitutions(stock);
  const reducers = detectBigReducers(stock);
  const shipOut = dropped.filter(d => d.isShipOut);
  const otherDropped = dropped.filter(d => !d.isShipOut);

  if (shipOut.length === 0 && otherDropped.length === 0 && reducers.length === 0) {
    return null;
  }

  // 得分：计算风险等级
  const riskLevel = shipOut.length > 0 ? 'high' : reducers.length > 0 ? 'medium' : 'low';

  return (
    <div className="mx-4 mt-3 animate-slide-up">
      <div className={cn(
        'rounded-xl border p-3 space-y-2.5 shadow-card',
        riskLevel === 'high'
          ? 'border-red-200 bg-red-50/80'
          : riskLevel === 'medium'
          ? 'border-orange-200 bg-orange-50/80'
          : 'border-amber-200 bg-amber-50/80',
      )}>
        {/* 标题行 */}
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center',
            riskLevel === 'high' ? 'bg-red-100' : riskLevel === 'medium' ? 'bg-orange-100' : 'bg-amber-100',
          )}>
            <ShieldAlert className={cn(
              'w-4 h-4',
              riskLevel === 'high' ? 'text-red-600' : riskLevel === 'medium' ? 'text-orange-600' : 'text-amber-600',
            )} />
          </div>
          <span className={cn(
            'text-xs font-semibold',
            riskLevel === 'high' ? 'text-red-700' : riskLevel === 'medium' ? 'text-orange-700' : 'text-amber-700',
          )}>
            {riskLevel === 'high' ? '风险提示' : riskLevel === 'medium' ? '减持提醒' : '关注提醒'}
          </span>
          <span className={cn(
            'ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full',
            riskLevel === 'high' ? 'bg-red-200/50 text-red-700' : riskLevel === 'medium' ? 'bg-orange-200/50 text-orange-700' : 'bg-amber-200/50 text-amber-700',
          )}>
            {shipOut.length + otherDropped.length + reducers.length} 项
          </span>
        </div>

        {/* 内容区 */}
        <div className="space-y-2">
          {/* ① 主力出货 */}
          {shipOut.length > 0 && (
            <div className="flex items-start gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-[12px] text-red-700 leading-relaxed">
                <span className="font-semibold">主力出货：</span>
                {shipOut.map(d => (
                  <span key={d.instId} className="inline-flex items-center gap-1 bg-red-100/50 rounded px-1.5 py-0.5 mx-0.5 font-medium">
                    {d.shortName}
                  </span>
                ))}
                <span className="text-red-600/70"> 持续减持，已跌出前十</span>
              </div>
            </div>
          )}

          {/* ② 普通跌出前十 */}
          {otherDropped.length > 0 && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[12px] text-amber-700 leading-relaxed">
                <span className="font-semibold">跌出前十：</span>
                {otherDropped.map(d => (
                  <span key={d.instId} className="bg-amber-100/50 rounded px-1.5 py-0.5 mx-0.5">
                    {d.shortName}{d.holding != null ? `(${d.holding.toFixed(1)}%)` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ③ 环比大幅减持 */}
          {reducers.length > 0 && (
            <div className="flex items-start gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-orange-700 font-semibold mb-1.5">环比大幅减持：</div>
                <div className="flex flex-wrap gap-1.5">
                  {reducers.map(r => (
                    <span
                      key={r.participantId}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]',
                        'bg-orange-100/60 border border-orange-200/50',
                        r.isTracked && 'ring-1 ring-orange-300/50 font-medium',
                      )}
                    >
                      {r.broker}
                      <span className="font-mono tabular-nums text-orange-700">
                        {r.change.toFixed(1)}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}