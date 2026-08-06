/**
 * detectors.ts — 持仓数据检测的纯逻辑函数（无 React 依赖）。
 *
 * 从桌面版 ccass-tracker-web/src/components/dashboard/Tables.tsx 抽取，
 * 消除 UI 耦合，使桌面版与移动版可共享同一套计算逻辑。
 * 语义与桌面版完全一致（跌出前十 / 主力出货 / 环比大幅减持）。
 */
import type { StockData } from '@/types/ccass';

// -------- 工具函数 --------
function lastNonNull(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// -------- 跌出前十 / 主力出货检测 --------
// 1) 上月在 top10 且 isTracked，本月已不在 top10 → 候选「跌出前十」；
// 2) 取该机构 trackedData 最近 4 个点，要求「连续环比下降」（任一空值或非降即判否）；
// 3) 且 3 个月累计降幅 > 0.2pp → 才标记 isShipOut（主力出货）。
export interface DroppedInst {
  instId: string;
  broker: string;
  shortName: string;
  holding: number;            // 当前最新持股比例(%)
  prevHolding: number | null; // 上月持股比例(%)
  totalDrop3m: number | null; // 近3个月累计降幅(百分点，正数=减持)
  isShipOut: boolean;         // 是否构成「主力出货」（连续下降且累计>0.2pp）
  consecutiveMonths: number;  // 兼容字段：最近连续下降的月数
}

export function detectDroppedInstitutions(stock: StockData): DroppedInst[] {
  const dropped: DroppedInst[] = [];
  if (!stock.top10Current || !stock.top10Prev) return dropped;

  const currentTop10InstIds = new Set(
    stock.top10Current.filter(item => item.isTracked).map(item => item.instId),
  );

  for (const prevItem of stock.top10Prev) {
    if (!prevItem.instId || currentTop10InstIds.has(prevItem.instId)) continue;

    const series = stock.trackedData[prevItem.instId];
    if (!series) continue;

    const currentHolding = lastNonNull(series);
    const prevHolding = series.length >= 2 ? series[series.length - 2] : null;
    const threeMonthsAgo = series.length >= 4 ? series[series.length - 4] : null;

    // 最近 4 个点连续环比下降才计入连续月数
    const recent = series.slice(-4);
    let consecutiveMonths = 0;
    let consecutiveDrop = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] == null || recent[i - 1] == null || (recent[i] as number) >= (recent[i - 1] as number)) {
        consecutiveDrop = false;
        break;
      }
    }
    if (consecutiveDrop) consecutiveMonths = recent.length - 1;

    const totalDrop3m = threeMonthsAgo != null && currentHolding != null
      ? round2(threeMonthsAgo - currentHolding) : null;

    // 主力出货：最近4点连续下降 且 3个月累计降幅 > 0.2pp
    const isShipOut = consecutiveDrop && totalDrop3m != null && totalDrop3m > 0.2;

    dropped.push({
      instId: prevItem.instId,
      broker: prevItem.broker,
      shortName: prevItem.broker,
      holding: currentHolding ?? prevItem.holding,
      prevHolding,
      totalDrop3m,
      isShipOut,
      consecutiveMonths,
    });
  }
  return dropped;
}

// -------- 环比大幅减持检测 --------
// 环比 change <= REDUCE_WARN_THRESHOLD(=-3pp) 且持股数量也减少 才算真减持，
// 避免「配售/增发使分母变大→比例被动下降」被误报。
export interface BigReducer {
  participantId: string;
  broker: string;
  isTracked: boolean;
  change: number;       // 环比变化(百分点)
  shareholding: number; // 当前持股数
  shareholdingChangePct: number | null; // 持股数量变化(%)
}

export const REDUCE_WARN_THRESHOLD = -3; // 环比减持 ≥ 3 个百分点即提示

export function detectBigReducers(stock: StockData): BigReducer[] {
  if (!stock.top10Current || !stock.top10Prev) return [];
  const prevShMap = new Map<string, number>();
  stock.top10Prev.forEach(p => {
    if (p.participant_id) prevShMap.set(p.participant_id, p.shareholding);
  });
  const out: BigReducer[] = [];
  for (const it of stock.top10Current) {
    if (it.change == null || it.change > REDUCE_WARN_THRESHOLD) continue;
    const curSh = it.shareholding;
    const prevSh = prevShMap.get(it.participant_id);
    if (curSh == null || prevSh == null || prevSh === 0) continue; // 股数无法对比则不报
    if (curSh >= prevSh) continue; // 股数没减少（甚至增加）→ 非真减持
    out.push({
      participantId: it.participant_id,
      broker: it.broker,
      isTracked: !!it.isTracked,
      change: it.change,
      shareholding: curSh,
      shareholdingChangePct: prevSh > 0 ? round2((curSh - prevSh) / prevSh * 100) : null,
    });
  }
  return out.sort((a, b) => a.change - b.change);
}

// -------- 环比变化排行（gainers/reducers）--------
export interface GainerItem {
  broker: string;
  rawName?: string;
  participantId: string;
  currentHolding: number;
  change: number;
}

export function computeGainers(stock: StockData, topN = 10): GainerItem[] {
  const all = stock.allParticipants || [];
  const months = stock.months || [];
  if (all.length === 0 || months.length < 2) return [];

  const items = all
    .map((p): GainerItem | null => {
      const series = p.series;
      if (!series || series.length < 2) return null;
      let prev: number | null = null;
      let curr: number | null = null;
      for (let i = series.length - 1; i >= 0; i--) {
        if (curr == null && series[i] != null) curr = series[i];
        else if (prev == null && series[i] != null) { prev = series[i]; break; }
      }
      if (prev == null || curr == null) return null;
      return {
        broker: p.name,
        rawName: p.rawName,
        participantId: p.id,
        currentHolding: curr,
        change: curr - prev,
      };
    })
    .filter((x): x is GainerItem => x !== null)
    .sort((a, b) => b.change - a.change);

  return items.slice(0, topN);
}
