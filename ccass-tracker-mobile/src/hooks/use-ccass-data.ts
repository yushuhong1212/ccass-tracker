import { useState, useEffect, useCallback } from 'react';
import type { HoldingsData, StockData } from '@/types/ccass';

interface CCASSDataState {
  data: HoldingsData | null;
  loading: boolean;
  error: string | null;
}

export function useCCASSData() {
  const [state, setState] = useState<CCASSDataState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const resp = await fetch('/data/holdings.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const json: HoldingsData = await resp.json();

        if (json.generatedAt && json.generatedAt.includes('示例')) {
          throw new Error('当前数据为示例数据，请等待正式数据加载');
        }

        // 经纪商名称统一显示为 CCASS 原始英文名 (rawName)，不再使用数据里的中文替代名。
        // 数据加载是单点（见 useCCASSData），在此处就地规范化后，下游所有读取
        // broker / name 字段的组件（表格、图表、分析、警示横幅）都会自动显示英文名，
        // 无需逐个组件改动。rawName 在数据中 100% 完整，无 rawName 时保留原值兜底。
        for (const stock of Object.values(json.stocks)) {
          for (const p of stock.top10Current ?? []) if (p.rawName) p.broker = p.rawName;
          for (const p of stock.top10Prev ?? []) if (p.rawName) p.broker = p.rawName;
          for (const p of stock.allParticipants ?? []) if (p.rawName) p.name = p.rawName;
        }

        if (!cancelled) setState({ data: json, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : '数据加载失败',
          });
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  return state;
}

/** Hook for stock selection and navigation */
export function useStockSelector(data: HoldingsData | null) {
  const [currentCode, setCurrentCode] = useState<string>('');

  const stockCodes = data ? Object.keys(data.stocks) : [];
  const currentStock: StockData | null = data && currentCode ? data.stocks[currentCode] ?? null : null;

  // Auto-select first stock on data load
  useEffect(() => {
    if (data && stockCodes.length > 0 && !currentCode) {
      setCurrentCode(stockCodes[0]);
    }
  }, [data, stockCodes, currentCode]);

  const hasNext = currentCode ? stockCodes.indexOf(currentCode) < stockCodes.length - 1 : false;
  const hasPrev = currentCode ? stockCodes.indexOf(currentCode) > 0 : false;

  const goNext = useCallback(() => {
    if (!hasNext || !currentCode) return;
    const idx = stockCodes.indexOf(currentCode);
    setCurrentCode(stockCodes[idx + 1]);
  }, [currentCode, stockCodes, hasNext]);

  const goPrev = useCallback(() => {
    if (!hasPrev || !currentCode) return;
    const idx = stockCodes.indexOf(currentCode);
    setCurrentCode(stockCodes[idx - 1]);
  }, [currentCode, stockCodes, hasPrev]);

  const selectCode = useCallback((code: string) => {
    if (data && data.stocks[code]) setCurrentCode(code);
  }, [data]);

  return {
    currentCode,
    currentStock,
    stockCodes,
    selectCode,
    goNext,
    goPrev,
    hasNext,
    hasPrev,
  };
}
