/**
 * StockPanels — 个股详情折叠面板（金融科技风格）。
 * 用 shadcn Accordion 组织 4 段，每段带摘要和视觉指示。
 */
import type { StockData } from '@/types/ccass';
import { ACTION_CONFIG } from '@/types/ccass';
import { analyzeStock } from '@/lib/analysis';
import { computeGainers } from '@/lib/detectors';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { ChartPanel } from './panels/ChartPanel';
import { Top10Panel } from './panels/Top10Panel';
import { AnalysisPanel } from './panels/AnalysisPanel';
import { AllBrokersPanel } from './panels/AllBrokersPanel';
import { ChevronDown } from 'lucide-react';

interface StockPanelsProps {
  stock: StockData;
}

export function StockPanels({ stock }: StockPanelsProps) {
  const top1 = stock.top10Current?.[0];
  const analysis = analyzeStock(stock);
  const gainers = computeGainers(stock, 1)[0];
  const brokerCount = stock.allParticipants?.length ?? 0;
  const actionColor = ACTION_CONFIG[analysis.action]?.color || '';

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="chart"
      className="w-full px-3 pt-2 space-y-2"
    >
      {/* ① 持股趋势图 */}
      <AccordionItem value="chart" className="border-0">
        <AccordionTrigger className="py-3 px-3.5 rounded-xl bg-card shadow-card border border-border/50 hover:border-border/80 transition-all">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span className="text-sm font-semibold">持股趋势</span>
            <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full font-mono">
              {stock.months?.length ?? 0}m
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground accordion-chevron shrink-0" />
        </AccordionTrigger>
        <AccordionContent className="pt-3 px-1">
          <ChartPanel stock={stock} />
        </AccordionContent>
      </AccordionItem>

      {/* ② 前十大经纪商 */}
      <AccordionItem value="top10" className="border-0">
        <AccordionTrigger className="py-3 px-3.5 rounded-xl bg-card shadow-card border border-border/50 hover:border-border/80 transition-all">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full bg-track-accent shrink-0" />
            <span className="text-sm font-semibold">前十大经纪商</span>
            {top1 && (
              <span className="text-[10px] text-muted-foreground truncate bg-secondary/60 px-1.5 py-0.5 rounded-full">
                {top1.isTracked && '★'}{top1.broker} {top1.holding?.toFixed(1)}%
              </span>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground accordion-chevron shrink-0" />
        </AccordionTrigger>
        <AccordionContent className="pt-3 px-1">
          <Top10Panel stock={stock} />
        </AccordionContent>
      </AccordionItem>

      {/* ③ 机构合力分析 */}
      <AccordionItem value="analysis" className="border-0">
        <AccordionTrigger className="py-3 px-3.5 rounded-xl bg-card shadow-card border border-border/50 hover:border-border/80 transition-all">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: actionColor }} />
            <span className="text-sm font-semibold">机构合力</span>
            <span
              className="text-[11px] font-semibold font-mono tabular-nums bg-secondary/60 px-1.5 py-0.5 rounded-full"
              style={{ color: actionColor }}
            >
              {analysis.forceScore > 0 ? '+' : ''}{analysis.forceScore} {analysis.actionLabel}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground accordion-chevron shrink-0" />
        </AccordionTrigger>
        <AccordionContent className="pt-3 px-1">
          <AnalysisPanel stock={stock} />
        </AccordionContent>
      </AccordionItem>

      {/* ④ 全部经纪商 */}
      <AccordionItem value="all" className="border-0">
        <AccordionTrigger className="py-3 px-3.5 rounded-xl bg-card shadow-card border border-border/50 hover:border-border/80 transition-all">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
            <span className="text-sm font-semibold">全部经纪商</span>
            <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full font-mono">
              {brokerCount}
            </span>
            {gainers && (
              <span className="text-[10px] text-bullish bg-bullish/5 px-1.5 py-0.5 rounded-full truncate">
                ↑{gainers.broker}
              </span>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground accordion-chevron shrink-0" />
        </AccordionTrigger>
        <AccordionContent className="pt-3 px-1">
          <AllBrokersPanel stock={stock} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}