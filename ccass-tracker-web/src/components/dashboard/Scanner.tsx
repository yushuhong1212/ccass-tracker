import { useState, useMemo } from 'react';
import type { HoldingsData } from '@/types/ccass';
import { ACTION_CONFIG } from '@/types/ccass';
import { analyzeAll, sortScanRows } from '@/lib/analysis';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/dashboard/Layout';

interface StockScannerProps {
  data: HoldingsData;
  onSelectStock: (code: string) => void;
}

type ScanSortKey = 'code' | 'name' | 'forceScore';

export function StockScanner({ data, onSelectStock }: StockScannerProps) {
  const [sortKey, setSortKey] = useState<ScanSortKey>('forceScore');
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');

  const allRows = useMemo(() => sortScanRows(analyzeAll(data), sortKey, sortDesc), [data, sortKey, sortDesc]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const handleSort = (key: ScanSortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(key === 'forceScore');
    }
  };

  const SortIcon = ({ col }: { col: ScanSortKey }) => {
    if (sortKey !== col) return <ChevronRight className="ml-1 inline h-3 w-3 opacity-0" />;
    return sortDesc ? <ChevronDown className="ml-1 inline h-3 w-3" /> : <ChevronUp className="ml-1 inline h-3 w-3" />;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-muted-foreground" />
            多股扫描 · 机构合力对比
            <span className="text-xs font-normal text-muted-foreground">{rows.length} 只</span>
          </CardTitle>
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索代码 / 名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24 cursor-pointer select-none" onClick={() => handleSort('code')}>
                  代码 <SortIcon col="code" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
                  名称 <SortIcon col="name" />
                </TableHead>
                <TableHead className="w-48 cursor-pointer select-none" onClick={() => handleSort('forceScore')}>
                  合力分 <SortIcon col="forceScore" />
                </TableHead>
                <TableHead className="w-24 text-center">建议</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState title="无匹配股票" description="试试调整搜索关键词" />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const cfg = ACTION_CONFIG[row.action];
                  // 合力分映射到 0~100%（-100~+100），正负向中线左右延伸
                  const halfPct = (Math.abs(row.forceScore) / 100) * 50;
                  const positive = row.forceScore >= 0;
                  return (
                    <TableRow
                      key={row.code}
                      className="group cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => onSelectStock(row.code)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.code}</TableCell>
                      <TableCell className="text-sm font-medium">{row.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                'absolute top-0 h-full rounded-full transition-all',
                                positive
                                  ? 'left-1/2 bg-gradient-to-r from-bullish/50 to-bullish'
                                  : 'right-1/2 bg-gradient-to-l from-bearish/50 to-bearish',
                              )}
                              style={{ width: `${halfPct}%` }}
                            />
                            <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                          </div>
                          <span className="w-9 text-right font-mono text-sm font-semibold tabular-nums" style={{ color: cfg.color }}>
                            {row.forceScore > 0 ? '+' : ''}{row.forceScore}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] px-2 py-0" style={{ borderColor: cfg.color, color: cfg.color }}>
                          {row.actionLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground/40 transition-colors group-hover:text-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
