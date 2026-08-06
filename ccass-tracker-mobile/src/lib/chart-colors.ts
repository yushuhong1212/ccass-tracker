/**
 * chart-colors.ts — 图表配色（从桌面版 Charts.tsx 抽取）。
 * 著名投行用固定色，其余经纪商按 id 哈希到调色板取色。
 */
import type { StockData } from '@/types/ccass';

export const INST_COLORS: Record<string, string> = {
  hsbc: '#f04343',
  jpmorgan: '#3b82f6',
  citigroup: '#06b6d4',
  ubs: '#f59e0b',
  goldman: '#8b5cf6',
  morganstanley: '#00d4aa',
  standardchartered: '#10b981',
  merrill: '#e879f9',
  dbs: '#fb923c',
};

export const PALETTE = [
  '#f04343', '#3b82f6', '#06b6d4', '#f59e0b', '#8b5cf6',
  '#00d4aa', '#e879f9', '#fb923c', '#22c55e', '#ec4899',
  '#0ea5e9', '#a855f7', '#eab308', '#14b8a6', '#f97316', '#6366f1',
];

/** 图表最多折线条数，避免过乱（移动端更紧凑）。 */
export const MAX_LINES = 10;

/** 选取某参与者颜色：著名投行固定色，否则按 id 哈希到调色板。 */
export function brokerColor(id: string, instId: string | null): string {
  if (instId && INST_COLORS[instId]) return INST_COLORS[instId];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** 取序列最后一个非空值。 */
export function lastNonNull(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}

/** 全部经纪商扁平化项（供「全部经纪商」列表/搜索使用）。 */
export interface BrokerEntry {
  id: string;
  name: string;
  rawName?: string;
  instId: string | null;
  holding: number | null;     // 当前持股比例(%)，可能为 null
  shareholding: number;       // 当前持股数
  change: number | null;      // 环比变化(百分点)，null 表示无法计算
}

/** 把 stock.allParticipants 扁平化为带环比的条目列表。 */
export function flattenBrokers(stock: StockData): BrokerEntry[] {
  const all = stock.allParticipants || [];
  return all.map(p => {
    const series = p.series || [];
    let cur: number | null = null, prev: number | null = null;
    for (let i = series.length - 1; i >= 0; i--) {
      if (cur == null && series[i] != null) cur = series[i];
      else if (prev == null && series[i] != null) { prev = series[i]; break; }
    }
    return {
      id: p.id,
      name: p.name,
      rawName: p.rawName,
      instId: p.instId,
      holding: cur,
      shareholding: p.shareholding ?? 0,
      change: prev != null && cur != null ? round2(cur - prev) : null,
    };
  });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
