import { useState, useMemo } from 'react';
import type { StockData } from '@/types/ccass';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trophy, ChevronDown, ChevronUp, ChevronsUpDown, Search, TrendingUp, Star } from 'lucide-react';
import { cn, formatShares, formatShareChange } from '@/lib/utils';

// -------- Dropped Institutions Detection --------
// 与原始 index.html 的语义一致：
//   1) 上月在 top10 且 isTracked，本月已不在 top10 → 候选「跌出前十」；
//   2) 取该机构 trackedData 最近 4 个点，要求「连续环比下降」（任一空值或非降即判否）；
//   3) 且 3 个月累计降幅 > 0.2pp → 才标记 isShipOut（主力出货）。
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

    // 只要有「跌出前十」事实就记录（横幅区分主力出货/普通跌出两档）
    // 经纪商名称统一用数据里的原始名（已在数据入口规范化为 CCASS 原始英文名），
    // 不再用 TRACKED_INSTITUTIONS 映射回中文。isTracked 判断仍依赖 instId，星标不受影响。
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

// 检测「仍在榜但环比大幅减持」的经纪商（与原始版一致）：
//   环比 change <= REDUCE_WARN_THRESHOLD(=-3pp) **且持股数量也减少** 才算真减持，
//   避免「配售/增发使分母变大→比例被动下降」被误报。
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

