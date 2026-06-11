import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Upload, Plus, Trash2, AlertCircle, TrendingDown, TrendingUp, FileSpreadsheet, Edit3, X } from 'lucide-react';

// ─── Ramp API proxy URL ───────────────────────────────────────────────────────
// After you deploy to Vercel, replace this with your actual Vercel project URL.
// Example: 'https://cash-flow-dashboard-api.vercel.app'
const RAMP_API_BASE = 'https://cashflow-dash-api.vercel.app';
// ─────────────────────────────────────────────────────────────────────────────

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

const DEFAULT_DRAW = {
  health: [5900, 2900, 2900, 2900, 2900, 3100, 3100, 3100, 3100, 3100, 3100, 3100],
  guaranteed: Array(12).fill(55000),
  other: Array(12).fill(2200),
};
const DEFAULT_TAX = { q1: 165000, q1Month: 0, q2: 161000, q2Month: 3, q3: 118000, q3Month: 6, q4: 118000, q4Month: 9 };
const DEFAULT_STARTING_CASH = 656450;

export default function CashFlowDashboard() {
  const [activeYear, setActiveYear] = useState(() => Number(localStorage.getItem('cashflow:activeYear')) || 2026);

  const [qbData, setQbData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseInfo, setParseInfo] = useState(null);
  const fileInputRef = useRef(null);

  const [startingCash, setStartingCash] = useState(DEFAULT_STARTING_CASH);
  const [ownersDraw, setOwnersDraw] = useState(DEFAULT_DRAW);
  const [taxPayments, setTaxPayments] = useState(DEFAULT_TAX);

  const [customItems, setCustomItems] = useState([]);
  const [actualEnding, setActualEnding] = useState(Array(12).fill(null));
  const [actualBeginning, setActualBeginning] = useState(Array(12).fill(null));
  const [editingDraw, setEditingDraw] = useState(false);
  const [payrollByMonth, setPayrollByMonth] = useState(Array(12).fill(0));

  const [isLoaded, setIsLoaded] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // Scenarios
  const [scenarios, setScenarios] = useState([]);
  const [savingScenario, setSavingScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);

  // Ramp bills — manually entered
  const [rampBills, setRampBills] = useState([]);
  const [accruedByMonth, setAccruedByMonth] = useState(Array(12).fill(0));

  // Manual bill entry form state
  const [newBillVendor, setNewBillVendor] = useState('');
  const [newBillAmount, setNewBillAmount] = useState('');
  const [newBillPayDate, setNewBillPayDate] = useState('');
  const [newBillDate, setNewBillDate] = useState('');
  const [billFormError, setBillFormError] = useState('');
  const [reconMonth, setReconMonth] = useState(() => Math.max(0, new Date().getMonth() - 1));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${RAMP_API_BASE}/api/state?year=${activeYear}`);
        if (r.ok) {
          const { state } = await r.json();
          if (!cancelled && state) {
            if (state.qbData)        setQbData(state.qbData);
            if (state.fileName)      setFileName(state.fileName);
            if (state.parseInfo)     setParseInfo(state.parseInfo);
            if (state.startingCash != null) setStartingCash(Number(state.startingCash) || 0);
            if (state.ownersDraw)    setOwnersDraw(state.ownersDraw);
            if (state.taxPayments)   setTaxPayments(state.taxPayments);
            if (state.customItems)   setCustomItems(state.customItems);
            if (state.payrollByMonth) setPayrollByMonth(state.payrollByMonth);
            if (state.actualEnding)  setActualEnding(state.actualEnding);
            if (state.accruedByMonth) setAccruedByMonth(state.accruedByMonth);
            if (state.rampBills)     setRampBills(state.rampBills);
            if (state.scenarios)     setScenarios(state.scenarios);
            if (state.actualBeginning) setActualBeginning(state.actualBeginning);
            if (state.lastSavedAt)   setLastSavedAt(state.lastSavedAt);
          }
        }
      } catch (err) {
        console.warn('Cloud load failed:', err);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [activeYear]);

  useEffect(() => {
    if (!isLoaded) return;
    const saveAll = async () => {
      try {
        const state = {
          qbData, fileName, parseInfo, startingCash,
          ownersDraw, taxPayments, customItems, payrollByMonth,
          actualEnding, actualBeginning, accruedByMonth, rampBills, scenarios,
        };
        const r = await fetch(`${RAMP_API_BASE}/api/state?year=${activeYear}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });
        if (r.ok) {
          const { savedAt } = await r.json();
          if (savedAt) setLastSavedAt(savedAt);
        }
      } catch (err) {
        console.warn('Cloud save failed:', err);
      }
    };
    const t = setTimeout(saveAll, 1000);
    return () => clearTimeout(t);
  }, [qbData, fileName, parseInfo, startingCash, ownersDraw, taxPayments, customItems, payrollByMonth, actualEnding, actualBeginning, accruedByMonth, rampBills, scenarios, activeYear, isLoaded]);

  const resetStateToDefaults = () => {
    setQbData(null);
    setFileName('');
    setParseInfo(null);
    setStartingCash(DEFAULT_STARTING_CASH);
    setOwnersDraw(DEFAULT_DRAW);
    setTaxPayments(DEFAULT_TAX);
    setCustomItems([]);
    setActualEnding(Array(12).fill(null));
    setActualBeginning(Array(12).fill(null));
    setAccruedByMonth(Array(12).fill(0));
    setPayrollByMonth(Array(12).fill(0));
    setRampBills([]);
    setScenarios([]);
    setLastSavedAt(null);
    setSavingScenario(false);
    setSelectedScenarioId(null);
  };

  const clearSavedData = async () => {
    try {
      await fetch(`${RAMP_API_BASE}/api/state?year=${activeYear}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Cloud clear failed:', err);
    }
    resetStateToDefaults();
  };

  const switchYear = (year) => {
    if (year === activeYear) return;
    localStorage.setItem('cashflow:activeYear', year);
    setIsLoaded(false);      // pause saves during transition
    resetStateToDefaults();  // clear current state
    setActiveYear(year);     // triggers the load effect with new year's prefix
  };

  const copyCustomItemsFromYear = async (fromYear) => {
    try {
      const r = await fetch(`${RAMP_API_BASE}/api/state?year=${fromYear}`);
      if (!r.ok) return;
      const { state } = await r.json();
      if (state?.customItems && state.customItems.length > 0) {
        const copied = state.customItems.map(item => ({ ...item, id: Date.now() + Math.random() }));
        setCustomItems(copied);
      }
    } catch (e) {
      // silently ignore
    }
  };

  const addRampBill = () => {
    const vendor = newBillVendor.trim();
    const amount = parseFloat(newBillAmount.replace(/[,$]/g, ''));
    const payDate = newBillPayDate;

    if (!vendor) { setBillFormError('Vendor name is required.'); return; }
    if (!amount || isNaN(amount) || amount <= 0) { setBillFormError('Enter a valid amount.'); return; }
    if (!payDate) { setBillFormError('Payment date is required.'); return; }

    const newBill = {
      id: Date.now(),
      vendor,
      amount,
      due_date: payDate,           // payment date — when money leaves the bank
      bill_date: newBillDate || null, // invoice/bill date (optional)
      invoice_due_at: null,
      status: 'MANUAL',
    };

    setRampBills(prev => [...prev, newBill]);
    setNewBillVendor('');
    setNewBillAmount('');
    setNewBillPayDate('');
    setNewBillDate('');
    setBillFormError('');
  };

  const deleteRampBill = (id) => {
    setRampBills(prev => prev.filter(b => b.id !== id));
  };

  // Compute full monthly breakdown from a scenario's saved inputs
  const computeScenarioMonthly = (s) => {
    const rows = [];
    let running = s.startingCash;
    for (let m = 0; m < 12; m++) {
      const qbIn = s.qbData?.inflows.budget[m] || 0;
      const qbOut = s.qbData?.outflows.budget[m] || 0;
      const draw = s.ownersDraw.health[m] + s.ownersDraw.guaranteed[m] + s.ownersDraw.other[m];
      let tax = 0;
      if (s.taxPayments.q1Month === m) tax += s.taxPayments.q1;
      if (s.taxPayments.q2Month === m) tax += s.taxPayments.q2;
      if (s.taxPayments.q3Month === m) tax += s.taxPayments.q3;
      if (s.taxPayments.q4Month === m) tax += s.taxPayments.q4;
      let cIn = 0, cOut = 0;
      (s.customItems || []).forEach(item => {
        const v = Number(item.values[m]) || 0;
        if (item.type === 'inflow') cIn += v; else cOut += v;
      });
      const totalIn = qbIn + cIn;
      const totalOut = qbOut + draw + tax + cOut;
      const start = running;
      running = start + totalIn - totalOut;
      rows.push({ month: MONTHS[m], start, totalIn, totalOut, draw, tax, endBudget: running });
    }
    return rows;
  };

  // Kept for comparison table (just endings)
  const computeScenarioEndings = (s) => computeScenarioMonthly(s).map(r => r.endBudget);

  const saveCurrentScenario = () => {
    const name = newScenarioName.trim() || `Scenario ${scenarios.length + 1}`;
    const snapshot = {
      id: Date.now(),
      name,
      savedAt: new Date().toISOString(),
      startingCash, ownersDraw, taxPayments, customItems,
      actualEnding, accruedByMonth, qbData,
      monthlyEndings: calculations.monthlyData.map(m => m.bankBalance),
    };
    setScenarios(prev => [...prev, snapshot]);
    setNewScenarioName('');
    setSavingScenario(false);
  };

  const loadScenario = (s) => {
    if (!confirm(`Load "${s.name}"? This will replace your current inputs.`)) return;
    setStartingCash(s.startingCash);
    setOwnersDraw(s.ownersDraw);
    setTaxPayments(s.taxPayments);
    setCustomItems(s.customItems || []);
    setActualEnding(s.actualEnding || Array(12).fill(null));
    setAccruedByMonth(s.accruedByMonth || Array(12).fill(0));
    if (s.qbData) setQbData(s.qbData);
  };

  const deleteScenario = (id) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
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
    // Track when we're inside a Payroll Expenses sub-section
    let inPayrollSection = false;
    let payrollIndent = -1;
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
      const indent = rawLabel.length - rawLabel.trimStart().length;
      const isUnindented = indent === 0;

      // Top-level "Total …" / "Net …" rows reset the section
      if (isUnindented && (/^total\s+/i.test(label) || /^net\s+/i.test(label))) {
        currentSection = null;
        inPayrollSection = false;
        payrollIndent = -1;
        continue;
      }

      // Indented sub-total rows (e.g. "Total Payroll Expenses") — skip but DON'T reset section
      if (!isUnindented && (/^total\s+/i.test(label) || /^net\s+/i.test(label))) {
        // Exit payroll sub-section if we're at or above payroll indent
        if (inPayrollSection && indent <= payrollIndent) {
          inPayrollSection = false;
          payrollIndent = -1;
        }
        continue;
      }

      if (isUnindented) {
        inPayrollSection = false;
        payrollIndent = -1;
        if (INCOME_SECTIONS.has(labelLower)) { currentSection = 'income'; continue; }
        if (EXPENSE_SECTIONS.has(labelLower)) { currentSection = 'expense'; continue; }
        currentSection = null;
        continue;
      }

      if (!currentSection) continue;

      // If we were in a payroll sub-section but indent has come back up, exit it
      if (inPayrollSection && indent <= payrollIndent) {
        inPayrollSection = false;
        payrollIndent = -1;
      }

      // Detect entering a Payroll Expenses sub-section (even if the header row has no values)
      if (currentSection === 'expense' && /payroll/i.test(label) && !inPayrollSection) {
        inPayrollSection = true;
        payrollIndent = indent;
      }

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

      const isPayroll = currentSection === 'expense' && inPayrollSection;
      if (currentSection === 'income') {
        for (let m = 0; m < 12; m++) inflows.budget[m] += monthly[m];
      } else if (!isPayroll) {
        for (let m = 0; m < 12; m++) outflows.budget[m] += monthly[m];
      }
      lineItems.push({ label, section: currentSection, budget: monthly, isPayroll });
    }

    const totalBudget = inflows.budget.reduce((s, v) => s + v, 0) + outflows.budget.reduce((s, v) => s + v, 0);
    if (totalBudget === 0) {
      return { data: null, info: { error: "Found month columns but no line items with values." } };
    }

    const payrollItems = lineItems.filter(i => i.isPayroll);
    return {
      data: { inflows, outflows, lineItems },
      info: {
        rowsFound: lineItems.length,
        incomeItems: lineItems.filter(i => i.section === 'income').length,
        expenseItems: lineItems.filter(i => i.section === 'expense' && !i.isPayroll).length,
        payrollItems: payrollItems.length,
        totalIncome: inflows.budget.reduce((s, v) => s + v, 0),
        totalExpense: outflows.budget.reduce((s, v) => s + v, 0),
        totalPayrollExcluded: payrollItems.reduce((s, i) => s + i.budget.reduce((a, b) => a + b, 0), 0),
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
      const payroll = Number(payrollByMonth[m]) || 0;
      const totalIn = qbIn + customIn;
      const totalOut = qbOut + drawTotal + taxThisMonth + customOut + payroll;
      const startBudget = runningBudget;
      const startActual = runningActual;

      const priorAccrued = m > 0 ? (accruedByMonth[m - 1] || 0) : 0;

      const endBudget = startBudget + totalIn - totalOut;
      // endActualProjected = clean QB-based projection (draw, tax, accrued settlements)
      // bankBalance = endActualProjected + still-pending Ramp bills + this month's accrual
      //   This is what the bank statement should show, matching the Bank Reconciliation.
      const endActualProjected = startActual + totalIn - totalOut - priorAccrued;

      // Ramp bills still pending (not yet cleared) at end of month m:
      // payment date is after month m AND (bill date is in/before month m, or no bill date)
      const rampPendingThisMonth = rampBills.filter(b => {
        if (!b.due_date) return false;
        const payDate = new Date(b.due_date + 'T12:00:00');
        const payAfter =
          payDate.getFullYear() > activeYear ||
          (payDate.getFullYear() === activeYear && payDate.getMonth() > m);
        if (!payAfter) return false;
        if (b.bill_date) {
          const bd = new Date(b.bill_date + 'T12:00:00');
          return bd.getFullYear() < activeYear ||
            (bd.getFullYear() === activeYear && bd.getMonth() <= m);
        }
        return true; // no bill date — include
      });
      const rampPendingAmt = rampPendingThisMonth.reduce((s, b) => s + (b.amount || 0), 0);

      // Bills clearing the bank IN this month (for the "Clears Bank" column)
      const rampClearingThisMonth = rampBills.filter(b => {
        if (!b.due_date) return false;
        const d = new Date(b.due_date + 'T12:00:00');
        return d.getFullYear() === activeYear && d.getMonth() === m;
      });
      const rampClearingAmt = rampClearingThisMonth.reduce((s, b) => s + (b.amount || 0), 0);
      const clearingTotal = rampClearingAmt + priorAccrued;

      // bankBalance = true bank position: QB projection + pending Ramp + accrued not yet paid
      const accrued = Number(accruedByMonth[m]) || 0;
      const bankBalance = endActualProjected + rampPendingAmt + accrued;

      const endActual = actualEnding[m] !== null ? actualEnding[m] : null;
      const variance = endActual !== null ? endActual - bankBalance : null;

      monthlyData.push({
        month: MONTHS[m], monthIdx: m, startBudget, startActual,
        qbIn, qbOut, inflowsBudget: totalIn, outflowsBudget: totalOut,
        draw: drawTotal, tax: taxThisMonth, customIn, customOut,
        endBudget, endActual, endActualProjected, bankBalance, variance,
        hasActual: endActual !== null, payroll,
        clearingTotal, rampClearingThisMonth, rampPendingAmt, priorAccrued,
      });

      runningBudget = endBudget;
      runningActual = endActual !== null ? endActual : bankBalance;
    }

    const ytdInflowsBudget = monthlyData.reduce((s, m) => s + m.inflowsBudget, 0);
    const ytdOutflowsBudget = monthlyData.reduce((s, m) => s + m.outflowsBudget, 0);
    const netBudget = ytdInflowsBudget - ytdOutflowsBudget;
    const lowestMonth = monthlyData.reduce((min, m) => m.endBudget < min.endBudget ? m : min, monthlyData[0]);

    return { monthlyData, ytdInflowsBudget, ytdOutflowsBudget, netBudget, lowestMonth };
  }, [qbData, startingCash, ownersDraw, taxPayments, customItems, payrollByMonth, actualEnding, accruedByMonth, rampBills, activeYear]);

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
                Fiscal Year {activeYear} · Cash Position Report
              </div>
              <h1 className="serif" style={{ fontSize: '52px', fontWeight: 400, margin: 0, lineHeight: 1 }}>
                Cash Flow <em style={{ fontStyle: 'italic', fontWeight: 300 }}>Dashboard</em>
              </h1>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '16px' }}>
              {/* Year tabs */}
              <div style={{ display: 'flex' }}>
                {[2026, 2027].map((year, i) => (
                  <button key={year} onClick={() => switchYear(year)} style={{
                    background: activeYear === year ? '#1A1A1A' : 'transparent',
                    color: activeYear === year ? '#FDFBF6' : '#1A1A1A',
                    border: '1px solid #1A1A1A',
                    borderRight: i === 0 ? 'none' : undefined,
                    padding: '10px 24px',
                    fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em',
                    textTransform: 'uppercase', cursor: 'pointer',
                    fontFamily: 'Source Sans 3, sans-serif', transition: 'all 0.15s',
                  }}>
                    FY {year}
                  </button>
                ))}
              </div>
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#6B6252', letterSpacing: '0.05em' }}>
                <div>BUDGET vs ACTUAL</div>
                <div>MONTHLY RECONCILIATION</div>
              </div>
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
                      {parseInfo?.payrollItems > 0 && (
                        <span style={{ marginLeft: '8px', color: '#8B2A1C', background: '#FEF0EE', padding: '2px 7px', borderRadius: '2px', fontSize: '11px' }}>
                          + {parseInfo.payrollItems} payroll rows excluded ({fmtCompact(parseInfo.totalPayrollExcluded)})
                        </span>
                      )}
                      {parseInfo?.payrollItems === 0 && (
                        <span style={{ marginLeft: '8px', color: '#7B5B00', background: '#FFF4E6', padding: '2px 7px', borderRadius: '2px', fontSize: '11px' }}>
                          ⚠ No payroll rows detected — check label name in XLSX
                        </span>
                      )}
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

        {/* ── Bank Reconciliation (current year only) ── */}
        {activeYear > new Date().getFullYear() ? null : (() => {
          const reconRow = calculations.monthlyData[reconMonth];
          // Include a bill in this month's reconciliation only if:
          // 1) The invoice/bill date is in this month or earlier
          // 2) The payment date is AFTER this month (hasn't cleared the bank yet)
          const reconBills = rampBills.filter(b => {
            // Payment must be after reconMonth
            if (!b.due_date) return false;
            const payDate = new Date(b.due_date);
            const payAfterMonth =
              payDate.getFullYear() > activeYear ||
              (payDate.getFullYear() === activeYear && payDate.getMonth() > reconMonth);
            if (!payAfterMonth) return false;

            // Invoice/bill date must be this month or earlier
            if (b.bill_date) {
              const bd = new Date(b.bill_date);
              return bd.getFullYear() < activeYear ||
                (bd.getFullYear() === activeYear && bd.getMonth() <= reconMonth);
            }
            // No bill date entered — include it (payment is after month, invoice unknown)
            return true;
          });
          const rampTotal = reconBills.reduce((s, b) => s + b.amount, 0);
          const accrued = Number(accruedByMonth[reconMonth]) || 0;
          // adjustedBalance = reconRow.bankBalance (endActualProjected + rampPending + accrued)
          const adjustedBalance = reconRow ? reconRow.bankBalance : null;

          return (
            <section className="card" style={{ marginBottom: '32px', borderLeft: '3px solid #1A1A1A' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
                <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: 0 }}>
                  Bank Reconciliation
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6252' }}>Month</div>
                  <select
                    value={reconMonth}
                    onChange={e => setReconMonth(Number(e.target.value))}
                    style={{ background: 'transparent', border: '1px solid #B8AE98', padding: '6px 12px', fontSize: '13px', fontFamily: 'Source Sans 3, sans-serif' }}
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                {/* Left: reconciliation math */}
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E0D0' }}>
                      <span style={{ fontSize: '13px', color: '#6B6252', letterSpacing: '0.03em' }}>Cash Flow Ending Balance ({MONTHS[reconMonth]})</span>
                      <span className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>{reconRow ? fmt(reconRow.endActualProjected) : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #E8E0D0' }}>
                      <span style={{ fontSize: '13px', color: '#6B6252', letterSpacing: '0.03em' }}>
                        + Ramp Scheduled Payments
                        {reconBills.length > 0 && (
                          <span style={{ marginLeft: '8px', fontSize: '11px', color: '#2D5A3D', background: '#E8F0E8', padding: '2px 6px', borderRadius: '2px' }}>
                            {reconBills.length} bill{reconBills.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                      <span className="mono" style={{ fontSize: '14px', color: '#2D5A3D' }}>
                        {rampTotal > 0 ? `+${fmt(rampTotal)}` : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '2px solid #1A1A1A' }}>
                      <span style={{ fontSize: '13px', color: '#6B6252', letterSpacing: '0.03em' }}>+ Accrued Expenses ({MONTHS[reconMonth]})</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="mono" style={{ fontSize: '13px', color: '#6B6252' }}>$</span>
                        <input
                          type="number"
                          value={accruedByMonth[reconMonth] || ''}
                          onChange={e => setAccruedByMonth(prev => prev.map((v, i) => i === reconMonth ? (Number(e.target.value) || 0) : v))}
                          placeholder="0"
                          className="edit"
                          style={{ width: '120px', textAlign: 'right', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 0 0' }}>
                      <span style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>Projected Bank Balance</span>
                      <span className="serif" style={{
                        fontSize: '28px', fontWeight: 400, letterSpacing: '-0.02em',
                        color: adjustedBalance !== null ? (adjustedBalance < 0 ? '#8B2A1C' : '#1A1A1A') : '#B8AE98'
                      }}>
                        {adjustedBalance !== null ? fmt(adjustedBalance) : '—'}
                      </span>
                    </div>
                    {adjustedBalance !== null && adjustedBalance < 100000 && (
                      <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FFF4E6', borderLeft: '3px solid #C97B1F', fontSize: '12px', color: '#6B4F1F' }}>
                        <AlertCircle size={12} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-1px' }} />
                        Projected bank balance is low after pending payments clear.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: manual Ramp bill entry + list */}
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6252', marginBottom: '12px' }}>
                    Ramp Pending Payments
                  </div>

                  {/* Add bill form */}
                  <div style={{ background: '#F5F1EA', border: '1px solid #E8E0D0', padding: '14px', marginBottom: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <input
                        placeholder="Vendor"
                        value={newBillVendor}
                        onChange={e => setNewBillVendor(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #B8AE98', background: '#FDFBF6', fontFamily: 'Source Sans 3, sans-serif', gridColumn: '1 / -1' }}
                      />
                      <input
                        placeholder="Amount"
                        value={newBillAmount}
                        onChange={e => setNewBillAmount(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #B8AE98', background: '#FDFBF6', fontFamily: 'Source Sans 3, sans-serif' }}
                      />
                      <div>
                        <div style={{ fontSize: '10px', color: '#6B6252', marginBottom: '2px', letterSpacing: '0.05em' }}>Payment Date *</div>
                        <input
                          type="date"
                          value={newBillPayDate}
                          onChange={e => setNewBillPayDate(e.target.value)}
                          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #B8AE98', background: '#FDFBF6', fontFamily: 'Source Sans 3, sans-serif', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '10px', color: '#6B6252', marginBottom: '2px', letterSpacing: '0.05em' }}>Bill / Invoice Date (optional)</div>
                        <input
                          type="date"
                          value={newBillDate}
                          onChange={e => setNewBillDate(e.target.value)}
                          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #B8AE98', background: '#FDFBF6', fontFamily: 'Source Sans 3, sans-serif', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                    {billFormError && (
                      <div style={{ fontSize: '11px', color: '#8B2A1C', marginBottom: '8px' }}>{billFormError}</div>
                    )}
                    <button
                      onClick={addRampBill}
                      style={{ background: '#1A1A1A', color: '#FDFBF6', border: 'none', padding: '7px 16px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Source Sans 3, sans-serif', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Plus size={11} /> Add Bill
                    </button>
                  </div>

                  {/* Bill list */}
                  {rampBills.length === 0 ? (
                    <div style={{ padding: '16px', background: '#F5F1EA', fontSize: '13px', color: '#6B6252', textAlign: 'center', fontStyle: 'italic' }}>
                      No bills entered yet.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #E8E0D0' }}>
                      {rampBills.map((bill) => (
                        <div key={bill.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #F0E9D8', fontSize: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{bill.vendor}</div>
                            <div style={{ fontSize: '11px', color: '#6B6252', marginTop: '2px' }}>
                              Pays {bill.due_date ? new Date(bill.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                              {bill.bill_date && (
                                <span style={{ marginLeft: '8px' }}>
                                  · Billed {new Date(bill.bill_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="mono" style={{ color: '#8B2A1C', fontWeight: 500 }}>
                              ({fmt(bill.amount)})
                            </span>
                            <button
                              onClick={() => deleteRampBill(bill.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8AE98', padding: '2px', display: 'flex', alignItems: 'center' }}
                              title="Remove bill"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {reconBills.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#F5F1EA', fontSize: '12px', fontWeight: 600 }}>
                          <span>Clearing after {MONTHS[reconMonth]}</span>
                          <span className="mono" style={{ color: '#8B2A1C' }}>({fmt(rampTotal)})</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })()}

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
                  <th>Start</th><th>Inflows</th><th>Outflows</th><th>Payroll</th><th>Owner Draw</th><th>Tax</th><th>Cash End</th>
                  <th style={{ color: '#2A5298', borderLeft: '2px solid #E8E0D0' }}>Actual End</th>
                  <th style={{ color: '#7B5B00', borderLeft: '2px solid #E8E0D0', minWidth: '140px' }}>Clears Bank This Mo.</th>
                </tr>
              </thead>
              <tbody>
                {calculations.monthlyData.map((row) => {
                  const actualEnd = actualEnding[row.monthIdx];
                  const endVariance = actualEnd !== null && actualEnd !== undefined ? actualEnd - row.bankBalance : null;

                  const { clearingTotal, rampClearingThisMonth, priorAccrued } = row;
                  const hasClearing = clearingTotal > 0 || rampClearingThisMonth.length > 0;

                  return (
                    <tr key={row.month}>
                      <td style={{ fontFamily: 'Fraunces, serif', fontSize: '15px', fontWeight: 500 }}>{row.month}</td>
                      <td>{fmt(row.startActual)}</td>
                      <td>
                        <details style={{ display: 'inline' }}>
                          <summary style={{ cursor: 'pointer', listStyle: 'none', textDecoration: 'underline dotted' }}>
                            {fmt(row.inflowsBudget)}
                          </summary>
                          <div style={{ position: 'absolute', zIndex: 100, background: '#FDFBF6', border: '1px solid #B8AE98', padding: '12px', minWidth: '220px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', fontSize: '11px', marginTop: '4px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>QB Income Lines — {row.month}</div>
                            {qbData?.lineItems?.filter(li => li.section === 'income' && li.budget[row.monthIdx] !== 0).map((li, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '2px 0', borderBottom: '1px solid #F0E9D8' }}>
                                <span style={{ color: '#6B6252', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{li.label}</span>
                                <span className="mono" style={{ flexShrink: 0 }}>{fmt(li.budget[row.monthIdx])}</span>
                              </div>
                            ))}
                            {row.customIn > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '2px 0', borderBottom: '1px solid #F0E9D8' }}>
                                <span style={{ color: '#2A5298' }}>Custom items</span>
                                <span className="mono">{fmt(row.customIn)}</span>
                              </div>
                            )}
                          </div>
                        </details>
                      </td>
                      <td>({fmt(row.outflowsBudget - row.draw - row.tax - row.payroll).replace('$','').replace('(','').replace(')','')})</td>
                      <td style={{ minWidth: '110px' }}>
                        <input
                          type="number"
                          value={payrollByMonth[row.monthIdx] || ''}
                          onChange={e => {
                            const v = Number(e.target.value) || 0;
                            setPayrollByMonth(prev => prev.map((x, i) => i === row.monthIdx ? v : x));
                          }}
                          placeholder="0"
                          className="edit"
                          style={{ color: '#8B2A1C' }}
                        />
                      </td>
                      <td>({fmt(row.draw).replace('$','').replace('(','').replace(')','')})</td>
                      <td>{row.tax > 0 ? `(${fmt(row.tax).replace('$','').replace('(','').replace(')','')})` : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(row.bankBalance)}</td>
                      <td style={{ borderLeft: '2px solid #E8E0D0', minWidth: '130px' }}>
                        <input
                          type="number"
                          value={actualEnd ?? ''}
                          onChange={e => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setActualEnding(prev => prev.map((x, i) => i === row.monthIdx ? v : x));
                          }}
                          placeholder="—"
                          className="edit"
                          style={{ color: '#2A5298', fontWeight: 500 }}
                        />
                        {endVariance !== null && (
                          <div style={{ fontSize: '10px', marginTop: '2px', color: endVariance >= 0 ? '#2D5A3D' : '#8B2A1C' }}>
                            {endVariance >= 0 ? '+' : ''}{fmtCompact(endVariance)} vs budget
                          </div>
                        )}
                      </td>
                      <td style={{ borderLeft: '2px solid #E8E0D0', fontSize: '12px', verticalAlign: 'top', paddingTop: '8px' }}>
                        {!hasClearing ? (
                          <span style={{ color: '#9E9484' }}>—</span>
                        ) : (
                          <div>
                            {/* Summary total */}
                            {clearingTotal > 0 && (
                              <div style={{ fontWeight: 600, color: '#7B5B00', marginBottom: '4px' }}>
                                ({fmt(clearingTotal)}) total
                              </div>
                            )}
                            {/* Accrued from prior month */}
                            {priorAccrued > 0 && (
                              <div style={{ fontSize: '11px', color: '#6B6252', marginBottom: '2px', paddingBottom: '3px', borderBottom: rampClearingThisMonth.length > 0 ? '1px dashed #E8E0D0' : 'none' }}>
                                <span style={{ color: '#9E9484' }}>Accrued (prev mo.):</span><br />
                                ({fmt(priorAccrued)})
                              </div>
                            )}
                            {/* Ramp bills clearing this month */}
                            {rampClearingThisMonth.length > 0 && (
                              <div>
                                {priorAccrued > 0 && (
                                  <div style={{ color: '#9E9484', fontSize: '11px', marginTop: '3px', marginBottom: '2px' }}>
                                    Ramp clearing:
                                  </div>
                                )}
                                {rampClearingThisMonth.slice(0, 4).map(b => (
                                  <div key={b.id} style={{ color: '#6B6252', fontSize: '11px', marginBottom: '1px' }}>
                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                                      {b.vendor}: ({fmt(b.amount)})
                                    </div>
                                  </div>
                                ))}
                                {rampClearingThisMonth.length > 4 && (
                                  <div style={{ color: '#9E9484', fontSize: '11px' }}>+{rampClearingThisMonth.length - 4} more</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {activeYear === 2026 && (
                <button className="ghost" onClick={() => copyCustomItemsFromYear(2027)} style={{ fontSize: '11px', opacity: 0.7 }}>
                  Copy from FY 2027
                </button>
              )}
              <button className="ghost" onClick={addCustomItem}>
                <Plus size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />Add Item
              </button>
            </div>
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

        {/* ── Scenarios ── */}
        <section className="card" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
            <div>
              <h2 className="serif" style={{ fontSize: '24px', fontWeight: 400, margin: '0 0 4px' }}>Scenarios</h2>
              <div style={{ fontSize: '12px', color: '#6B6252' }}>
                Save the current dashboard as a named scenario to compare side by side.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {savingScenario ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={newScenarioName}
                    onChange={e => setNewScenarioName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveCurrentScenario(); if (e.key === 'Escape') setSavingScenario(false); }}
                    placeholder="e.g. Base Case"
                    style={{ border: '1px solid #B8AE98', padding: '8px 12px', fontSize: '13px', fontFamily: 'Source Sans 3, sans-serif', width: '180px' }}
                  />
                  <button className="primary" onClick={saveCurrentScenario}>Save</button>
                  <button className="ghost" onClick={() => setSavingScenario(false)}>Cancel</button>
                </>
              ) : (
                <button className="primary" onClick={() => setSavingScenario(true)}>
                  <Plus size={13} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />
                  Save Snapshot
                </button>
              )}
            </div>
          </div>

          {scenarios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#6B6252', fontSize: '13px', fontStyle: 'italic', border: '1px dashed #E8E0D0' }}>
              No scenarios saved yet. Click "Save Snapshot" to capture the current dashboard state.
            </div>
          ) : (
            <>
              {/* Saved scenario chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '28px' }}>
                {scenarios.map((s, i) => {
                  const COLORS = ['#1A1A1A', '#2A5298', '#2D5A3D', '#7B5B00'];
                  const color = COLORS[i % COLORS.length];
                  const isSelected = selectedScenarioId === s.id;
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', border: `1px solid ${color}`, padding: '8px 14px', borderLeft: `4px solid ${color}`, background: isSelected ? color : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
                      onClick={() => setSelectedScenarioId(isSelected ? null : s.id)}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'Fraunces, serif', color: isSelected ? '#FDFBF6' : color }}>{s.name}</div>
                        <div style={{ fontSize: '10px', color: isSelected ? 'rgba(253,251,246,0.7)' : '#6B6252', letterSpacing: '0.05em', marginTop: '2px' }}>
                          {new Date(s.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {isSelected ? ' · click to close' : ' · click to view'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => loadScenario(s)} style={{ background: 'none', border: `1px solid ${isSelected ? 'rgba(253,251,246,0.5)' : '#B8AE98'}`, padding: '3px 8px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Source Sans 3, sans-serif', color: isSelected ? '#FDFBF6' : undefined }}>Load</button>
                        <button onClick={() => { deleteScenario(s.id); if (isSelected) setSelectedScenarioId(null); }} style={{ background: 'none', border: 'none', padding: '3px 6px', fontSize: '10px', color: isSelected ? 'rgba(253,251,246,0.8)' : '#8B2A1C', cursor: 'pointer' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected scenario monthly breakdown */}
              {(() => {
                const sel = scenarios.find(s => s.id === selectedScenarioId);
                if (!sel) return null;
                const idx = scenarios.indexOf(sel);
                const COLORS = ['#1A1A1A', '#2A5298', '#2D5A3D', '#7B5B00'];
                const color = COLORS[idx % COLORS.length];
                const monthly = computeScenarioMonthly(sel);
                const ytdIn = monthly.reduce((s, r) => s + r.totalIn, 0);
                const ytdOut = monthly.reduce((s, r) => s + r.totalOut, 0);
                return (
                  <div style={{ marginBottom: '28px', borderTop: `2px solid ${color}`, paddingTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
                      <div className="serif" style={{ fontSize: '18px', fontWeight: 400, color }}>
                        {sel.name} <em style={{ fontWeight: 300, color: '#6B6252', fontSize: '15px' }}>— monthly breakdown</em>
                      </div>
                      <div style={{ display: 'flex', gap: '24px', fontSize: '11px', color: '#6B6252', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        <span>Starting: <strong className="mono">{fmt(sel.startingCash)}</strong></span>
                        <span>YTD In: <strong className="mono" style={{ color: '#2D5A3D' }}>{fmtCompact(ytdIn)}</strong></span>
                        <span>YTD Out: <strong className="mono" style={{ color: '#8B2A1C' }}>{fmtCompact(ytdOut)}</strong></span>
                        <span>Year-End: <strong className="mono">{fmt(sel.monthlyEndings?.[11] ?? monthly[11].endBudget)}</strong></span>
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="mono">
                        <thead>
                          <tr>
                            <th style={{ fontFamily: 'Source Sans 3, sans-serif' }}>Month</th>
                            <th>Start</th>
                            <th>Inflows</th>
                            <th>Outflows</th>
                            <th>Owner Draw</th>
                            <th>Tax</th>
                            <th style={{ color }}>Cash End</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.map((row, m) => {
                            const cashEnd = sel.monthlyEndings?.[m] ?? row.endBudget;
                            return (
                              <tr key={row.month}>
                                <td style={{ fontFamily: 'Fraunces, serif', fontSize: '15px', fontWeight: 500 }}>{row.month}</td>
                                <td>{fmt(row.start)}</td>
                                <td style={{ color: '#2D5A3D' }}>{fmt(row.totalIn)}</td>
                                <td style={{ color: '#8B2A1C' }}>({fmt(row.totalOut).replace('$','').replace('(','').replace(')','')})</td>
                                <td>({fmt(row.draw).replace('$','').replace('(','').replace(')','')})</td>
                                <td>{row.tax > 0 ? `(${fmt(row.tax).replace('$','').replace('(','').replace(')','')})` : '—'}</td>
                                <td style={{ fontWeight: 600, color: cashEnd < 0 ? '#8B2A1C' : color }}>{fmt(cashEnd)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Comparison table */}
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6252', marginBottom: '12px' }}>
                  Ending Cash Balance — Comparison
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="mono">
                    <thead>
                      <tr>
                        <th style={{ fontFamily: 'Source Sans 3, sans-serif' }}>Month</th>
                        {scenarios.map((s, i) => {
                          const COLORS = ['#1A1A1A', '#2A5298', '#2D5A3D', '#7B5B00'];
                          return (
                            <th key={s.id} style={{ fontFamily: 'Source Sans 3, sans-serif', color: COLORS[i % COLORS.length] }}>
                              {s.name}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {MONTHS.map((month, m) => (
                        <tr key={month}>
                          <td style={{ fontFamily: 'Fraunces, serif', fontSize: '15px' }}>{month}</td>
                          {scenarios.map((s, i) => {
                            const COLORS = ['#1A1A1A', '#2A5298', '#2D5A3D', '#7B5B00'];
                            const val = s.monthlyEndings?.[m] ?? computeScenarioEndings(s)[m];
                            return (
                              <td key={s.id} style={{ color: val < 0 ? '#8B2A1C' : COLORS[i % COLORS.length], fontWeight: 500 }}>
                                {fmt(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#F5F1EA', borderTop: '2px solid #1A1A1A' }}>
                        <td style={{ fontFamily: 'Fraunces, serif', fontWeight: 600 }}>Year-End</td>
                        {scenarios.map((s, i) => {
                          const COLORS = ['#1A1A1A', '#2A5298', '#2D5A3D', '#7B5B00'];
                          const endings = s.monthlyEndings || computeScenarioEndings(s);
                          return (
                            <td key={s.id} style={{ fontWeight: 600, color: COLORS[i % COLORS.length] }}>
                              {fmt(endings[11])}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
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
