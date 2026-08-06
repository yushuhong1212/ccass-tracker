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

        // 经纪商名称沿用数据层的设定：
        //   - 被跟踪机构（isTracked）：broker = 中文简称（如「汇丰」「花旗」「中登(港)」）
        //   - 其余经纪商：broker = CCASS 原始英文登记名
        // rawName 始终保留英文全称，供 tooltip / 核对真实身份使用，不再覆盖 broker。
        // 数据加载是单点（见 useCCASSData），下游所有读取 broker / name 的组件
        // （表格、图表、分析、警示横幅）会自动显示对应名称，无需逐个改动。

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
