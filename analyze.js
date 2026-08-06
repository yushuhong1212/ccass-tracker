/* ===========================================================================
 * analyze.js — CCASS 持仓变化量化分析引擎
 * ===========================================================================
 * 目标：把「著名机构投行的持仓变化」转化为「合力方向 → 投资动作建议」。
 * 不预测股价，只描述机构合力；输出供 index.html 渲染的纯数据结构。
 *
 * 输入：dataset = { months:[...], stocks: { '00700': { allParticipants, top10Current, top10Prev, trackedData, ... } } }
 * 输出：见 analyzeStock() / analyzeAll() 的返回结构。
 *
 * 设计要点（数据分析师视角）：
 *  1. 只看「著名机构投行」（instId 命中者），因为它们才是「聪明钱」代表；
 *     全市场参与者里很多是中证登/散户托管券商，噪声大。
 *  2. 合力 = 多家机构方向的一致性，而非单一机构幅度。
 *  3. 区分「环比（近一月）」与「期间趋势（数月方向）」，避免被单月噪声误导。
 *  4. 识别「背离」：前十门槛/集中度上升但著名机构在撤 → 派发信号。
 *  5. 最终映射到五档动作：强烈买入 / 买入(建仓/加仓) / 观望 / 减仓 / 清仓。
 * =========================================================================== */
