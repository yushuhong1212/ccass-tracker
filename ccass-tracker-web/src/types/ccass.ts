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
 * PID 均已用 raw_cache 真实数据核对（2026-08-03）。
 * ⚠️ 2026-08-03 调整：跟踪清单按用户指定更新，聚焦「中登/港股通 + 主流投行」。
 *    注意：A00003/A00004/A00005 三者 CCASS 英文名完全相同，只能靠 PID 区分，
 *    故不在名称兜底匹配里设中登关键词（Python 端 NAME_KEYWORD_MAP 同步处理）。*/
export const TRACKED_INSTITUTIONS: InstitutionMeta[] = [
  { instId: 'cscchk', name: '中国证券登记结算（香港）', shortName: '中登(港)', participantId: 'A00005' },
  { instId: 'hgt', name: '港股通（沪）', shortName: '港股通(沪)', participantId: 'A00003' },
  { instId: 'sgt', name: '港股通（深）', shortName: '港股通(深)', participantId: 'A00004' },
  { instId: 'cicc', name: '中金', shortName: '中金', participantId: 'B01654' },
  { instId: 'citigroup', name: '花旗银行', shortName: '花旗', participantId: 'C00010' },
  { instId: 'hsbc', name: '上海汇丰银行', shortName: '汇丰', participantId: 'C00019' },
  { instId: 'standardchartered', name: '渣打银行', shortName: '渣打', participantId: 'C00039' },
  { instId: 'ubs', name: '瑞银', shortName: '瑞银', participantId: 'B01161' },
  { instId: 'morganstanley', name: '大摩', shortName: '大摩', participantId: 'B01274' },
  { instId: 'merrill', name: '美林', shortName: '美林', participantId: 'B01224' },
  { instId: 'jpmorgan', name: '小摩', shortName: '小摩', participantId: 'B01110' },
  { instId: 'goldman', name: '高盛', shortName: '高盛', participantId: 'B01451' },
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
