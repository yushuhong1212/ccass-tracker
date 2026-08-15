// ============================================================
// 个股成交量预测引擎 —— 移植自「账房 · 成交量杂志」V5 原型
// 数据源：腾讯财经 ifzq K线接口（浏览器直连，CORS 全开）
// 模型：9 种 + 自动（滚动回测选 MAPE 最小者）
// ============================================================

export interface Point {
  date: Date;
  value: number;
}

export interface ForecastResult {
  fitted: number[];
  preds: number[];
}

// ---------- 腾讯财经接口 ----------

const TX_KLINE = (symbol: string, n: number) =>
  `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${n},qfq&_=${Date.now()}`;

type KlineRow = [string, string, string, string, string, string, ...string[]];

/** 拉取日 K 线。symbol 形如 hk00700 / hkHSI；返回原始行 [日期,开,收,高,低,量] */
export async function fetchKline(symbol: string, n = 640): Promise<KlineRow[]> {
  const resp = await fetch(TX_KLINE(symbol, n));
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const json = await resp.json();
  const node = json.data && json.data[symbol];
  if (!node) throw new Error('未找到该证券的K线数据');
  return (node.qfqday || node.day || []) as KlineRow[];
}

/** K线 → 成交额序列（亿港元）：量 × 均价 / 1e8 */
export function buildAmount(rows: KlineRow[]): Point[] {
  return rows
    .map((r) => {
      const vol = parseFloat(r[5]);
      const avgPx = (parseFloat(r[1]) + parseFloat(r[2]) + parseFloat(r[3]) + parseFloat(r[4])) / 4;
      return { date: new Date(r[0] + 'T00:00:00'), value: +((vol * avgPx) / 1e8).toFixed(3) };
    })
    .filter((p) => p.value > 0.001);
}

/** K线 → 成交股数序列（万股） */
export function buildVolume(rows: KlineRow[]): Point[] {
  return rows
    .map((r) => ({ date: new Date(r[0] + 'T00:00:00'), value: +(parseFloat(r[5]) / 1e4).toFixed(1) }))
    .filter((p) => p.value > 0);
}

export interface SearchItem {
  market: string;
  code: string;
  name: string;
  type: string;
}

