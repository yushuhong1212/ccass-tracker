import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化持股数量（绝对值）为中文简写：≥1亿显示“x.xx亿”，否则“x万”。
 * 例：2994375791 → “29.94亿”；43174076 → “4317.41万”。
 */
export function formatShares(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return n.toLocaleString('zh-CN');
}

/**
 * 格式化股数变化：带正负号 + 涨跌色（ bullish/bearish/中性）。
 * 返回 { text, tone }，tone 用于 className 上色。
 */
export function formatShareChange(change: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  const tone: 'up' | 'down' | 'flat' = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const sign = change > 0 ? '+' : '';
  return { text: `${sign}${formatShares(change)}`, tone };
}

