import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Upload, Plus, Trash2, AlertCircle, TrendingDown, TrendingUp, FileSpreadsheet, Edit3, X } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n < 0 ? `($${formatted})` : `$${formatted}`;
};

const fmtCompact = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${n < 0 ? '-' : ''}$${(abs / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
};

export default function CashFlowDashboard() {
  const [qbData, setQbData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseInfo, setParseInfo] = useState(null);
  const fileInputRef = useRef(null);

  const [startingCash, setStartingCash] = useState(656450);

  const [ownersDraw, setOwnersDraw] = useState({
    health: [5900, 2900, 2900, 2900, 2900, 3100, 3100, 3100, 3100, 3100, 3100, 3100],
    guaranteed: Array(12).fill(55000),
    other: Array(12).fill(2200),
  });

  const [taxPayments, setTaxPayments] = useState({
    q1: 165000, q1Month: 0,
    q2: 161000, q2Month: 3,
    q3: 118000, q3Month: 6,
    q4: 118000, q4Month: 9,
  });

  const [customItems, setCustomItems] = useState([]);
  const [actualEnding, setActualEnding] = useState(Array(12).fill(null));
  const [editingDraw, setEditingDraw] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const keys = ['qbData', 'fileName', 'parseInfo', 'startingCash',
                      'ownersDraw', 'taxPayments', 'customItems',
                      'actualEnding', 'lastSavedAt'];
        const results = await Promise.all(
          keys.map(k => window.storage.get(`cashflow:${k}`).catch(() => null))
        );
        if (cancelled) return;
        const [qb, fn, pi, sc, od, tp, ci, ae, ts] = results;
        if (qb?.value) setQbData(JSON.parse(qb.value));
        if (fn?.value) setFileName(fn.value);
        if (pi?.value) setParseInfo(JSON.parse(pi.value));
        if (sc?.value) setStartingCash(Number(sc.value) || 0);
        if (od?.value) setOwnersDraw(JSON.parse(od.value));
        if (tp?.value) setTaxPayments(JSON.parse(tp.value));
        if (ci?.value) setCustomItems(JSON.parse(ci.value));
        if (ae?.value) setActualEnding(JSON.parse(ae.value));
        if (ts?.value) setLastSavedAt(ts.value);
      } catch (err) {
        console.warn('Storage load failed:', err);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const saveAll = async () => {
      const now = new Date().toISOString();
      try {
        await Promise.all([
          qbData
            ? window.storage.set('cashflow:qbData', JSON.stringify(qbData))
            : window.storage.delete('cashflow:qbData').catch(() => null),
          fileName
            ? window.storage.set('cashflow:fileName', fileName)
            : window.storage.delete('cashflow:fileName').catch(() => null),
          parseInfo
            ? window.storage.set('cashflow:parseInfo', JSON.stringify(parseInfo))
            : window.storage.delete('cashflow:parseInfo').catch(() => null),
          window.storage.set('cashflow:startingCash', String(startingCash)),
          window.storage.set('cashflow:ownersDraw', JSON.stringify(ownersDraw)),
          window.storage.set('cashflow:taxPayments', JSON.stringify(taxPayments)),
          window.storage.set('cashflow:customItems', JSON.stringify(customItems)),
          window.storage.set('cashflow:actualEnding', JSON.stringify(actualEnding)),
          window.storage.set('cashflow:lastSavedAt', now),
        ]);
        setLastSavedAt(now);
      } catch (err) {
        console.warn('Storage save failed:', err);
      }
    };
    const t = setTimeout(saveAll, 400);
    return () => clearTimeout(t);
  }, [qbData, fileName, parseInfo, startingCash, ownersDraw, taxPayments, customItems, actualEnding, isLoaded]);

  const clearSavedData = async () => {
    try {
      const keys = ['qbData', 'fileName', 'parseInfo', 'startingCash',
                    'ownersDraw', 'taxPayments', 'customItems',
                    'actualEnding', 'lastSavedAt'];
      await Promise.all(keys.map(k => window.storage.delete(`cashflow:${k}`).catch(() => null)));
    } catch (err) {
      console.warn('Clear failed:', err);
    }
    setQbData(null);
    setFileName('');
    setParseInfo(null);
    setStartingCash(656450);
    setOwnersDraw({
      health: [5900, 2900, 2900, 2900, 2900, 3100, 3100, 3100, 3100, 3100, 3100, 3100],
      guaranteed: Array(12).fill(55000),
      other: Array(12).fill(2200),
    });
    setTaxPayments({
      q1: 165000, q1Month: 0,
      q2: 161000, q2Month: 3,
      q3: 118000, q3Month: 6,
      q4: 118000, q4Month: 9,
    });
    setCustomItems([]);
    setActualEnding(Array(12).fill(null));
    setLastSavedAt(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      let targetSheet = null;
      let maxSize = 0;
      for (const name of wb.SheetNames) {
        if (name.toLowerCase() === 'guidelines') continue;
        const sh = wb.Sheets[name];
        const ref = sh['!ref'] || 'A1';
        const range = XLSX.utils.decode_range(ref);
        const size = (range.e.r - range.s.r) * (range.e.c - range.s.c);
        if (size > maxSize) { maxSize = size; targetSheet = name; }
      }
      if (!targetSheet) targetSheet = wb.SheetNames[0];
      const sheet = wb.Sheets[targetSheet];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      const parsed = parseQBReport(rows);
      if (parsed.data) parsed.info.sheetUsed = targetSheet;
      setQbData(parsed.data);
      setParseInfo(parsed.info);
    } catch (err) {
      setParseInfo({ error: `Could not parse file: ${err.message}` });
    }
  };

  const parseQBReport = (rows) => {
    const inflows = { budget: Array(12).fill(0) };
    const outflows = { budget: Array(12).fill(0) };
    const lineItems = [];

    let headerRow = -1;
    const monthCols = {};

    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const row = rows[r] || [];
      const matches = {};
      row.forEach((cell, c) => {
        const s = String(cell || '').trim();
        MONTHS.forEach((m, idx) => {
          const pattern = new RegExp(`^${m}(\\s+\\d{4})?$|^${m}\\w*(\\s+\\d{4})?$`, 'i');
          if (pattern.test(s)) matches[idx] = c;
        });
      });
      if (Object.keys(matches).length >= 6) {
        headerRow = r;
        Object.assign(monthCols, matches);
        break;
      }
    }

    if (headerRow < 0 || Object.keys(monthCols).length < 12) {
      return {
        data: null,
        info: { error: `Could not find month columns. Found ${Object.keys(monthCols).length} of 12 months.` }
      };
    }

    let currentSection = null;
    const INCOME_SECTIONS = new Set(['income', 'other income']);
    const EXPENSE_SECTIONS = new Set(['expense', 'cost of goods sold', 'other expense']);

    const getRawLabel = (row) => {
      for (let c = 0; c < 2; c++) {
        const v = row[c];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v);
      }
      return '';
    };

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const rawLabel = getRawLabel(row);
      if (!rawLabel) continue;
      const label = rawLabel.trim();
      const labelLower = label.toLowerCase();
      if (/^total\s+/i.test(label) || /^net\s+/i.test(label)) { currentSection = null; continue; }
      const isUnindented = rawLabel.length > 0 && rawLabel[0] !== ' ';
      if (isUnindented) {
        if (INCOME_SECTIONS.has(labelLower)) { currentSection = 'income'; continue; }
        if (EXPENSE_SECTIONS.has(labelLower)) { currentSection = 'expense'; continue; }
        currentSection = null;
        continue;
      }
      if (!currentSection) continue;
      const monthly = Array(12).fill(0);
      let hasAnyValue = false;
      for (let m = 0; m < 12; m++) {
        const col = monthCols[m];
        const raw = row[col];
        const n = Number(raw);
        if (!isNaN(n) && raw !== null && raw !== '' && raw !== undefined) {
          monthly[m] = n;
          if (n !== 0) hasAnyValue = true;
        }
      }
      if (!hasAnyValue) continue;
      const target = currentSection === 'income' ? inflows : outflows;
      for (let m = 0; m < 12; m++) target.budget[m] += monthly[m];
      lineItems.push({ label, section: currentSection, budget: monthly });
    }

    const totalBudget = inflows.budget.reduce((s, v) => s + v, 0) + outflows.budget.reduce((s, v) => s + v, 0);
    if (totalBudget === 0) {
      return { data: null, info: { error: "Found month columns but no line items with values." } };
    }

    return {
      data: { inflows, outflows, lineItems },
      info: {
        rowsFound: lineItems.length,
        incomeItems: lineItems.filter(i => i.section === 'income').length,
        expenseItems: lineItems.filter(i => i.section === 'expense').length,
        totalIncome: inflows.budget.reduce((s, v) => s + v, 0),
        totalExpense: outflows.budget.reduce((s, v) => s + v, 0),
      }
    };
  };

  const calculations = useMemo(() => {
    const monthlyData = [];
    let runningBudget = startingCash;
    let runningActual = startingCash;

    for (let m = 0; m < 12; m++) {
      const qbIn = qbData?.inflows.budget[m] || 0;
      const qbOut = qbData?.outflows.budget[m] || 0;
      const drawTotal = ownersDraw.health[m] + ownersDraw.guaranteed[m] + ownersDraw.other[m];
      let taxThisMonth = 0;
      if (taxPayments.q1Month === m) taxThisMonth += taxPayments.q1;
      if (taxPayments.q2Month === m) taxThisMonth += taxPayments.q2;
      if (taxPayments.q3Month === m) taxThisMonth += taxPayments.q3;
      if (taxPayments.q4Month === m) taxThisMonth += taxPayments.q4;
      let customIn = 0, customOut = 0;
      customItems.forEach(item => {
        const v = Number(item.values[m]) || 0;
        if (item.type === 'inflow') customIn += v;
        else customOut += v;
      });
      const totalIn = qbIn + customIn;
      const totalOut = qbOut + drawTotal + taxThisMonth + customOut;
      const startBudget = runningBudget;
      const startActual = runningActual;
      const endBudget = startBudget + totalIn - totalOut;
      const endActualProjected = startActual + totalIn - totalOut;
      const endActual = actualEnding[m] !== null ? actualEnding[m] : null;
      const variance = endActual !== null ? endActual - endBudget : null;

      monthlyData.push({
        month: MONTHS[m], monthIdx: m, startBudget, startActual,
        qbIn, qbOut, inflowsBudget: totalIn, outflowsBudget: totalOut,
        draw: drawTotal, tax: taxThisMonth, customIn, customOut,
        endBudget, endActual, endActualProjected, variance,
        hasActual: endActual !== null,
      });

      runningBudget = endBudget;
      runningActual = endActual !== null ? endActual : endActualProjected;
    }

    const ytdInflowsBudget = monthlyData.reduce((s, m) => s + m.inflowsBudget, 0);
    const ytdOutflowsBudget = monthlyData.reduce((s, m) => s + m.outflowsBudget, 0);
    const netBudget = ytdInflowsBudget - ytdOutflowsBudget;
    const lowestMonth = monthlyData.reduce((min, m) => m.endBudget < min.endBudget ? m : min, monthlyData[0]);

    return { monthlyData, ytdInflowsBudget, ytdOutflowsBudget, netBudget, lowestMonth };
  }, [qbData, startingCash, ownersDraw, taxPayments, customItems, actualEnding]);

  const updateDraw = (category, monthIdx, value) => {
    setOwnersDraw(prev => ({
      ...prev,
      [category]: prev[category].map((v, i) => i === monthIdx ? (Number(value) || 0) : v),
    }));
  };

  const addCustomItem = () => {
    setCustomItems(prev => [...prev, {
      id: Date.now(), label: 'New Item', type: 'outflow', values: Array(12).fill(0),
    }]);
  };

  const updateCustomItem = (id, field, value) => {
    setCustomItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const updateCustomValue = (id, monthIdx, value) => {
    setCustomItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, values: item.values.map((v, i) => i === monthIdx ? (Number(value) || 0) : v) }
        : item
    ));
  };

  const removeCustomItem = (id) => setCustomItems(prev => prev.filter(item => item.id !== id));

  const updateActualEnding = (monthIdx, value) => {
    const v = value === '' ? null : Number(value);
    setActualEnding(prev => prev.map((x, i) => i === monthIdx ? v : x));
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#F5F1EA',
      fontFamily: "'Source Sans 3', -apple-system, sans-serif",
      color: '#1A1A1A', padding: '40px 32px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Fraunces', 'Playfair Display', Georgia, serif; font-optical-sizing: auto; letter-spacing: -0.02em; }
        .mono { font-family: 'JetBrains Mono', 'Courier New', monospace; font-variant-numeric: tabular-nums; }
        .card { background: #FDFBF6; border: 1px solid #E8E0D0; border-radius: 2px; padding: 28px; box-shadow: 0 1px 0 rgba(0,0,0,0.02); }
        .hairline { border-bottom: 1px solid #E8E0D0; }
        input.edit { background: transparent; border: none; border-bottom: 1px dotted #B8AE98; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #1A1A1A; padding: 2px 4px; width: 100%; text-align: right; transition: all 0.15s; }
        input.edit:focus { outline: none; border-bottom-color: #8B2A1C; border-bottom-style: solid; background: #FFF9E6; }
        input.edit:hover { background: rgba(139,42,28,0.04); }
        .variance-pos { color: #2D5A3D; }
        .variance-neg { color: #8B2A1C; }
        button.primary { background: #1A1A1A; color: #FDFBF6; border: none; padding: 10px 20px; font-family: 'Source Sans 3', sans-serif; font-size: 13px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        button.primary:hover { background: #8B2A1C; }
        button.ghost { background: transparent; color: #1A1A1A; border: 1px solid #1A1A1A; padding: 8px 16px; font-family: 'Source Sans 3', sans-serif; font-size: 12px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        button.ghost:hover { background: #1A1A1A; color: #FDFBF6; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: right; font-weight: 500; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B6252; padding: 12px 8px; border-bottom: 2px solid #1A1A1A; }
        th:first-child { text-align: left; }
        td { padding: 10px 8px; font-size: 13px; border-bottom: 1px solid #F0E9D8; text-align: right; }
        td:first-child { text-align: left; font-weight: 500; }
        tr:hover { background: rgba(139,42,28,0.02); }
        .kpi-num { font-size: 32px; font-family: 'Fraunces', serif; font-weight: 400; line-height: 1; letter-spacing: -0.03em; }
        .kpi-label { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #6B6252; margin-bottom: 12px; }
        .trough-warn { background: #FFF4E6; border-left: 3px solid #C97B1F; padding: 16px 20px; }
        details > summary { cursor: pointer; list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        <header style={{ marginBottom: '48px', paddingBottom: '24px', borderBottom: '2px solid #1A1A1A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6B6252', marginBottom: '8px' }}>
                Fiscal Year 2026 · Cash Position Report
              </div>
              <h1 className="serif" style={{ fontSize: '52px', fontWeight: 400, margin: 0, lineHeight: 1 }}>
                Cash Flow <em style={{ fontStyle: 'italic', fontWeight: 300 }}>Dashboard</em>
              </h1>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#6B6252', letterSpacing: '0.05em' }}>
              <div>BUDGET vs ACTUAL</div>
              <div>MONTHLY RECONCILIATION</div>
            </div>
          </div>
        </header>

        <section style={{ marginBottom: '32px' }}>
          <div className="card" style={{ padding: qbData ? '20px 28px' : '40px 28px' }}>
            {!qbData ? (
              <div style={{ textAlign: 'center' }}>
                <FileSpreadsheet size={40} strokeWidth={1} style={{ color: '#8B2A1C', marginBottom: '16px' }} />
                <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: '0 0 8px' }}>Upload QuickBooks Budget vs Actual</h2>
                <p style={{ fontSize: '13px', color: '#6B6252', margin: '0 0 24px', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Export your Budget vs Actual report from QuickBooks as .xlsx. The dashboard will parse income and expense line items automatically.
                </p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
                <button className="primary" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={14} style={{ display: 'inline', marginRight: '8px', verticalAlign: '-2px' }} />
                  Choose File
                </button>
                {parseInfo?.error && (
                  <div style={{ marginTop: '20px', color: '#8B2A1C', fontSize: '13px' }}>
                    <AlertCircle size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />
                    {parseInfo.error}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6252', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>File Loaded · Sheet: {parseInfo?.sheetUsed || '—'}</span>
                      {lastSavedAt && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: '#E8F0E8', color: '#2D5A3D', borderRadius: '2px', fontSize: '10px', letterSpacing: '0.1em' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#2D5A3D' }} />
                          SAVED
                        </span>
                      )}
                    </div>
                    <div className="serif" style={{ fontSize: '20px' }}>{fileName}</div>
                    <div style={{ fontSize: '12px', color: '#6B6252', marginTop: '6px' }}>
                      Parsed <strong>{parseInfo?.incomeItems || 0}</strong> income items ({fmtCompact(parseInfo?.totalIncome || 0)}) and <strong>{parseInfo?.expenseItems || 0}</strong> expense items ({fmtCompact(parseInfo?.totalExpense || 0)})
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
                    <button className="ghost" onClick={() => fileInputRef.current?.click()}>Replace File</button>
                    <button className="ghost" onClick={() => { setQbData(null); setFileName(''); setParseInfo(null); }}>
                      <X size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />Clear
                    </button>
                  </div>
                </div>
                {qbData && (
                  <details style={{ marginTop: '20px', borderTop: '1px solid #E8E0D0', paddingTop: '16px' }}>
                    <summary style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6252', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', width: '14px', height: '1px', background: '#6B6252' }} />
                      View Parsed Line Items
                    </summary>
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#2D5A3D' }}>Income ({qbData.lineItems.filter(i => i.section === 'income').length})</div>
                        <div style={{ fontSize: '11px', maxHeight: '200px', overflowY: 'auto', borderLeft: '1px solid #E8E0D0', paddingLeft: '12px' }} className="mono">
                          {qbData.lineItems.filter(i => i.section === 'income').map((it, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                              <span style={{ fontFamily: 'Source Sans 3, sans-serif' }}>{it.label}</span>
                              <span>{fmtCompact(it.budget.reduce((s, v) => s + v, 0))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#8B2A1C' }}>Expenses ({qbData.lineItems.filter(i => i.section === 'expense').length})</div>
                        <div style={{ fontSize: '11px', maxHeight: '200px', overflowY: 'auto', borderLeft: '1px solid #E8E0D0', paddingLeft: '12px' }} className="mono">
                          {qbData.lineItems.filter(i => i.section === 'expense').map((it, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                              <span style={{ fontFamily: 'Source Sans 3, sans-serif' }}>{it.label}</span>
                              <span>{fmtCompact(it.budget.reduce((s, v) => s + v, 0))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '16px', padding: '12px 16px', background: '#FFF4E6', borderLeft: '3px solid #C97B1F', fontSize: '12px', color: '#6B4F1F', lineHeight: 1.5 }}>
                      <strong>Check for double-counting:</strong> The dashboard adds Owner's Draw and Tax Payments on top of QB expenses. Review and adjust inputs below if needed.
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
          <div className="card">
            <div className="kpi-label">Starting Cash</div>
            <input type="number" value={startingCash} onChange={(e) => setStartingCash(Number(e.target.value) || 0)} className="edit" style={{ fontSize: '28px', fontFamily: 'Fraunces, serif', textAlign: 'left', fontWeight: 400 }} />
          </div>
          <div className="card">
            <div className="kpi-label">YTD Budgeted Inflows</div>
            <div className="kpi-num">{fmtCompact(calculations.ytdInflowsBudget)}</div>
          </div>
          <div className="card">
            <div className="kpi-label">YTD Budgeted Outflows</div>
            <div className="kpi-num">{fmtCompact(calculations.ytdOutflowsBudget)}</div>
          </div>
          <div className="card">
            <div className="kpi-label">Net Change (Budget)</div>
            <div className="kpi-num" style={{ color: calculations.netBudget < 0 ? '#8B2A1C' : '#2D5A3D' }}>
              {calculations.netBudget < 0
                ? <TrendingDown size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-1px' }} />
                : <TrendingUp size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-1px' }} />}
              {fmtCompact(calculations.netBudget)}
            </div>
          </div>
        </section>

        {calculations.lowestMonth && calculations.lowestMonth.endBudget < 200000 && (
          <div className="trough-warn" style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertCircle size={20} style={{ color: '#C97B1F', flexShrink: 0 }} />
              <div>
                <strong className="serif" style={{ fontSize: '15px' }}>Cash Trough Alert</strong>
                <div style={{ fontSize: '13px', color: '#6B4F1F', marginTop: '2px' }}>
                  Budgeted ending balance bottoms out in {calculations.lowestMonth.month} at {fmt(calculations.lowestMonth.endBudget)}. Monitor closely.
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="card" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
            <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: 0 }}>
              Ending Cash Balance <em style={{ fontStyle: 'italic', fontWeight: 300, color: '#6B6252' }}>— by month</em>
            </h2>
            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              <span><span style={{ display: 'inline-block', width: '12px', height: '2px', background: '#1A1A1A', verticalAlign: 'middle', marginRight: '6px' }} />Budgeted</span>
              <span><span style={{ display: 'inline-block', width: '12px', height: '2px', background: '#8B2A1C', verticalAlign: 'middle', marginRight: '6px' }} />Actual</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={calculations.monthlyData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E8E0D0" />
              <XAxis dataKey="month" stroke="#6B6252" fontSize={11} tickLine={false} axisLine={{ stroke: '#B8AE98' }} />
              <YAxis stroke="#6B6252" fontSize={11} tickLine={false} axisLine={{ stroke: '#B8AE98' }} tickFormatter={(v) => fmtCompact(v)} />
              <Tooltip contentStyle={{ background: '#FDFBF6', border: '1px solid #1A1A1A', borderRadius: '2px', fontSize: '12px' }} formatter={(v) => fmt(v)} />
              <ReferenceLine y={0} stroke="#8B2A1C" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="endBudget" stroke="#1A1A1A" strokeWidth={2} dot={{ fill: '#1A1A1A', r: 4 }} name="Budgeted" />
              <Line type="monotone" dataKey="endActual" stroke="#8B2A1C" strokeWidth={2} dot={{ fill: '#8B2A1C', r: 4 }} name="Actual" connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="card" style={{ marginBottom: '32px' }}>
          <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: '0 0 20px' }}>Monthly Cash Flow</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="mono">
              <thead>
                <tr>
                  <th style={{ fontFamily: 'Source Sans 3, sans-serif' }}>Month</th>
                  <th>Start</th><th>Inflows</th><th>Outflows</th><th>Owner Draw</th><th>Tax</th><th>Cash End</th>
                </tr>
              </thead>
              <tbody>
                {calculations.monthlyData.map((row) => (
                  <tr key={row.month}>
                    <td style={{ fontFamily: 'Fraunces, serif', fontSize: '15px', fontWeight: 500 }}>{row.month}</td>
                    <td>{fmt(row.startBudget)}</td>
                    <td>{fmt(row.inflowsBudget)}</td>
                    <td>({fmt(row.outflowsBudget - row.draw - row.tax).replace('$','').replace('(','').replace(')','')})</td>
                    <td>({fmt(row.draw).replace('$','').replace('(','').replace(')','')})</td>
                    <td>{row.tax > 0 ? `(${fmt(row.tax).replace('$','').replace('(','').replace(')','')})` : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(row.endBudget)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
            <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: 0 }}>
              Owner's Draw <em style={{ fontStyle: 'italic', fontWeight: 300, color: '#6B6252' }}>— Dan</em>
            </h2>
            <button className="ghost" onClick={() => setEditingDraw(!editingDraw)}>
              <Edit3 size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
              {editingDraw ? 'Done' : 'Edit'}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="mono">
              <thead>
                <tr>
                  <th style={{ fontFamily: 'Source Sans 3, sans-serif' }}>Category</th>
                  {MONTHS.map(m => <th key={m}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {[{ key: 'health', label: 'Health' }, { key: 'guaranteed', label: 'Guaranteed Pmt' }, { key: 'other', label: 'Other Draw' }].map(({ key, label }) => (
                  <tr key={key}>
                    <td style={{ fontFamily: 'Fraunces, serif', fontSize: '14px' }}>{label}</td>
                    {MONTHS.map((_, m) => (
                      <td key={m} style={{ padding: '6px 4px' }}>
                        {editingDraw ? (
                          <input type="number" value={ownersDraw[key][m]} onChange={(e) => updateDraw(key, m, e.target.value)} className="edit" />
                        ) : (
                          <span style={{ fontSize: '12px' }}>{fmtCompact(ownersDraw[key][m])}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ background: '#F5F1EA', fontWeight: 600 }}>
                  <td style={{ fontFamily: 'Fraunces, serif', fontSize: '14px' }}>Total</td>
                  {MONTHS.map((_, m) => (
                    <td key={m} style={{ padding: '8px 4px', fontSize: '12px' }}>
                      {fmtCompact(ownersDraw.health[m] + ownersDraw.guaranteed[m] + ownersDraw.other[m])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ marginBottom: '32px' }}>
          <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: '0 0 20px' }}>Quarterly Tax Payments</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            {[{ key: 'q1', label: 'Q1' }, { key: 'q2', label: 'Q2' }, { key: 'q3', label: 'Q3' }, { key: 'q4', label: 'Q4' }].map(({ key, label }) => (
              <div key={key} style={{ borderLeft: '2px solid #1A1A1A', paddingLeft: '16px' }}>
                <div className="kpi-label">{label} Payment</div>
                <input type="number" value={taxPayments[key]} onChange={(e) => setTaxPayments(p => ({ ...p, [key]: Number(e.target.value) || 0 }))} className="edit" style={{ fontSize: '22px', fontFamily: 'Fraunces, serif', textAlign: 'left', fontWeight: 400, marginBottom: '8px' }} />
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B6252', marginBottom: '4px' }}>Paid In</div>
                <select value={taxPayments[`${key}Month`]} onChange={(e) => setTaxPayments(p => ({ ...p, [`${key}Month`]: Number(e.target.value) }))} style={{ background: 'transparent', border: '1px solid #B8AE98', padding: '6px 10px', fontSize: '12px', fontFamily: 'Source Sans 3, sans-serif', width: '100%' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
            <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: 0 }}>Custom Line Items</h2>
            <button className="ghost" onClick={addCustomItem}>
              <Plus size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />Add Item
            </button>
          </div>
          {customItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#6B6252', fontSize: '13px', fontStyle: 'italic' }}>
              No custom items yet. Add one-off inflows or outflows not captured in your QuickBooks budget.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="mono">
                <thead>
                  <tr>
                    <th style={{ fontFamily: 'Source Sans 3, sans-serif', width: '180px' }}>Label</th>
                    <th style={{ fontFamily: 'Source Sans 3, sans-serif', width: '90px' }}>Type</th>
                    {MONTHS.map(m => <th key={m}>{m}</th>)}
                    <th style={{ width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {customItems.map(item => (
                    <tr key={item.id}>
                      <td>
                        <input type="text" value={item.label} onChange={(e) => updateCustomItem(item.id, 'label', e.target.value)} className="edit" style={{ textAlign: 'left', fontFamily: 'Fraunces, serif', fontSize: '14px' }} />
                      </td>
                      <td>
                        <select value={item.type} onChange={(e) => updateCustomItem(item.id, 'type', e.target.value)} style={{ background: item.type === 'inflow' ? '#E8F0E8' : '#F8E8E4', border: 'none', padding: '4px 8px', fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase', width: '100%' }}>
                          <option value="inflow">Inflow</option>
                          <option value="outflow">Outflow</option>
                        </select>
                      </td>
                      {MONTHS.map((_, m) => (
                        <td key={m} style={{ padding: '6px 4px' }}>
                          <input type="number" value={item.values[m] || ''} onChange={(e) => updateCustomValue(item.id, m, e.target.value)} className="edit" placeholder="0" />
                        </td>
                      ))}
                      <td>
                        <button onClick={() => removeCustomItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8B2A1C', padding: '4px' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer style={{ paddingTop: '24px', borderTop: '1px solid #E8E0D0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6252' }}>
          <div style={{ flex: 1 }}></div>
          <div>Cash Flow Dashboard · FY 2026 · Confidential</div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <button onClick={() => { if (confirm('Reset all saved data? This cannot be undone.')) clearSavedData(); }} style={{ background: 'none', border: 'none', color: '#6B6252', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Source Sans 3, sans-serif' }}>
              Reset Saved Data
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
