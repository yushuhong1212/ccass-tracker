import type { StockData, HoldingsData, InstitutionAction, StockAnalysis, ScanRow } from '@/types/ccass';
import { ACTION_CONFIG, getVerdict } from '@/types/ccass';

// -------- 基础序列工具 --------
function lastNonNull(series: (number | null)[]): number | null {
  if (!series || !series.length) return null;
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}

function changeMoM(series: (number | null)[]): number | null {
  if (!series || series.length < 2) return null;
  const v: number[] = [];
  for (const val of series) if (val != null) v.push(val);
  if (v.length < 2) return null;
  return v[v.length - 1] - v[v.length - 2];
}

function changePeriod(series: (number | null)[]): number | null {
  if (!series || series.length < 2) return null;
  let first: number | null = null;
  for (const val of series) {
    if (val != null && first == null) { first = val; break; }
  }
  const last = lastNonNull(series);
  if (first == null || last == null) return null;
  return last - first;
}

function trendSlope(series: (number | null)[]): number {
  const pts: [number, number][] = [];
  for (let i = 0; i < series.length; i++) {
    const val = series[i];
    if (val != null) pts.push([i, val]);
  }
  const n = pts.length;
  if (n < 2) return 0;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) * (x - mx); }
  return den === 0 ? 0 : num / den;
}

function round(v: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round((v || 0) * p) / p;
}

// -------- 单个著名机构的动作判定 --------
interface InstitutionClassifyResult {
  action: InstitutionAction;
  mom: number | null;
  period: number | null;
  last: number | null;
}

function classifyInstitution(series: (number | null)[]): InstitutionClassifyResult {
  const last = lastNonNull(series);
  const mom = changeMoM(series);
  const period = changePeriod(series);
  const slope = trendSlope(series);

  let minStart = 0;
  for (const v of series) if (v != null) { minStart = v; break; }

  if (last != null && last <= 0.05) return { action: 'exit', mom, period, last };
  if (last != null && last < 0.3 && period != null && period <= -0.2 && minStart > 0.15)
    return { action: 'exit', mom, period, last };
  if (minStart <= 0.1 && last != null && last >= 0.2)
    return { action: 'buy', mom, period, last };
  if (mom != null && mom <= -0.05 && slope < 0)
    return { action: 'reduce', mom, period, last };
  if (mom != null && mom >= 0.05 && slope >= 0)
    return { action: 'add', mom, period, last };
  return { action: 'watch', mom, period, last };
}

const ACTION_SCORE: Record<InstitutionAction, number> = {
  buy: +2, add: +1, watch: 0, reduce: -1, exit: -2,
};

// -------- 机构移动详情（内部中间结构）--------
interface InstMoveDetail {
  id: string;
  name: string;
  instId: string;
  series: (number | null)[];
  last: number | null;
  mom: number | null;
  period: number | null;
  action: InstitutionAction;
  actionLabel: string;
  weight: number;
}

// -------- 单只股票合力分析 --------
export function analyzeStock(stock: StockData): StockAnalysis {
  const all = stock.allParticipants || [];
  const tracked = all.filter(p => p.instId);
  const months = stock.months || [];

  const instMoves: InstMoveDetail[] = tracked.map(p => {
    const series = p.series || [];
    const cls = classifyInstitution(series);
    const last = cls.last != null ? cls.last : 0;
    const w = Math.log(1 + Math.max(last, 0)) + 0.5;
    return {
      id: p.id,
      name: p.name,
      instId: p.instId!,
      series,
      last: cls.last,
      mom: cls.mom,
      period: cls.period,
      action: cls.action,
      actionLabel: ACTION_CONFIG[cls.action].label,
      weight: w,
    };
  });

  const totalW = instMoves.reduce((s, m) => s + m.weight, 0) || 1;
  const rawScore = instMoves.reduce((s, m) => s + ACTION_SCORE[m.action] * m.weight, 0) / totalW;
  let score = Math.max(-100, Math.min(100, round(rawScore * 50, 0)));

  const lastTotal = round(instMoves.reduce((s, m) => s + (m.last || 0), 0), 2);
  const netChangeMoM = round(instMoves.reduce((s, m) => s + (m.mom || 0), 0), 3);
  const adders = instMoves.filter(m => m.action === 'add' || m.action === 'buy').length;
  const reducers = instMoves.filter(m => m.action === 'reduce' || m.action === 'exit').length;

  // 趋势修正
  const totSeries = months.map((_, i) =>
    round(instMoves.reduce((s, m) => s + ((m.series[i] != null) ? m.series[i] : 0), 0), 3),
  );
  const totSlope = trendSlope(totSeries);
  score += Math.max(-8, Math.min(8, round(totSlope * 10, 0)));
  score = Math.max(-100, Math.min(100, score));

  const verdict = getVerdict(score);
  const narrative = buildNarrative({
    score, instMoves, adders, reducers, lastTotal, netChangeMoM, totSlope, months,
  });

  // 排序机构明细
  instMoves.sort((a, b) =>
    (ACTION_SCORE[b.action] - ACTION_SCORE[a.action]) || ((b.mom || 0) - (a.mom || 0)),
  );

  return {
    code: stock.code,
    name: stock.name,
    forceScore: score,
    action: verdict.action,
    actionLabel: verdict.label,
    verdict: verdict.label,
    narrative,
    totalTrackedHolding: lastTotal,
    totalTrackedChangeMoM: netChangeMoM,
    activeInstitutions: tracked.length,
    movements: instMoves.map(m => ({
      instId: m.instId,
      brokerName: m.name,
      action: m.action,
      currentHolding: round(m.last || 0, 2),
      changeMoM: round(m.mom || 0, 3),
      contribution: round(m.weight, 2),
    })),
  };
}

