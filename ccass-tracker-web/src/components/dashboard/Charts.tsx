import { useState, useMemo, useEffect } from 'react';
import type { StockData } from '@/types/ccass';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { BarChart3, Search, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// -------- Chart Color Palette（账房杂志风：低饱和刊物色系） --------
// 跟踪机构用固定色，其余经纪商用调色板哈希取色。
const INST_COLORS: Record<string, string> = {
  cscchk: '#8F3B2E',            // 中登(港) - 砖红
  hgt: '#C07A3E',               // 港股通(沪) - 陶土橙
  sgt: '#D2A76B',               // 港股通(深) - 浅铜
  cicc: '#96688F',              // 中金 - 灰紫
  citigroup: '#4E7A9E',         // 花旗 - 灰蓝
  hsbc: '#B4543E',              // 汇丰 - 赭红
  standardchartered: '#4E8262', // 渣打 - 苔绿
  ubs: '#757AA6',               // 瑞银 - 蓝紫
  morganstanley: '#4E857E',     // 大摩 - 青绿
  merrill: '#A66A74',           // 美林 - 豆沙红
  jpmorgan: '#3F6E9E',          // 小摩 - 石蓝
  goldman: '#94813F',           // 高盛 - 橄榄金
};
const PALETTE = [
  '#B4543E', '#C07A3E', '#94813F', '#75814B', '#4E8262', '#4E857E',
  '#5A7E93', '#3F6E9E', '#757AA6', '#96688F', '#A66A74', '#8F3B2E',
  '#C89B6C', '#7F8B7A', '#8D7F9C', '#5E6B54',
];

const MAX_LINES = 12; // 折线最多条数，避免图表过乱

/** 选取某参与者颜色：著名投行固定色，否则按 id 哈希到调色板。 */
function brokerColor(id: string, instId: string | null): string {
  if (instId && INST_COLORS[instId]) return INST_COLORS[instId];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function lastNonNull(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}

interface HoldingsChartProps {
  stock: StockData;
}

export function HoldingsChart({ stock }: HoldingsChartProps) {
  const all = stock.allParticipants || [];
  const months = stock.months || [];

  // 当前选中的参与者 ID 列表（按选择顺序）
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  // 鼠标悬停高亮的参与者 ID（用于折线 & 图例联动高亮）
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 切换股票时重置为默认选择：著名投行优先，最多 8 个；若无则取持股最大的前 6
  useEffect(() => {
    const trackedTop = all
      .filter(p => p.instId)
      .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
      .slice(0, 8);
    const def = trackedTop.length
      ? trackedTop.map(p => p.id)
      : all
          .slice()
          .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
          .slice(0, 6)
          .map(p => p.id);
    setSelectedIds(def);
    setSearch('');
    // 仅在 stock.code 变化时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock.code]);

  // 前十门槛参考值（第 10 名持股比例）
  const threshold = stock.top10Current?.[9]?.holding;
  const thresholdValue = threshold != null ? threshold : 1.0;

  // 构建图表数据：每行 = { month, [pid1]: v, [pid2]: v, ... }
  const chartData = useMemo(() => {
    return months.map((month, idx) => {
      const point: Record<string, string | number | null> = { month };
      for (const pid of selectedIds) {
        const p = all.find(x => x.id === pid);
        if (!p) continue;
        const series = p.series || [];
        point[pid] = idx < series.length ? series[idx] : null;
      }
      return point;
    });
  }, [months, selectedIds, all]);

  // 参与者 → {p, color, last} 快速查找
  const metaById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; instId: string | null; color: string; last: number | null }>();
    for (const p of all) {
      m.set(p.id, {
        id: p.id,
        name: p.name,
        instId: p.instId ?? null,
        color: brokerColor(p.id, p.instId ?? null),
        last: lastNonNull(p.series || []),
      });
    }
    return m;
  }, [all]);

  // chips 列表：著名投行优先，再按持股比例降序；带搜索过滤
  const chips = useMemo(() => {
    const sorted = all.slice().sort((a, b) => {
      const ta = a.instId ? 0 : 1, tb = b.instId ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0);
    });
    const q = search.trim().toLowerCase();
    const list = q
      ? sorted.filter(p => (p.name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q))
      : sorted;
    // 搜索时多显示些，否则截断避免渲染过多
    return (q ? list.slice(0, 200) : list.slice(0, 80));
  }, [all, search]);

  const toggle = (pid: string) => {
    setSelectedIds(prev => {
      if (prev.includes(pid)) return prev.filter(i => i !== pid);
      const next = [...prev, pid];
      if (next.length > MAX_LINES) next.shift();
      return next;
    });
  };

  // 快捷：仅著名投行
  const selectTracked = () => {
    setSelectedIds(
      all
        .filter(p => p.instId)
        .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
        .slice(0, MAX_LINES)
        .map(p => p.id),
    );
  };
  // 快捷：当前前十
  const selectTop10 = () => {
    setSelectedIds(
      all
        .slice()
        .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
        .slice(0, 10)
        .map(p => p.id),
    );
  };
  const clearAll = () => setSelectedIds([]);

  // chart 配置（供 ChartTooltipContent 显示名称）
  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    for (const pid of selectedIds) {
      const m = metaById.get(pid);
      if (m) cfg[pid] = { label: (m.instId ? '★ ' : '') + m.name, color: m.color };
    }
    return cfg;
  }, [selectedIds, metaById]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-info" />
            经纪商持股比例变化
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 font-medium text-info">
              已选 {selectedIds.length}/{MAX_LINES}
            </span>
            <span className="hidden sm:inline">近 {months.length} 个月</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <ChartContainer config={chartConfig} className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip content={<ChartTooltipContent />} />
              {/* 前十门槛参考线 */}
              <ReferenceLine
                y={thresholdValue}
                stroke="hsl(var(--muted-foreground) / 0.5)"
                strokeDasharray="4 6"
                strokeWidth={1.5}
                label={{ value: `前十门槛≈${thresholdValue.toFixed(2)}%`, position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              {selectedIds.map(pid => {
                const m = metaById.get(pid);
                if (!m) return null;
                const data = chartData.map(d => d[pid] as (number | null));
                const allNull = data.every(v => v == null);
                if (allNull) return null;
                const dimmed = hoveredId != null && hoveredId !== pid;
                return (
                  <Line
                    key={pid}
                    type="monotone"
                    dataKey={pid}
                    stroke={m.color}
                    strokeWidth={hoveredId === pid ? 2.8 : 1.8}
                    strokeOpacity={dimmed ? 0.18 : 1}
                    dot={{ r: 2, fill: m.color }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* 当前选中图例（hover 高亮 / 点击移除） */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2.5">
            {selectedIds.map(pid => {
              const m = metaById.get(pid);
              if (!m) return null;
              const active = hoveredId === pid;
              return (
                <button
                  key={pid}
                  onMouseEnter={() => setHoveredId(pid)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => toggle(pid)}
                  className={cn('group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-all', active && 'ring-1 ring-offset-0')}
                  style={{ borderColor: m.color, color: m.color, backgroundColor: active ? `${m.color}1a` : 'transparent' }}
                  title="点击移除 · 悬停高亮"
                >
                  {m.instId && <Star className="h-2.5 w-2.5 fill-current" />}
                  <span className="max-w-[110px] truncate">{m.name}</span>
                  {m.last != null && <span className="font-mono opacity-70">{m.last.toFixed(2)}%</span>}
                  <X className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
                </button>
              );
            })}
          </div>
        )}

        {/* 控件栏 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">添加经纪商：</span>
          <div className="flex gap-1">
            <Button onClick={selectTracked} variant="outline" size="sm" className="h-6 px-2 text-[11px]">
              <Star className="h-3 w-3 text-track-accent" /> 著名投行
            </Button>
            <Button onClick={selectTop10} variant="outline" size="sm" className="h-6 px-2 text-[11px]">前十</Button>
            {selectedIds.length > 0 && (
              <Button onClick={clearAll} variant="ghost" size="sm" className="h-6 px-2 text-[11px]">清空</Button>
            )}
          </div>
          <div className="relative ml-auto min-w-[120px] max-w-[220px] flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="搜索名称 / ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        {/* 全部经纪商 chips（点击添加，双击单独查看） */}
        <div className="flex flex-wrap gap-1.5">
          {chips.length === 0 && (
            <span className="text-xs text-muted-foreground">无匹配经纪商</span>
          )}
          {chips.map(p => {
            const selected = selectedIds.includes(p.id);
            const color = brokerColor(p.id, p.instId ?? null);
            const lastV = lastNonNull(p.series || []);
            const active = hoveredId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                onDoubleClick={() => { setSelectedIds([p.id]); setHoveredId(p.id); }}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
                title={`${p.rawName || p.name} (${p.id})  最新 ${lastV != null ? lastV.toFixed(2) + '%' : '—'}  · 双击单独查看`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-all',
                  selected ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                  p.instId && 'font-medium',
                  active && 'ring-1',
                )}
                style={selected
                  ? { borderColor: color, color, backgroundColor: active ? `${color}1a` : 'transparent' }
                  : { borderColor: 'transparent', color: 'hsl(var(--muted-foreground))' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                {p.instId && <span className="text-track-accent">★</span>}
                <span className="max-w-[120px] truncate">{p.name}</span>
                <span className="font-mono opacity-70">
                  {lastV != null ? lastV.toFixed(2) + '%' : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
