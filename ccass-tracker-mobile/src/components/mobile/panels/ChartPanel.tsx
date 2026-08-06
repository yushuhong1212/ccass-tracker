/**
 * ChartPanel — 经纪商持股比例趋势图（金融科技风格）。
 * 更好的图表容器、交互 chips、视觉优化。
 */
import { useState, useMemo, useEffect } from 'react';
import type { StockData } from '@/types/ccass';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import {
  brokerColor, lastNonNull, MAX_LINES,
} from '@/lib/chart-colors';
import { Search, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartPanelProps {
  stock: StockData;
}

export function ChartPanel({ stock }: ChartPanelProps) {
  const all = stock.allParticipants || [];
  const months = stock.months || [];

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // 切股重置
  useEffect(() => {
    const trackedTop = all
      .filter(p => p.instId)
      .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
      .slice(0, MAX_LINES);
    const def = trackedTop.length
      ? trackedTop.map(p => p.id)
      : all
          .slice()
          .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
          .slice(0, 6)
          .map(p => p.id);
    setSelectedIds(def);
    setSearch('');
  }, [stock.code]);

  const threshold = stock.top10Current?.[9]?.holding;
  const thresholdValue = threshold != null ? threshold : 1.0;

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

  const metaById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; instId: string | null; color: string; last: number | null; rawName?: string }>();
    for (const p of all) {
      m.set(p.id, {
        id: p.id, name: p.name, instId: p.instId ?? null,
        color: brokerColor(p.id, p.instId ?? null),
        last: lastNonNull(p.series || []),
        rawName: p.rawName,
      });
    }
    return m;
  }, [all]);

  const chips = useMemo(() => {
    const sorted = all.slice().sort((a, b) => {
      const ta = a.instId ? 0 : 1, tb = b.instId ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0);
    });
    const q = search.trim().toLowerCase();
    const list = q
      ? sorted.filter(p => (p.name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q) || (p.rawName || '').toLowerCase().includes(q))
      : sorted;
    return q ? list.slice(0, 100) : list.slice(0, 30);
  }, [all, search]);

  const toggle = (pid: string) => {
    setSelectedIds(prev => {
      if (prev.includes(pid)) return prev.filter(i => i !== pid);
      const next = [...prev, pid];
      if (next.length > MAX_LINES) next.shift();
      return next;
    });
  };

  const selectTracked = () => {
    setSelectedIds(
      all.filter(p => p.instId)
        .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
        .slice(0, MAX_LINES).map(p => p.id),
    );
  };
  const selectTop10 = () => {
    setSelectedIds(
      all.slice()
        .sort((a, b) => (lastNonNull(b.series) || 0) - (lastNonNull(a.series) || 0))
        .slice(0, 10).map(p => p.id),
    );
  };
  const clearAll = () => setSelectedIds([]);

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    for (const pid of selectedIds) {
      const m = metaById.get(pid);
      if (m) cfg[pid] = { label: (m.instId ? '★ ' : '') + m.name, color: m.color };
    }
    return cfg;
  }, [selectedIds, metaById]);

  return (
    <div className="space-y-3">
      {/* 图表容器 */}
      <div className="bg-card rounded-xl border border-border/50 p-2 shadow-card">
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontFamily: 'DM Sans' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontFamily: 'DM Sans' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(v: number) => `${v}%`}
                width={36}
              />
              <Tooltip content={<ChartTooltipContent />} />
              <ReferenceLine
                y={thresholdValue}
                stroke="hsl(var(--muted-foreground) / 0.3)"
                strokeDasharray="4 6"
                strokeWidth={1.5}
              />
              {selectedIds.map(pid => {
                const m = metaById.get(pid);
                if (!m) return null;
                const data = chartData.map(d => d[pid] as (number | null));
                const allNull = data.every(v => v == null);
                if (allNull) return null;
                return (
                  <Line
                    key={pid}
                    type="monotone"
                    dataKey={pid}
                    stroke={m.color}
                    strokeWidth={1.8}
                    dot={{ r: 2, fill: m.color, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* 快捷操作栏 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={selectTracked} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-border/60 bg-card shadow-card hover:bg-secondary/60 active:scale-95 transition-all">
          <Eye className="w-3 h-3" /> 著名投行
        </button>
        <button onClick={selectTop10} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-border/60 bg-card shadow-card hover:bg-secondary/60 active:scale-95 transition-all">
          <Eye className="w-3 h-3" /> 当前前十
        </button>
        <button onClick={clearAll} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-border/60 bg-card shadow-card hover:bg-secondary/60 active:scale-95 transition-all">
          <EyeOff className="w-3 h-3" /> 清空
        </button>
        <span className="text-[10px] text-muted-foreground font-mono bg-secondary/60 px-2 py-1 rounded-lg ml-auto">
          {selectedIds.length}/{MAX_LINES}
        </span>
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
        <Input
          placeholder="搜索经纪商名称 / ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 text-xs pl-8 rounded-xl border-border/60 bg-card shadow-card"
        />
      </div>

      {/* chips 列表 */}
      <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto ios-scroll">
        {chips.length === 0 && (
          <div className="flex items-center justify-center w-full py-4">
            <span className="text-xs text-muted-foreground">无匹配经纪商</span>
          </div>
        )}
        {chips.map(p => {
          const selected = selectedIds.includes(p.id);
          const color = brokerColor(p.id, p.instId ?? null);
          const lastV = lastNonNull(p.series || []);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200',
                selected
                  ? 'shadow-sm border'
                  : 'border border-transparent bg-secondary/40',
                p.instId ? 'font-medium' : '',
              )}
              style={selected ? { borderColor: color + '40', backgroundColor: color + '08', color } : {}}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: selected ? color : 'hsl(var(--muted-foreground))' }}
              />
              {p.instId && <span className="text-primary text-[10px]">★</span>}
              <span className="truncate max-w-[90px]">{p.name}</span>
              <span className="font-mono opacity-60 text-[10px]">
                {lastV != null ? lastV.toFixed(2) + '%' : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}