/** 腾讯智能搜索盒：JSONP（全局变量 v_hint），支持代码 / 中文名 / 拼音 */
export function smartSearch(q: string): Promise<SearchItem[]> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(q)}&t=all&_=${Date.now()}`;
    s.onload = () => {
      const hint = (window as unknown as Record<string, unknown>).v_hint as string | undefined;
      delete (window as unknown as Record<string, unknown>).v_hint;
      const items = ((hint || '') as string)
        .split('^')
        .slice(0, 12)
        .map((seg) => {
          const p = seg.split('~');
          return p.length >= 4 ? { market: p[0], code: p[1], name: p[2], type: p[3] } : null;
        })
        .filter(Boolean) as SearchItem[];
      resolve(items);
      s.remove();
    };
    s.onerror = () => {
      reject(new Error('搜索接口失败'));
      s.remove();
    };
    document.head.appendChild(s);
  });
}

// ---------- 预测模型（统一签名 (data, h, w)） ----------

function holtFit(data: Point[], h: number, alpha: number, beta: number, phi: number): ForecastResult {
  let level = data[0].value;
  let trend = data[1].value - data[0].value;
  const fitted: number[] = [];
  data.forEach((p, i) => {
    if (i === 0) {
      fitted.push(level);
      return;
    }
    const prevL = level;
    const prevT = trend;
    level = alpha * p.value + (1 - alpha) * (prevL + phi * prevT);
    trend = beta * (level - prevL) + (1 - beta) * phi * prevT;
    fitted.push(level + (phi < 1 ? phi * trend : 0));
  });
  const preds: number[] = [];
  let cumPhi = 0;
  let curPhi = 1;
  for (let k = 1; k <= h; k++) {
    curPhi *= phi;
    cumPhi += curPhi;
    preds.push(Math.max(0, level + cumPhi * trend));
  }
  return { fitted, preds };
}

export const MODELS: Record<string, (data: Point[], h: number, w: number) => ForecastResult> = {
  /** 线性回归（趋势外推） */
  linear(data, h) {
    const n = data.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    data.forEach((p, i) => {
      sx += i; sy += p.value; sxy += i * p.value; sxx += i * i;
    });
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    const fitted = data.map((_, i) => intercept + slope * i);
    const preds: number[] = [];
    for (let k = 1; k <= h; k++) preds.push(Math.max(0, intercept + slope * (n - 1 + k)));
    return { fitted, preds };
  },
  /** 指数加权线性回归：近期数据权重更高（λ=0.995） */
  wlinear(data, h) {
    const n = data.length;
    let sw = 0, swx = 0, swy = 0, swxy = 0, swxx = 0;
    data.forEach((p, i) => {
      const wt = Math.pow(0.995, n - 1 - i);
      sw += wt; swx += wt * i; swy += wt * p.value; swxy += wt * i * p.value; swxx += wt * i * i;
    });
    const det = sw * swxx - swx * swx;
    if (Math.abs(det) < 1e-9) return MODELS.ma(data, h, 5);
    const slope = (sw * swxy - swx * swy) / det;
    const intercept = (swy - slope * swx) / sw;
    const fitted = data.map((_, i) => intercept + slope * i);
    const preds: number[] = [];
    for (let k = 1; k <= h; k++) preds.push(Math.max(0, intercept + slope * (n - 1 + k)));
    return { fitted, preds };
  },
  /** 移动平均（滑动窗口均值外推） */
  ma(data, h, w = 5) {
    const win = Math.max(2, w);
    const fitted = data.map((_, i) => {
      const s = Math.max(0, i - win + 1);
      const seg = data.slice(s, i + 1);
      return seg.reduce((a, p) => a + p.value, 0) / seg.length;
    });
    const last = fitted.slice(-win);
    let level = last.reduce((a, b) => a + b, 0) / win;
    const preds: number[] = [];
    for (let k = 1; k <= h; k++) {
      level = level * 0.92 + level * 0.08;
      preds.push(Math.max(0, level));
    }
    return { fitted, preds };
  },
  holt(data, h) {
    return holtFit(data, h, 0.35, 0.12, 1);
  },
  /** 阻尼 Holt：趋势按 φ=0.95 衰减，多步外推不发散 */
  holtDamped(data, h) {
    return holtFit(data, h, 0.35, 0.1, 0.95);
  },
  /** 网格寻优 Holt：27 组 (α,β,φ) 网格，样本内 MAPE 最小 */
  holtTuned(data, h) {
    let best = { mape: Infinity, a: 0.35, b: 0.1, p: 0.95 };
    const evalFrom = Math.max(1, data.length - 90);
    for (const a of [0.15, 0.35, 0.55])
      for (const b of [0.05, 0.1, 0.2])
        for (const p of [0.85, 0.95, 1]) {
          const r = holtFit(data, 1, a, b, p);
          let errs = 0, cnt = 0;
          for (let i = evalFrom; i < data.length; i++) {
            const act = data[i].value;
            const fit = r.fitted[i];
            if (act > 0 && isFinite(fit)) {
              errs += Math.abs(fit - act) / act;
              cnt++;
            }
          }
          const mape = errs / (cnt || 1);
          if (mape < best.mape) best = { mape, a, b, p };
        }
    return holtFit(data, h, best.a, best.b, best.p);
  },
  /** 简化 ARIMA(1,1,0)：一阶差分 AR(1)，增量均值回复 */
  arima(data, h) {
    const diffs: number[] = [];
    for (let i = 1; i < data.length; i++) diffs.push(data[i].value - data[i - 1].value);
    const mu = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    let num = 0, den = 0;
    diffs.forEach((d, i) => {
      if (i > 0) {
        num += (d - mu) * (diffs[i - 1] - mu);
        den += (diffs[i - 1] - mu) ** 2;
      }
    });
    const phi = den === 0 ? 0 : Math.max(-0.95, Math.min(0.95, num / den));
    let lastD = diffs[diffs.length - 1] - mu;
    let lastV = data[data.length - 1].value;
    const preds: number[] = [];
    for (let k = 1; k <= h; k++) {
      lastD = phi * lastD;
      lastV += mu + lastD;
      preds.push(Math.max(0, lastV));
    }
    const fitted = [data[0].value];
    let fd = 0;
    diffs.forEach((d) => {
      fd = phi * fd;
      fitted.push(fitted[fitted.length - 1] + mu + fd + (d - mu - fd) * 0.3);
    });
    return { fitted, preds };
  },
  /** 对数空间 AR(1) + 星期效应 + 均值回复（为 MAPE 优化） */
  logAR(data, h) {
    const n = data.length;
    const logs = data.map((p) => Math.log(Math.max(1e-9, p.value)));
    const dowMean = new Array(7).fill(0);
    const dowCnt = new Array(7).fill(0);
    for (let i = 1; i < n; i++) {
      const wd = data[i].date.getDay();
      dowMean[wd] += logs[i] - logs[i - 1];
      dowCnt[wd]++;
    }
    for (let w2 = 0; w2 < 7; w2++) dowMean[w2] = dowCnt[w2] ? dowMean[w2] / dowCnt[w2] : 0;
    const dm = (i: number) => dowMean[data[i].date.getDay()];
    let ss = 0;
    let dev = 0;
    const fitted = [data[0].value];
    for (let i = 1; i < n; i++) {
      const step = dm(i) + 0.25 * dev;
      const predLog = logs[i - 1] + step;
      fitted.push(Math.exp(predLog));
      dev = logs[i] - predLog;
      ss += dev * dev;
    }
    const halfVar = Math.min(0.2, ss / (2 * Math.max(1, n - 1)));
    const preds: number[] = [];
    let lastLog = logs[n - 1];
    let fdev = dev;
    const fut = nextTradingDays(data[n - 1].date, h);
    for (let k = 0; k < h; k++) {
      const step = dowMean[fut[k].getDay()] + 0.25 * fdev;
      lastLog += step;
      fdev *= 0.6;
      preds.push(Math.exp(lastLog + halfVar));
    }
    return { fitted, preds };
  },
  /** 集成预测：阻尼Holt + 加权回归 + ARIMA + 对数AR 取中位数 */
  ensemble(data, h, w) {
    const parts = [
      MODELS.holtDamped(data, h, w),
      MODELS.wlinear(data, h, w),
      MODELS.arima(data, h, w),
      MODELS.logAR(data, h, w),
    ];
    const avgFitted = data.map((_, i) => parts.reduce((a, m) => a + m.fitted[i], 0) / parts.length);
    const preds: number[] = [];
    for (let k = 0; k < h; k++) {
      const vs = parts.map((m) => m.preds[k]).sort((a, b) => a - b);
      preds.push(Math.max(0, vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2));
    }
    return { fitted: avgFitted, preds };
  },
};

export const MODEL_KEYS = ['linear', 'wlinear', 'ma', 'holt', 'holtDamped', 'holtTuned', 'arima', 'logAR', 'ensemble'] as const;

export const MODEL_NAMES: Record<string, string> = {
  auto: '自动（回测最优）',
  linear: '线性回归',
  wlinear: '加权线性回归',
  ma: '移动平均',
  holt: 'Holt 指数平滑',
  holtDamped: '阻尼 Holt',
  holtTuned: '网格寻优 Holt',
  arima: 'ARIMA(1,1,0)',
  logAR: '对数AR+星期效应',
  ensemble: '集成预测',
};

export const MODEL_DESC: Record<string, string> = {
  auto: '在最近 90 个交易日上做滚动回测（每日用之前的数据预测当日），自动选用 MAPE 误差最小的模型。',
  linear: '对全序列做最小二乘线性拟合，按趋势外推。适合趋势明显、波动平稳的行情。',
  wlinear: '指数加权线性回归：近期数据权重更高（λ=0.995），比普通线性回归反应灵敏。',
  ma: '以滑动窗口平均平滑序列，用末端均值外推。适合震荡市。',
  holt: '双参数指数平滑，同时估计水平与趋势，对最近数据权重更高。',
  holtDamped: '阻尼 Holt：趋势按系数 φ=0.95 逐日衰减，避免多步外推发散，通常比普通 Holt 更稳。',
  holtTuned: '网格寻优 Holt：对 (α, β, φ) 做 27 组网格搜索，自动选用样本内 MAPE 最小的参数组合。',
  logAR: '对数空间 AR(1)+星期效应：对 log(成交量) 建模（相对误差对症 MAPE）、按星期几修正、增量自回归 + 偏差校正。',
  arima: '对一阶差分建立 AR(1) 模型，假设增量向均值回归。适合均值回复特征的序列。',
  ensemble: '集成预测：阻尼 Holt、加权回归、ARIMA、对数AR 四模型取中位数，对冲单一模型偏差。',
};

/** 滚动回测：用每个交易日之前的全部数据预测当日，统计各模型 MAPE（平均绝对百分比误差） */
export function backtest(data: Point[], w: number, steps = 90): Record<string, number> {
  const scores: Record<string, number> = {};
  const start = Math.max(120, data.length - steps);
  for (const key of MODEL_KEYS) {
    let errs = 0, cnt = 0;
    for (let i = start; i < data.length; i++) {
      const train = data.slice(0, i);
      const r = MODELS[key](train, 1, w);
      const a = data[i].value;
      if (a > 0 && isFinite(r.preds[0])) {
        errs += Math.abs(r.preds[0] - a) / a;
        cnt++;
      }
    }
    scores[key] = errs / (cnt || 1);
  }
  return scores;
}

/** 从最后交易日往后推 n 个工作日（跳过周末，不处理假期） */
export function nextTradingDays(lastDate: Date, n: number): Date[] {
  const days: Date[] = [];
  const d = new Date(lastDate);
  while (days.length < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days.push(new Date(d));
  }
  return days;
}

// ---------- 盘中实时预测（当日分时 → 全天成交量估计） ----------

/** 港股典型日内成交进度剖面：按已过交易分钟数（09:30–12:00 共 150 分钟，13:00–16:00 共 180 分钟，合计 330） */
const PROFILE: [number, number][] = [
  [0, 0], [15, 0.2], [30, 0.33], [60, 0.45], [90, 0.55],
  [120, 0.62], [150, 0.67], [210, 0.85], [240, 0.91], [270, 0.965], [300, 0.99], [330, 1],
];

export function profileFrac(min: number): number {
  if (min <= 0) return 0.01;
  if (min >= 330) return 1;
  for (let i = 1; i < PROFILE.length; i++) {
    if (min <= PROFILE[i][0]) {
      const [x0, y0] = PROFILE[i - 1];
      const [x1, y1] = PROFILE[i];
      return y0 + ((y1 - y0) * (min - x0)) / (x1 - x0);
    }
  }
  return 1;
}

/** HHMM → 已过交易分钟（午休 12:00–13:00 不计） */
export function toTradingMin(hhmm: string): number {
  const h = +hhmm.slice(0, 2);
  const m = +hhmm.slice(2);
  const t = h * 60 + m;
  if (t < 570) return 0; // 09:30 前
  if (t <= 720) return t - 570; // 上午 09:30–12:00 → 0–150
  if (t < 780) return 150; // 午休
  return Math.min(330, t - 780 + 150); // 下午 13:00–16:00 → 150–330
}

export interface IntradayPoint {
  t: string;
  min: number;
  price: number;
  vol: number; // 累计成交股数
  amt: number; // 累计成交额（港元）
}

export interface IntradayData {
  date: string;
  pts: IntradayPoint[];
}

/** 拉取当日分时（每分钟一条：HHMM 价格 累计量 累计额） */
export async function fetchMinute(symbol: string): Promise<IntradayData> {
  const resp = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${symbol}&_=${Date.now()}`);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const json = await resp.json();
  const node = json.data && json.data[symbol];
  const rows: string[] = node && node.data && node.data.data;
  if (!rows || rows.length < 5) throw new Error('无分时数据（可能非交易日或代码无效）');
  const pts = rows.map((r) => {
    const p = r.trim().split(/\s+/);
    return { t: p[0], min: toTradingMin(p[0]), price: +p[1], vol: +p[2], amt: +p[3] };
  });
  return { date: node.data.date, pts };
}