function lastNonNull(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// -------- Top 10 Table --------
interface Top10TableProps {
  stock: StockData;
}

export function Top10Table({ stock }: Top10TableProps) {
  const droppedInstitutions = detectDroppedInstitutions(stock);

  // 上月 top10 的 participant_id → shareholding 映射，用于计算股数环比变化。
  // 仅 top10Prev 提供上月股数；若某机构上月不在前十，则无法对比。
  const prevShMap = new Map<string, number>();
  stock.top10Prev.forEach(p => {
    if (p.participant_id) prevShMap.set(p.participant_id, p.shareholding);
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="w-4 h-4 text-track-accent" />
          前十大经纪商持股排名
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>经纪商</TableHead>
                <TableHead className="text-right">持股比例</TableHead>
                <TableHead className="text-right">环比 / 股数变化</TableHead>
                <TableHead className="text-center w-16">追踪</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.top10Current.map((item, idx) => {
                // 股数环比：用 top10Prev 同 pid 对比；上月不在前十则无法计算。
                const prevSh = item.participant_id ? prevShMap.get(item.participant_id) : undefined;
                const shareDiff = prevSh != null ? item.shareholding - prevSh : null;
                const sh = shareDiff != null ? formatShareChange(shareDiff) : null;
                return (
                  <TableRow
                    key={`${item.participant_id}-${idx}`}
                    className={item.isTracked ? 'bg-accent/20' : ''}
                  >
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {item.rank}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[180px]">
                      <div className="truncate" title={item.rawName || item.broker}>
                        {item.isTracked && <span className="text-track-accent mr-1">★</span>}
                        {item.broker}
                      </div>
                      {item.rawName && item.rawName !== item.broker && (
                        <div className="text-[10px] text-muted-foreground/70 truncate" title={item.rawName}>
                          {item.rawName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {item.holding != null ? item.holding.toFixed(2) + '%' : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums align-middle">
                      <div className="flex flex-col items-end leading-tight">
                        {/* 上行：比例环比变化(pp) */}
                        {item.change == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={item.change > 0 ? 'text-bullish' : item.change < 0 ? 'text-bearish' : 'text-muted-foreground'}>
                            {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}pp
                          </span>
                        )}
                        {/* 下行：股数环比变化（无上月数据则显示当前持股数） */}
                        {sh ? (
                          <span
                            title={`当前 ${formatShares(item.shareholding)} · 上月 ${prevSh != null ? formatShares(prevSh) : '—'}`}
                            className={cn('text-[10px] font-medium', sh.tone === 'up' ? 'text-bullish/80' : sh.tone === 'down' ? 'text-bearish/80' : 'text-muted-foreground')}
                          >
                            {sh.text}股
                          </span>
                        ) : (
                          <span title="当前持股数（上月不在前十，无法对比）" className="text-[10px] text-muted-foreground/70">
                            持 {formatShares(item.shareholding)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.isTracked && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-track-accent text-track-accent">
                          追踪
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Dropped institutions */}
        {droppedInstitutions.length > 0 && (
          <div className="p-3 border-t border-border bg-destructive/5">
            <div className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1">
              📉 已跌出前十的追踪机构
            </div>
            <div className="flex flex-wrap gap-2">
              {droppedInstitutions.map(d => (
                <Badge
                  key={d.instId}
                  variant={d.isShipOut ? 'destructive' : 'outline'}
                  className="text-[10px] gap-1"
                >
                  {d.isShipOut && <span>🚨 主力出货</span>}
                  {d.shortName}
                  <span className="opacity-80">
                    ({d.holding != null ? d.holding.toFixed(2) : '—'}%)
                    {d.totalDrop3m != null ? ` · 3月减${d.totalDrop3m.toFixed(2)}pp` : ''}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Gainer Ranking --------
interface GainerRankingProps {
  stock: StockData;
}

interface GainerItem {
  broker: string;
  rawName?: string;
  participantId: string;
  currentHolding: number;
  change: number;
}

function computeGainers(stock: StockData, topN = 10): GainerItem[] {
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

export function GainerRanking({ stock }: GainerRankingProps) {
  const gainers = computeGainers(stock);

  if (gainers.length === 0) return null;

  // 用绝对值最大者作为进度条分母，涨/跌分别用绿/红
  const maxAbsChange = Math.max(...gainers.map(g => Math.abs(g.change)), 0.01);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-bullish" />
          环比变化排行（近一月）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {gainers.slice(0, 10).map((g, idx) => {
          const up = g.change > 0;
          const barColor = up ? 'from-bullish/70 to-bullish' : 'from-bearish/70 to-bearish';
          return (
            <div key={g.participantId} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-xs text-muted-foreground text-right font-mono">
                {idx + 1}
              </span>
              <span className="flex-1 min-w-0 truncate text-xs" title={g.rawName || g.broker}>{g.broker}</span>
              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden max-w-[120px]">
                <div
                  className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all`}
                  style={{ width: `${(Math.abs(g.change) / maxAbsChange) * 100}%` }}
                />
              </div>
              <span className={`w-16 text-right font-mono text-xs tabular-nums ${up ? 'text-bullish' : 'text-bearish'}`}>
                {g.change > 0 ? '+' : ''}{g.change.toFixed(2)}pp
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// -------- Full Broker Table with Search/Sort --------
interface FullBrokerTableProps {
  stock: StockData;
}

type SortKey = 'holding' | 'shareholding' | 'changeUp' | 'changeDown';

/** 排序表头：点击切换方向，显示明确的升/降/未排序图标。 */
function SortHeader({
  label,
  active,
  direction,
  onClick,
  align = 'right',
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
  align?: 'right' | 'center' | 'left';
}) {
  return (
    <TableHead
      className={cn(
        'cursor-pointer select-none whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
        {active ? (
          direction === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </TableHead>
  );
}

export function FullBrokerTable({ stock }: FullBrokerTableProps) {
  const all = stock.allParticipants || [];
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('holding');
  const [page, setPage] = useState(0);
  const [trackedOnly, setTrackedOnly] = useState(false);
  const perPage = 15;

  const entries = useMemo(() => {
    const list = all
      .map(p => {
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
          holding: cur,                       // 可能为 null
          shareholding: p.shareholding ?? 0,
          change: prev != null && cur != null ? cur - prev : null,  // null 表示无法计算
        };
      })
      .filter(e => (trackedOnly ? !!e.instId : true))
      .filter(e => !search
        || e.name.toLowerCase().includes(search.toLowerCase())
        || (e.id || '').toLowerCase().includes(search.toLowerCase())
        || (e.rawName || '').toLowerCase().includes(search.toLowerCase()));

    // 排序：环比升降序时，无法计算的 null 值沉底
    list.sort((a, b) => {
      if (sortKey === 'holding') return (b.holding ?? -1e9) - (a.holding ?? -1e9);
      if (sortKey === 'shareholding') return b.shareholding - a.shareholding;
      if (sortKey === 'changeUp') return (b.change ?? -1e9) - (a.change ?? -1e9);
      // changeDown：环比减持最多（change 最小）的在前；null 沉底
      return (a.change == null ? 1e9 : a.change) - (b.change == null ? 1e9 : b.change);
    });
    return list;
  }, [all, search, sortKey, trackedOnly]);

  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = entries.slice(safePage * perPage, (safePage + 1) * perPage);

  // 计算可见页码窗口（最多 7 个）
  const pageWindow = useMemo(() => {
    const win: (number | '…')[] = [];
    const add = (p: number) => win.push(p);
    if (totalPages <= 7) {
      for (let i = 0; i < totalPages; i++) add(i);
    } else {
      add(0);
      const start = Math.max(1, safePage - 1);
      const end = Math.min(totalPages - 2, safePage + 1);
      if (start > 1) win.push('…');
      for (let i = start; i <= end; i++) add(i);
      if (end < totalPages - 2) win.push('…');
      add(totalPages - 1);
    }
    return win;
  }, [totalPages, safePage]);

  const sortDirection: 'asc' | 'desc' = sortKey === 'changeDown' ? 'asc' : 'desc';

  const sortBy = (key: 'holding' | 'shareholding' | 'change') => {
    if (key === 'change') {
      setSortKey(sortKey === 'changeUp' ? 'changeDown' : 'changeUp');
    } else {
      setSortKey(key);
    }
    setPage(0);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-muted-foreground" />
            全部经纪持股排行
            <span className="text-xs font-normal text-muted-foreground">{entries.length} 家</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTrackedOnly(v => !v); setPage(0); }}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
                trackedOnly
                  ? 'border-track-accent/40 bg-track-accent/10 text-track-accent'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
              title="只显示被追踪的著名机构"
            >
              <Star className={cn('h-3 w-3', trackedOnly && 'fill-current')} />
              仅追踪机构
            </button>
            <div className="relative w-44">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索经纪商..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>经纪商</TableHead>
                <SortHeader label="持股比例" active={sortKey === 'holding'} direction="desc" onClick={() => sortBy('holding')} />
                <SortHeader label="持股数" active={sortKey === 'shareholding'} direction="desc" onClick={() => sortBy('shareholding')} />
                <SortHeader label="环比变化" active={sortKey === 'changeUp' || sortKey === 'changeDown'} direction={sortDirection} onClick={() => sortBy('change')} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                    无匹配经纪商
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((e, idx) => (
                  <TableRow key={e.id} className={e.instId ? 'bg-accent/10' : ''}>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {safePage * perPage + idx + 1}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      <div className="truncate" title={e.rawName || e.name}>
                        {e.instId && <span className="text-track-accent mr-1">★</span>}
                        {e.name}
                        <span className="ml-1 text-[10px] text-muted-foreground font-mono">{e.id}</span>
                      </div>
                      {e.rawName && e.rawName !== e.name && (
                        <div className="text-[10px] text-muted-foreground/70 truncate" title={e.rawName}>
                          {e.rawName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {e.holding != null ? e.holding.toFixed(2) + '%' : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {(e.shareholding / 1e8).toFixed(2)}亿
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums align-middle">
                      <div className="flex flex-col items-end leading-tight">
                        {/* 上行：比例环比变化(pp) */}
                        {e.change == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={e.change > 0 ? 'text-bullish' : e.change < 0 ? 'text-bearish' : 'text-muted-foreground'}>
                            {e.change > 0 ? '+' : ''}{e.change.toFixed(2)}pp
                          </span>
                        )}
                        {/* 下行：股数变化。全部经纪表无上月股数，无法计算，标注说明。 */}
                        <span
                          title="上月股数未留存，无法计算股数环比变化"
                          className="text-[10px] text-muted-foreground/60"
                        >
                          股数变化 —
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页：页码 + 首尾/上下 */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
            <span className="text-xs text-muted-foreground">共 {entries.length} 条</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setPage(0)} disabled={safePage === 0} className="h-7 px-2 text-xs">
                首页
              </Button>
              {pageWindow.map((p, i) =>
                p === '…' ? (
                  <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'h-7 min-w-[28px] rounded-md px-1.5 text-xs font-medium transition-colors',
                      p === safePage ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {p + 1}
                  </button>
                ),
              )}
              <Button variant="ghost" size="sm" onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} className="h-7 px-2 text-xs">
                末页
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
