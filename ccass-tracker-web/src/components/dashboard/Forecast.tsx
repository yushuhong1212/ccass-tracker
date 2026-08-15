import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RefreshCw, LineChart as LineChartIcon, Activity } from 'lucide-react';
import {
  fetchKline,
  buildAmount,
  buildVolume,
  smartSearch,
  MODELS,
  MODEL_KEYS,
  MODEL_NAMES,
  MODEL_DESC,
  backtest,
  nextTradingDays,
  fetchMinute,
  estimateIntraday,
  type Point,
  type SearchItem,
  type IntradayData,
} from '@/lib/forecast';

interface IntradayCardProps {
  intraday: { loading: boolean; error: string | null; data: IntradayData | null; updatedAt: number | null };
  autoRefresh: boolean;
  onToggleAuto: (v: boolean) => void;
  onRefresh: () => void;
  dailyAmount: Point[] | null;
  dailyVolume: Point[] | null;
}

/** 当日盘中实时预测：分时累计 → 剖面/速率双估计 → 全天成交量区间 */
function IntradayCard({ intraday, autoRefresh, onToggleAuto, onRefresh, dailyAmount, dailyVolume }: IntradayCardProps) {
  const { data, loading, error, updatedAt } = intraday;

  const amtSeries = data ? data.pts.map((p) => p.amt / 1e8) : null;
  const volSeries = data ? data.pts.map((p) => p.vol / 1e4) : null;
  const estAmt = amtSeries && data ? estimateIntraday(amtSeries, data.pts) : null;
  const estVol = volSeries && data ? estimateIntraday(volSeries, data.pts) : null;
  const prevAmt = dailyAmount && dailyAmount.length > 1 ? dailyAmount[dailyAmount.length - 1].value : null;
  const prevVol = dailyVolume && dailyVolume.length > 1 ? dailyVolume[dailyVolume.length - 1].value : null;
  const lastT = data ? data.pts[data.pts.length - 1].t : '';

  const rows =
    data && amtSeries && volSeries
      ? data.pts.map((p, i) => ({ label: p.t, amount: +amtSeries[i].toFixed(2), volume: +volSeries[i].toFixed(1) }))
      : [];

  const cssVar = (name: string) => `hsl(var(--${name}))`;

  const metricCards = (
    est: { cum: number; closed: boolean; pctOfDay: number; mid: number; lo: number; hi: number } | null,
    prev: number | null,
    name: string,
    unit: string,
  ) => {
    if (!est) return null;
    const vsYesterday = est.mid != null && prev != null && prev > 0 ? ((est.mid - prev) / prev) * 100 : null;
    return (
      <>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">
            {name}当前累计（{lastT}）
          </div>
          <div className="font-display text-lg font-bold tabular-nums text-foreground mt-0.5">
            {fmtNum(est.cum)}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {est.closed ? '已收盘' : `已开盘 ${(est.pctOfDay * 100).toFixed(0)}%`}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">{est.closed ? `${name}全天实际` : `${name}全天预测`}</div>
          <div className="font-display text-lg font-bold tabular-nums text-primary mt-0.5">
            {fmtNum(est.mid)}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {est.closed ? data?.date : `区间 ${fmtNum(est.lo)} ~ ${fmtNum(est.hi)}`}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">{est.closed ? `${name} vs 上一交易日` : `预测 vs 上一交易日`}</div>
          <div
            className={`font-display text-lg font-bold tabular-nums mt-0.5 ${
              vsYesterday == null ? 'text-foreground' : vsYesterday >= 0 ? 'text-bullish' : 'text-bearish'
            }`}
          >
            {vsYesterday == null ? (
              '—'
            ) : (
              <>
                {vsYesterday >= 0 ? '▲' : '▼'} {Math.abs(vsYesterday).toFixed(1)}%
              </>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {prev != null ? `昨日 ${fmtNum(prev)} ${unit}` : '无昨日数据'}
          </div>
        </div>
      </>
    );
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            当日盘中预测（实时）
          </span>
          {data && (
            <span className="text-[11px] text-muted-foreground">
              {data.date} · {rows.length} 分钟
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {data && (
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => onToggleAuto(e.target.checked)}
                  className="accent-primary"
                />
                自动刷新(60s)
              </label>
            )}
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onRefresh} disabled={loading}>
              {loading ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              刷新
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}（非交易日或代码无效时分时不可用）
          </div>
        )}

        {!data && !loading && !error && (
          <div className="flex h-20 flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <span className="text-xs">盘中用日内成交进度剖面 + 近 30 分钟速率双估计，外推今日全天成交量</span>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onRefresh}>
              加载分时数据
            </Button>
          </div>
        )}

        {loading && !data && (
          <div className="flex h-20 items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-xs">正在拉取分时数据…</span>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {metricCards(estAmt, prevAmt, '成交额', '亿港元')}
              {metricCards(estVol, prevVol, '成交股数', '万股')}
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cssVar('border')} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: cssVar('muted-foreground') }}
                    axisLine={{ stroke: cssVar('border') }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={36}
                  />
                  <YAxis
                    yAxisId="amt"
                    tick={{ fontSize: 10, fill: cssVar('primary') }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <YAxis
                    yAxisId="vol"
                    orientation="right"
                    tick={{ fontSize: 10, fill: cssVar('info') }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip
                    contentStyle={{
                      background: cssVar('popover'),
                      border: `1px solid ${cssVar('border')}`,
                      borderRadius: 4,
                      fontSize: 11,
                      color: cssVar('popover-foreground'),
                    }}
                    labelStyle={{ color: cssVar('muted-foreground'), fontSize: 10 }}
                    formatter={(value, name) => {
                      const v = value == null ? null : Number(value);
                      return v == null || !isFinite(v)
                        ? ['—', String(name)]
                        : [v.toLocaleString('zh-CN'), String(name)];
                    }}
                  />
                  <Line
                    yAxisId="amt"
                    type="monotone"
                    dataKey="amount"
                    name="累计成交额(亿港元)"
                    stroke={cssVar('primary')}
                    strokeWidth={1.6}
                    dot={false}
                  />
                  <Line
                    yAxisId="vol"
                    type="monotone"
                    dataKey="volume"
                    name="累计成交股数(万股)"
                    stroke={cssVar('info')}
                    strokeWidth={1.6}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              全天预测 = 日内成交进度剖面外推与近 30 分钟速率外推的均值（区间取两者上下界）。剖面按港股典型 U
              型节奏（开盘与收盘活跃、午间清淡）标定。
              {updatedAt ? ` 更新于 ${new Date(updatedAt).toLocaleTimeString('zh-CN')}` : ''}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export interface TrackedStock {
  code: string;
  name: string;
}

interface ForecastProps {
  trackedStocks: TrackedStock[];
  defaultCode?: string;
}

type ViewMode = 'amount' | 'volume';

const HORIZON_CHIPS = [5, 10, 20, 40, 60];
const RANGE_CHIPS = [60, 120, 250];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtNum(x: number): string {
  if (!isFinite(x)) return '—';
  if (x >= 1000) return Math.round(x).toLocaleString('zh-CN');
  if (x >= 100) return x.toFixed(0);
  if (x >= 10) return x.toFixed(1);
  return x.toFixed(2);
}

interface SearchState {
  items: SearchItem[];
  open: boolean;
}

export function StockForecast({ trackedStocks, defaultCode }: ForecastProps) {
  // ── 数据与选择状态 ──
  const [stock, setStock] = useState<{ code: string; name: string } | null>(
    defaultCode
      ? { code: defaultCode, name: trackedStocks.find((s) => s.code === defaultCode)?.name || defaultCode }
      : null,
  );
  const [raw, setRaw] = useState<Point[] | null>(null); // 成交额序列（亿港元）
  const [rawVol, setRawVol] = useState<Point[] | null>(null); // 成交股数序列（万股）
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 预测设置 ──
  const [view, setView] = useState<ViewMode>('amount');
  const [modelKey, setModelKey] = useState('auto');
  const [horizon, setHorizon] = useState(10);
  const [maWindow, setMaWindow] = useState(5);
  const [showMA, setShowMA] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [range, setRange] = useState(120);

  // ── 搜索（任意港股，代码/名称/拼音）──
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ items: [], open: false });
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 盘中实时预测 ──
  const [intraday, setIntraday] = useState<{
    loading: boolean;
    error: string | null;
    data: IntradayData | null;
    updatedAt: number | null;
  }>({ loading: false, error: null, data: null, updatedAt: null });
  const [autoRefresh, setAutoRefresh] = useState(true);

  const symbol = stock ? 'hk' + stock.code.padStart(5, '0') : null;

  const loadIntraday = useCallback(async (sym: string) => {
    setIntraday((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchMinute(sym);
      setIntraday({ loading: false, error: null, data, updatedAt: Date.now() });
    } catch (e) {
      setIntraday({ loading: false, error: e instanceof Error ? e.message : String(e), data: null, updatedAt: Date.now() });
    }
  }, []);

  // 自动刷新：开启且已加载过 → 每 60s 拉一次分时
  useEffect(() => {
    if (!autoRefresh || !symbol || !intraday.data) return;
    const id = setInterval(() => loadIntraday(symbol), 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, symbol, intraday.data, loadIntraday]);

  // 切换股票时清掉旧分时
  useEffect(() => {
    setIntraday({ loading: false, error: null, data: null, updatedAt: null });
  }, [stock?.code]);

  const loadStock = useCallback(async (code: string, name?: string) => {
    setLoading(true);
    setError(null);
    try {
      const symbol = 'hk' + code.padStart(5, '0');
      const rows = await fetchKline(symbol, 640);
      const amounts = buildAmount(rows);
      const vols = buildVolume(rows);
      if (amounts.length < 30) throw new Error('该股历史数据不足 30 条，无法建模');
      setRaw(amounts);
      setRawVol(vols);
      setStock({ code, name: name || code });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRaw(null);
      setRawVol(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次挂载：自动加载默认股票（追踪列表第一个或指定代码）
  useEffect(() => {
    const target = defaultCode || trackedStocks[0]?.code;
    if (target) {
      const name = trackedStocks.find((s) => s.code === target)?.name;
      loadStock(target, name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击外部关闭搜索下拉
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearch((s) => ({ ...s, open: false }));
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onQueryChange = (q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) {
      setSearch({ items: [], open: false });
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const items = await smartSearch(q.trim());
        const hk = items.filter((it) => it.market === 'hk' && /^0?\d{4,5}$/.test(it.code));
        const list = (hk.length ? hk : items).slice(0, 8);
        setSearch({ items: list, open: list.length > 0 });
      } catch {
        setSearch({ items: [], open: false });
      }
    }, 350);
  };

  // ── 预测计算（记忆化）──
  const data = view === 'amount' ? raw : rawVol;
  const unit = view === 'amount' ? '亿港元' : '万股';

  const computed = useMemo(() => {
    if (!data || data.length < 30) return null;
    const scores = backtest(data, maWindow);
    const ranked = [...MODEL_KEYS].sort((a, b) => scores[a] - scores[b]);
    const actualKey = modelKey === 'auto' ? ranked[0] : modelKey;
    const result = MODELS[actualKey](data, horizon, maWindow);
    const future = nextTradingDays(data[data.length - 1].date, horizon);
    // MA 线
    const maSeries = data.map((_, i) => {
      const s = Math.max(0, i - maWindow + 1);
      const seg = data.slice(s, i + 1);
      return seg.reduce((a, p) => a + p.value, 0) / seg.length;
    });
    // 图表行：近 range 天历史 + 预测（衔接点放最后实值）
    const startIdx = Math.max(0, data.length - range);
    const rows: { label: string; actual?: number | null; forecast?: number | null; ma?: number | null }[] = [];
    for (let i = startIdx; i < data.length; i++) {
      rows.push({
        label: fmtDate(data[i].date).slice(2).replace(/-/g, '/'),
        actual: data[i].value,
        ma: showMA ? maSeries[i] : null,
        forecast: i === data.length - 1 ? data[i].value : null,
      });
    }
    future.forEach((d, k) => {
      rows.push({ label: fmtDate(d).slice(2).replace(/-/g, '/'), forecast: result.preds[k] });
    });
    return { scores, ranked, actualKey, result, future, rows };
  }, [data, modelKey, horizon, maWindow, showMA, range]);

  const last = data && data.length ? data[data.length - 1] : null;
  const nextPred = computed?.result.preds[0] ?? null;
  const pctChange =
    last && nextPred != null && last.value > 0 ? ((nextPred - last.value) / last.value) * 100 : null;
  const avg20 =
    data && data.length >= 20
      ? data.slice(-20).reduce((a, p) => a + p.value, 0) / 20
      : null;

  const cssVar = (name: string) => `hsl(var(--${name}))`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
      {/* ══════════ 左侧：控制面板 ══════════ */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* 选股 */}
          <div className="space-y-2">
            <div className="text-xs font-semibold tracking-wide text-foreground">① 选择股票</div>
            <div className="relative" ref={searchBoxRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && /^\d{1,5}$/.test(query.trim())) {
                      loadStock(query.trim());
                      setSearch((s) => ({ ...s, open: false }));
                    }
                  }}
                  placeholder="代码 / 名称 / 拼音，如 00700 或 腾讯"
                  className="pl-8 text-xs h-8"
                />
              </div>
              {search.open && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-md border border-border bg-popover shadow-md max-h-60 overflow-y-auto">
                  {search.items.map((it) => (
                    <button
                      key={it.market + it.code}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
                      onClick={() => {
                        loadStock(it.code, it.name);
                        setQuery(`${it.code.padStart(5, '0')} ${it.name}`);
                        setSearch((s) => ({ ...s, open: false }));
                      }}
                    >
                      <span className="font-mono font-semibold text-primary">{it.code.padStart(5, '0')}</span>
                      <span className="flex-1 truncate text-foreground">{it.name}</span>
                      <span className="text-muted-foreground">{it.market === 'hk' ? '港股' : it.market.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {trackedStocks.length > 0 && (
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                value={stock?.code || ''}
                onChange={(e) => {
                  const s = trackedStocks.find((t) => t.code === e.target.value);
                  if (s) loadStock(s.code, s.name);
                }}
              >
                {trackedStocks.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} {s.name}
                  </option>
                ))}
              </select>
            )}
            {stock && !loading && !error && (
              <div className="text-[11px] text-muted-foreground">
                当前：<span className="font-semibold text-accent-foreground">{stock.name}</span>（{stock.code}）·{' '}
                {raw ? `${raw.length} 个交易日` : ''}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-[11px]"
              disabled={!stock || intraday.loading}
              onClick={() => stock && loadIntraday('hk' + stock.code.padStart(5, '0'))}
            >
              {intraday.loading ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> : <Activity className="mr-1 h-3 w-3" />}
              预测今日成交量（盘中实时）
            </Button>
          </div>

          {/* 模型 */}
          <div className="space-y-2">
            <div className="text-xs font-semibold tracking-wide text-foreground">② 预测模型</div>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              value={modelKey}
              onChange={(e) => setModelKey(e.target.value)}
            >
              <option value="auto">自动 · 回测误差最小（推荐）</option>
              {MODEL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {MODEL_NAMES[k]}
                </option>
              ))}
            </select>
            <p className="text-[11px] leading-relaxed text-muted-foreground min-h-[48px]">
              {MODEL_DESC[modelKey]}
              {modelKey === 'auto' && computed
                ? ` 当前最优：${MODEL_NAMES[computed.actualKey]}（MAPE ${(computed.scores[computed.ranked[0]] * 100).toFixed(1)}%）。`
                : ''}
            </p>
          </div>

          {/* 预测天数 */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold tracking-wide text-foreground">③ 预测天数：{horizon} 天</div>
            <div className="flex gap-1.5 flex-wrap">
              {HORIZON_CHIPS.map((v) => (
                <button
                  key={v}
                  onClick={() => setHorizon(v)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                    horizon === v
                      ? 'border-primary bg-primary text-primary-foreground font-semibold'
                      : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
                  }`}
                >
                  {v} 天
                </button>
              ))}
            </div>
          </div>

          {/* 高级选项 */}
          <details className="border-t border-border pt-2">
            <summary className="cursor-pointer select-none text-[11px] font-semibold tracking-wide text-muted-foreground">
              高级选项
            </summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center justify-between text-[11px] text-muted-foreground">
                MA 窗口：{maWindow} 天
                <input
                  type="range"
                  min={3}
                  max={30}
                  value={maWindow}
                  onChange={(e) => setMaWindow(+e.target.value)}
                  className="w-28 accent-primary"
                />
              </label>
              <label className="flex items-center gap-2 text-[11px] text-foreground">
                <input type="checkbox" checked={showMA} onChange={(e) => setShowMA(e.target.checked)} className="accent-primary" />
                显示移动平均线
              </label>
              <label className="flex items-center gap-2 text-[11px] text-foreground">
                <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} className="accent-primary" />
                对数刻度 Y 轴
              </label>
            </div>
          </details>

          {/* 回测排行 */}
          {computed && (
            <div className="border-t border-border pt-2 space-y-1 pb-1">
              <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                回测误差排行（近 90 日 · MAPE 越小越好）
              </div>
              {computed.ranked.slice(0, 5).map((k, i) => (
                <div key={k} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-24 truncate ${i === 0 ? 'text-accent-foreground font-semibold' : 'text-muted-foreground'}`}>
                    {MODEL_NAMES[k]}
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/50'}`}
                      style={{
                        width: `${Math.min(100, (computed.scores[k] / computed.scores[computed.ranked[0]]) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-11 text-right tabular-nums text-muted-foreground">
                    {(computed.scores[k] * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════ 右侧：统计 + 图表 ══════════ */}
      <div className="space-y-4 min-w-0">
        {/* 统计卡 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">最新成交{view === 'amount' ? '额' : '量'}</div>
            <div className="font-display text-lg font-bold tabular-nums text-foreground mt-0.5">
              {last ? fmtNum(last.value) : '—'}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{last ? fmtDate(last.date) : ''}</div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">预测下一交易日</div>
            <div
              className={`font-display text-lg font-bold tabular-nums mt-0.5 ${
                pctChange != null && pctChange >= 0 ? 'text-bullish' : 'text-bearish'
              }`}
            >
              {nextPred != null ? fmtNum(nextPred) : '—'}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
            </div>
            <div className="text-[10px] mt-0.5">
              {pctChange != null && (
                <span className={pctChange >= 0 ? 'text-bullish' : 'text-bearish'}>
                  {pctChange >= 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}%
                </span>
              )}
              {computed && <span className="text-muted-foreground"> · {fmtDate(computed.future[0])}</span>}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">20 日均值</div>
            <div className="font-display text-lg font-bold tabular-nums text-foreground mt-0.5">
              {avg20 != null ? fmtNum(avg20) : '—'}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {last && avg20 != null && (
                <span className={last.value >= avg20 ? 'text-bullish' : 'text-bearish'}>
                  较均值 {last.value >= avg20 ? '+' : ''}
                  {(((last.value - avg20) / avg20) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">采用模型</div>
            <div className="text-sm font-semibold text-accent-foreground mt-0.5 leading-tight">
              {computed ? MODEL_NAMES[computed.actualKey] : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {computed ? `MAPE ${(computed.scores[computed.actualKey] * 100).toFixed(1)}%` : ''}
            </div>
          </div>
        </div>

        {/* 盘中实时预测卡 */}
        <IntradayCard
          intraday={intraday}
          autoRefresh={autoRefresh}
          onToggleAuto={setAutoRefresh}
          onRefresh={() => stock && loadIntraday('hk' + stock.code.padStart(5, '0'))}
          dailyAmount={raw}
          dailyVolume={rawVol}
        />

        {/* 视图切换 + 时间范围 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              className={`px-3 py-1 text-xs font-medium ${view === 'amount' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('amount')}
            >
              成交额（亿港元）
            </button>
            <button
              className={`px-3 py-1 text-xs font-medium ${view === 'volume' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('volume')}
            >
              成交股数（万股）
            </button>
          </div>
          <div className="ml-auto flex gap-1.5">
            {RANGE_CHIPS.map((v) => (
              <button
                key={v}
                onClick={() => setRange(v)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                  range === v
                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                    : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
                }`}
              >
                {v} 日
              </button>
            ))}
          </div>
        </div>

        {/* 图表 */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            {error && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                拉取失败：{error}（请确认代码正确，主板为 5 位数字，如 00700）
                <Button variant="outline" size="sm" className="ml-2 h-6 text-[11px]" onClick={() => stock && loadStock(stock.code, stock.name)}>
                  重试
                </Button>
              </div>
            )}
            {loading && (
              <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span className="text-xs">正在从腾讯财经拉取 {stock?.code} 日K数据…</span>
              </div>
            )}
            {!loading && computed && (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <LineChartIcon className="h-3.5 w-3.5" />
                  <span>
                    {stock?.name}（{stock?.code}）· 成交{view === 'amount' ? '额' : '量'}历史与预测
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <i className="inline-block h-0.5 w-4 bg-primary" /> 历史
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="inline-block h-0.5 w-4 border-t-2 border-dashed border-primary" /> 预测 {horizon} 日
                    </span>
                  </span>
                </div>
                <div className="h-[340px] sm:h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={computed.rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={cssVar('border')} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: cssVar('muted-foreground') }}
                        axisLine={{ stroke: cssVar('border') }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: cssVar('muted-foreground') }}
                        axisLine={false}
                        tickLine={false}
                        width={46}
                        scale={logScale ? 'log' : 'linear'}
                        domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
                        allowDataOverflow={logScale}
                      />
                      <Tooltip
                        contentStyle={{
                          background: cssVar('popover'),
                          border: `1px solid ${cssVar('border')}`,
                          borderRadius: 4,
                          fontSize: 11,
                          color: cssVar('popover-foreground'),
                        }}
                        labelStyle={{ color: cssVar('muted-foreground'), fontSize: 10 }}
                        formatter={(value, name) => {
                          const v = value == null ? null : Number(value);
                          return v == null || !isFinite(v)
                            ? ['—', String(name)]
                            : [`${v.toLocaleString('zh-CN')} ${unit}`, String(name)];
                        }}
                      />
                      {showMA && (
                        <Line
                          type="monotone"
                          dataKey="ma"
                          name={`MA${maWindow}`}
                          stroke={cssVar('muted-foreground')}
                          strokeWidth={1}
                          strokeOpacity={0.7}
                          dot={false}
                          connectNulls
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="历史"
                        stroke={cssVar('foreground')}
                        strokeWidth={1.8}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        name="预测"
                        stroke={cssVar('primary')}
                        strokeWidth={1.8}
                        strokeDasharray="6 4"
                        dot={{ r: 2, fill: cssVar('primary') }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  数据源：腾讯财经日K（前复权）。成交额按「成交量 × 当日均价」估算；预测为统计模型外推，仅供研究参考，不构成投资建议。
                </p>
              </>
            )}
            {!loading && !computed && !error && (
              <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-muted-foreground">
                <Search className="h-5 w-5" />
                <span className="text-xs">在左侧选择或搜索一只港股，即可预测其成交量</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