export interface IntradayEstimate {
  cum: number; // 当前累计
  closed: boolean;
  elapsedMin: number;
  pctOfDay: number; // 开盘进度 0–1
  mid: number; // 全天预测（或收盘实际）
  lo: number;
  hi: number;
}

/** 单指标盘中估计：剖面外推（cum/f）与近30分钟速率外推取均值，给出区间 */
export function estimateIntraday(
  values: number[], // 每分钟累计值序列（与 pts 对齐）
  pts: IntradayPoint[],
): IntradayEstimate {
  const lastIdx = values.length - 1;
  const cum = values[lastIdx];
  const elapsed = pts[lastIdx].min;
  const closed = elapsed >= 330;
  if (closed) {
    return { cum, closed, elapsedMin: elapsed, pctOfDay: 1, mid: cum, lo: cum, hi: cum };
  }
  const f = profileFrac(elapsed);
  const estProfile = cum / f;
  const refIdx = Math.max(0, lastIdx - 30);
  const pace =
    (values[lastIdx] - values[refIdx]) / Math.max(1, pts[lastIdx].min - pts[refIdx].min);
  const estPace = cum + pace * (330 - elapsed);
  const lo = Math.min(estProfile, estPace);
  const hi = Math.max(estProfile, estPace);
  return { cum, closed, elapsedMin: elapsed, pctOfDay: elapsed / 330, mid: (estProfile + estPace) / 2, lo, hi };
}