(function (global) {
  'use strict';

  // -------- 基础序列工具 --------
  function lastNonNull(series) {
    if (!series || !series.length) return null;
    for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
    return null;
  }
  // 最近一个有值点 与 上一个有值点 的差（环比，百分点）
  function changeMoM(series) {
    if (!series || series.length < 2) return null;
    const v = [];
    for (let i = 0; i < series.length; i++) if (series[i] != null) v.push(series[i]);
    if (v.length < 2) return null;
    return v[v.length - 1] - v[v.length - 2];
  }
  // 期间首末差（最早有值 → 最新有值，百分点）
  function changePeriod(series) {
    if (!series || series.length < 2) return null;
    let first = null, last = null;
    for (let i = 0; i < series.length; i++) if (series[i] != null && first == null) first = series[i];
    last = lastNonNull(series);
    if (first == null || last == null) return null;
    return last - first;
  }
  // 简单线性回归斜率（用最小二乘，单位：百分点/期），判断趋势稳健性
  function trendSlope(series) {
    const pts = [];
    for (let i = 0; i < series.length; i++) if (series[i] != null) pts.push([i, series[i]]);
    const n = pts.length;
    if (n < 2) return 0;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n;
    const my = pts.reduce((s, p) => s + p[1], 0) / n;
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) * (x - mx); }
    return den === 0 ? 0 : num / den;
  }
  function round(v, d) { const dd = (d == null ? 2 : d); const p = Math.pow(10, dd); return Math.round((v || 0) * p) / p; }

  // -------- 单个著名机构的动作判定 --------
  // 规则（基于持股占比百分点的变化）：
  //   exit(清仓离场): 最新≈0 或 期间减持>50% 且当前占比<0.3%
  //   reduce(减仓):   环比/期间均明显下降(<=-0.05) 且趋势向下
  //   add(加仓):      环比明显上升(>=+0.05) 且趋势向上
  //   buy(新建仓):    此前基本无持仓(<=0.1%)，最新明显有(>=0.2%)
  //   watch(观望):    其余（小幅波动）
  function classifyInstitution(p) {
    const series = p.series || [];
    const last = lastNonNull(series);
    const mom = changeMoM(series);
    const period = changePeriod(series);
    const slope = trendSlope(series);

    const minStart = (() => { for (const v of series) if (v != null) return v; return 0; })();

    if (last != null && last <= 0.05) return { action: 'exit', mom, period, last };
    if (last != null && last < 0.3 && period != null && period <= -0.2 && minStart > 0.15)
      return { action: 'exit', mom, period, last };
    if (minStart <= 0.1 && last != null && last >= 0.2)
      return { action: 'buy', mom, period, last };
    if (mom != null && mom <= -0.05 && slope < 0)
      return { action: 'reduce', mom, period, last };
    if (mom != null && mom >= 0.05 && slope >= 0)
      return { action: 'add', mom, period, last };
    return { action: 'watch', mom, period, last };
  }

  const ACTION_LABEL = { buy: '新建仓', add: '加仓', watch: '观望', reduce: '减仓', exit: '清仓' };
  const ACTION_SCORE = { buy: +2, add: +1, watch: 0, reduce: -1, exit: -2 };

  // -------- 单只股票合力分析 --------
  function analyzeStock(stock) {
    const all = stock.allParticipants || [];
    const tracked = all.filter(p => p.instId); // 只看著名机构投行
    const months = stock.months || [];

    // 1. 各机构动作 + 加权贡献（按持股规模加权，大行声音更重）
    const instMoves = tracked.map(p => {
      const cls = classifyInstitution(p);
      const last = cls.last != null ? cls.last : 0;
      // 权重：ln(1+last)，避免大行（如汇丰32%）完全压制小行
      const w = Math.log(1 + Math.max(last, 0)) + 0.5;
      return {
        id: p.id, name: p.name, instId: p.instId, series: p.series,
        last: cls.last, mom: cls.mom, period: cls.period,
        action: cls.action, actionLabel: ACTION_LABEL[cls.action], weight: w,
      };
    });

    const totalW = instMoves.reduce((s, m) => s + m.weight, 0) || 1;
    // 2. 合力分：动作分按权重加权 → 归一化到 -100~+100
    let rawScore = instMoves.reduce((s, m) => s + ACTION_SCORE[m.action] * m.weight, 0) / totalW; // -2~+2
    let score = Math.max(-100, Math.min(100, round(rawScore * 50, 0)));

    // 3. 辅助统计
    const lastTotal = instMoves.reduce((s, m) => s + (m.last || 0), 0);          // 著名机构合计占比
    const netChangeMoM = round(instMoves.reduce((s, m) => s + (m.mom || 0), 0), 3); // 净环比变化(百分点)
    const netChangePeriod = round(instMoves.reduce((s, m) => s + (m.period || 0), 0), 3);
    const adders = instMoves.filter(m => m.action === 'add' || m.action === 'buy').length;
    const reducers = instMoves.filter(m => m.action === 'reduce' || m.action === 'exit').length;
    const watchN = instMoves.filter(m => m.action === 'watch').length;

    // 4. 趋势修正：用合计占比的趋势斜率微调（一致上行 +8 / 一致下行 -8 上限）
    const totSeries = months.map((_, i) => round(instMoves.reduce((s, m) => s + ((m.series && m.series[i] != null) ? m.series[i] : 0), 0), 3));
    const totSlope = trendSlope(totSeries);
    score += Math.max(-8, Math.min(8, round(totSlope * 10, 0)));
    score = Math.max(-100, Math.min(100, score));

    // 5. 集中度/背离：前十门槛变化
    const threshold = (stock.top10Current && stock.top10Current[9] && stock.top10Current[9].holding != null)
      ? stock.top10Current[9].holding : null;

    // 6. 动作映射
    let verdict, verdictClass, verdictLabel;
    if (score >= 55) { verdict = 'strong-buy'; verdictLabel = '强烈买入'; verdictClass = 'strong-buy'; }
    else if (score >= 20) { verdict = 'buy'; verdictLabel = '买入 · 跟随建仓/加仓'; verdictClass = 'buy'; }
    else if (score > -20) { verdict = 'hold'; verdictLabel = '观望'; verdictClass = 'hold'; }
    else if (score > -55) { verdict = 'reduce'; verdictLabel = '减仓'; verdictClass = 'reduce'; }
    else { verdict = 'sell'; verdictLabel = '清仓 · 机构集体撤离'; verdictClass = 'sell'; }

    // 7. 生成自然语言结论
    const narrative = buildNarrative({
      score, verdict, verdictLabel, instMoves, lastTotal, netChangeMoM, netChangePeriod,
      adders, reducers, watchN, totSlope, threshold, months,
    });

    // 排序机构明细：按动作分(降序)再按环比变化
    instMoves.sort((a, b) => (ACTION_SCORE[b.action] - ACTION_SCORE[a.action]) || ((b.mom || 0) - (a.mom || 0)));

    return {
      score, verdict, verdictClass, verdictLabel,
      lastTotal: round(lastTotal, 2), netChangeMoM, netChangePeriod,
      adders, reducers, watchN, totSlope: round(totSlope, 3),
      threshold, months, instMoves, narrative,
    };
  }

  function buildNarrative(o) {
    const { verdictLabel, instMoves, adders, reducers, months } = o;
    const lastTotal = round(o.lastTotal, 2);
    const netChangeMoM = round(o.netChangeMoM, 2);
    const totSlope = round(o.totSlope, 3);
    const parts = [];
    const topAdd = instMoves.filter(m => m.action === 'add' || m.action === 'buy')
      .sort((a, b) => (b.mom || 0) - (a.mom || 0));
    const topReduce = instMoves.filter(m => m.action === 'reduce' || m.action === 'exit')
      .sort((a, b) => (a.mom || 0) - (b.mom || 0));
    const fmtMom = m => (m.mom != null ? (m.mom > 0 ? '+' : '') + round(m.mom, 2) : 0);

    parts.push('近 ' + months.length + ' 个月，著名机构合计持有约 <b>' + lastTotal + '%</b>。');
    if (netChangeMoM > 0.05) parts.push('最近一月<span class="pos">净增持 ' + netChangeMoM + ' 个百分点</span>，');
    else if (netChangeMoM < -0.05) parts.push('最近一月<span class="neg">净减持 ' + Math.abs(netChangeMoM) + ' 个百分点</span>，');
    else parts.push('最近一月持仓<span class="neu">基本持平</span>，');

    if (totSlope > 0.02) parts.push('期间整体呈<span class="pos">上行趋势</span>（斜率 +' + totSlope + '/期）。');
    else if (totSlope < -0.02) parts.push('期间整体呈<span class="neg">下行趋势</span>（斜率 ' + totSlope + '/期）。');
    else parts.push('期间整体趋势平稳。');

    if (adders > reducers && adders > 0) {
      const names = topAdd.slice(0, 3).map(m => '<b>' + m.name + '</b>(' + fmtMom(m) + 'pp)').join('、');
      parts.push('共 <span class="pos">' + adders + '</span> 家在加仓/建仓（' + names + '…），机构合力偏多 → <b>' + verdictLabel + '</b>。');
    } else if (reducers > adders && reducers > 0) {
      const names = topReduce.slice(0, 3).map(m => '<b>' + m.name + '</b>(' + fmtMom(m) + 'pp)').join('、');
      parts.push('共 <span class="neg">' + reducers + '</span> 家在减仓/清仓（' + names + '…），机构合力偏空 → <b>' + verdictLabel + '</b>。');
    } else {
      parts.push('多空分歧（加 ' + adders + ' : 减 ' + reducers + '），方向不明 → <b>' + verdictLabel + '</b>，建议等待信号。');
    }
    return parts.join(' ');
  }

  // -------- 多股扫描对比 --------
  function analyzeAll(dataset) {
    const codes = Object.keys(dataset.stocks || {});
    const rows = codes.map(code => {
      const s = dataset.stocks[code];
      const a = analyzeStock(s);
      return {
        code, name: s.name || code,
        score: a.score, verdict: a.verdict, verdictLabel: a.verdictLabel,
        netChangeMoM: a.netChangeMoM, netChangePeriod: a.netChangePeriod,
        adders: a.adders, reducers: a.reducers,
        lastTotal: a.lastTotal, analysis: a,
      };
    });
    return rows;
  }

  // 对扫描行排序
  function sortScanRows(rows, key, desc) {
    const order = desc ? -1 : 1;
    return rows.slice().sort((a, b) => {
      let va, vb;
      if (key === 'name') { va = a.name; vb = b.name; return va.localeCompare(vb, 'zh') * order; }
      va = a[key]; vb = b[key];
      if (va == null) va = -1e9; if (vb == null) vb = -1e9;
      return (va - vb) * order;
    });
  }

  global.CCASS_ANALYZE = {
    analyzeStock, analyzeAll, sortScanRows,
    classifyInstitution, changeMoM, changePeriod, trendSlope, lastNonNull,
    ACTION_LABEL,
  };
})(window);
