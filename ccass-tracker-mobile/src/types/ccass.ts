/** Top 10 participant entry */
export interface TopParticipant {
  rank: number;
  broker: string;
  rawName?: string;        // CCASS 原始登记名（英文全称）
  participant_id: string;
  holding: number;
  shareholding: number;
  change: number;
  isTracked: boolean;
  instId: string | null;
}

/** A single participant's history across all months */
export interface ParticipantSeries {
  id: string;
  name: string;
  rawName?: string;        // CCASS 原始登记名（英文全称）
  instId: string | null;
  series: (number | null)[];
  shareholding: number;
}

/** Stock data */
export interface StockData {
  code: string;
  name: string;
  marketCap: string;
  price: string;
  months: string[];
  dataDates: string[];
  trackedData: Record<string, (number | null)[]>;
  top10Current: TopParticipant[];
  top10Prev: TopParticipant[];
  allParticipants: ParticipantSeries[];
  failedMonths: string[];
}

/** Top-level holdings JSON structure */
export interface HoldingsData {
  generatedAt: string;
  months: string[];
  stocks: Record<string, StockData>;
}

/** Institution action classification */
export type InstitutionAction = 'buy' | 'add' | 'watch' | 'reduce' | 'exit';

/** Institution movement detail */
export interface InstitutionMovement {
  instId: string;
  brokerName: string;
  action: InstitutionAction;
  currentHolding: number;
  changeMoM: number;
  contribution: number;
}

/** Stock force analysis result */
export interface StockAnalysis {
  code: string;
  name: string;
  forceScore: number;
  action: InstitutionAction;
  verdict: string;
  actionLabel: string;
  narrative: string;
  totalTrackedHolding: number;
  totalTrackedChangeMoM: number;
  activeInstitutions: number;
  movements: InstitutionMovement[];
}

/** Multi-stock scan row */
export interface ScanRow {
  code: string;
  name: string;
  forceScore: number;
  action: InstitutionAction;
  actionLabel: string;
}

/** Institution metadata mapping */
export interface InstitutionMeta {
  instId: string;
  name: string;
  shortName: string;
  participantId: string;
}

/** Tracked institutions list
 * PID 均已用 raw_cache 真实数据核对（2026-08）。
 * 同一机构可能有多个账户实体 PID，这里只列主账户（其余账户在 Python 端
 * TRACKED_PARTICIPANTS 里也映射到同一 instId，仪表盘会合并计算）。
 * ⚠️ 历史修正：C00015 实为星展银行(DBS)非美林；真美林=B01224；摩根大通=B01110。
 *    巴克莱(C00031)在监控股票中从未出现，已移除。*/
export const TRACKED_INSTITUTIONS: InstitutionMeta[] = [
  { instId: 'hsbc', name: '汇丰银行', shortName: '汇丰', participantId: 'C00019' },
  { instId: 'citigroup', name: '花旗银行', shortName: '花旗', participantId: 'C00010' },
  { instId: 'standardchartered', name: '渣打银行', shortName: '渣打', participantId: 'C00039' },
  { instId: 'goldman', name: '高盛', shortName: '高盛', participantId: 'B01451' },
  { instId: 'morganstanley', name: '摩根士丹利', shortName: '大摩', participantId: 'B01274' },
  { instId: 'ubs', name: '瑞银', shortName: '瑞银', participantId: 'B01161' },
  { instId: 'jpmorgan', name: '摩根大通', shortName: '小摩', participantId: 'B01110' },
  { instId: 'merrill', name: '美林', shortName: '美林', participantId: 'B01224' },
  { instId: 'dbs', name: '星展银行', shortName: '星展', participantId: 'C00015' },
];

/** Mapping from instId to display name */
export const INST_NAMES: Record<string, string> = Object.fromEntries(
  TRACKED_INSTITUTIONS.map((i) => [i.instId, i.name]),
);

/** Action display labels and colors */
export const ACTION_CONFIG: Record<InstitutionAction, { label: string; color: string }> = {
  buy: { label: '新建仓', color: 'hsl(var(--bullish))' },
  add: { label: '加仓', color: 'hsl(var(--bullish))' },
  watch: { label: '观望', color: 'hsl(var(--muted-foreground))' },
  reduce: { label: '减仓', color: 'hsl(var(--warning))' },
  exit: { label: '清仓', color: 'hsl(var(--bearish))' },
};

/** Force score verdicts */
export const VERDICT_THRESHOLDS = {
  strongBuy: 55,
  buy: 20,
  watch: -20,
  reduce: -55,
} as const;

export function getVerdict(score: number): { action: InstitutionAction; label: string } {
  if (score >= VERDICT_THRESHOLDS.strongBuy) return { action: 'buy', label: '强烈买入' };
  if (score >= VERDICT_THRESHOLDS.buy) return { action: 'add', label: '买入' };
  if (score > VERDICT_THRESHOLDS.watch) return { action: 'watch', label: '观望' };
  if (score > VERDICT_THRESHOLDS.reduce) return { action: 'reduce', label: '减仓' };
  return { action: 'exit', label: '清仓' };
}