interface NarrativeInput {
  score: number;
  instMoves: InstMoveDetail[];
  adders: number;
  reducers: number;
  lastTotal: number;
  netChangeMoM: number;
  totSlope: number;
  months: string[];
}

function buildNarrative(o: NarrativeInput): string {
  const { instMoves, adders, reducers, months } = o;
  const lastTotal = round(o.lastTotal, 2);
  const netChangeMoM = round(o.netChangeMoM, 2);
  const totSlope = round(o.totSlope, 3);
  const parts: string[] = [];
  const topAdd = instMoves
    .filter(m => m.action === 'add' || m.action === 'buy')
    .sort((a, b) => (b.mom || 0) - (a.mom || 0));
  const topReduce = instMoves
    .filter(m => m.action === 'reduce' || m.action === 'exit')
    .sort((a, b) => (a.mom || 0) - (b.mom || 0));
  const fmtMom = (m: InstMoveDetail) =>
    m.mom != null ? (m.mom > 0 ? '+' : '') + round(m.mom, 2) : 0;

  parts.push(`近 ${months.length} 个月，著名机构合计持有约 ${lastTotal}%。`);
  if (netChangeMoM > 0.05)
    parts.push(`最近一月净增持 ${netChangeMoM} 个百分点，`);
  else if (netChangeMoM < -0.05)
    parts.push(`最近一月净减持 ${Math.abs(netChangeMoM)} 个百分点，`);
  else
    parts.push('最近一月持仓基本持平，');

  if (totSlope > 0.02)
    parts.push(`期间整体呈上行趋势（斜率 +${totSlope}/期）。`);
  else if (totSlope < -0.02)
    parts.push(`期间整体呈下行趋势（斜率 ${totSlope}/期）。`);
  else
    parts.push('期间整体趋势平稳。');

  if (adders > reducers && adders > 0) {
    const names = topAdd.slice(0, 3).map(m => `${m.name}(${fmtMom(m)}pp)`).join('、');
    parts.push(`共 ${adders} 家在加仓/建仓（${names}…），机构合力偏多。`);
  } else if (reducers > adders && reducers > 0) {
    const names = topReduce.slice(0, 3).map(m => `${m.name}(${fmtMom(m)}pp)`).join('、');
    parts.push(`共 ${reducers} 家在减仓/清仓（${names}…），机构合力偏空。`);
  } else {
    parts.push(`多空分歧（加 ${adders} : 减 ${reducers}），方向不明，建议等待信号。`);
  }
  return parts.join(' ');
}

// -------- 多股扫描对比 --------
export function analyzeAll(dataset: HoldingsData): ScanRow[] {
  const codes = Object.keys(dataset.stocks || {});
  const rows: ScanRow[] = codes.map(code => {
    const s = dataset.stocks[code];
    const a = analyzeStock(s);
    return {
      code,
      name: s.name || code,
      forceScore: a.forceScore,
      action: a.action,
      actionLabel: a.actionLabel,
    };
  });
  return rows;
}

export function sortScanRows(rows: ScanRow[], key: keyof ScanRow, desc: boolean): ScanRow[] {
  const order = desc ? -1 : 1;
  return rows.slice().sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name, 'zh') * order;
    const va = a[key] ?? -1e9;
    const vb = b[key] ?? -1e9;
    return (Number(va) - Number(vb)) * order;
  });
}
