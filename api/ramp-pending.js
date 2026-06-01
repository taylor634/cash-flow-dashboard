export default async function handler(req, res) {
  // Origin header is scheme+host only — strip any path from FRONTEND_URL
  const frontendUrl = process.env.FRONTEND_URL || 'https://taylor634.github.io/cash-flow-dashboard';
  const origin = new URL(frontendUrl).origin;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = auth.slice(7);

  try {
    // Fetch all bills in one call (no status filter to avoid 422 errors)
    // Then filter client-side for pending/uncleared statuses
    const PENDING_STATUSES = new Set([
      'APPROVED',
      'PAYMENT_PROCESSING',
      'PAYMENT_IN_TRANSIT',
      'APPROVAL_NEEDED',
    ]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let allBills = [];
    const url = new URL('https://api.ramp.com/developer/v1/bills');
    url.searchParams.set('page_size', '100');

    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (r.status === 401) {
      return res.status(401).json({ error: 'Ramp token expired — please reconnect.' });
    }

    if (!r.ok) {
      const text = await r.text();
      console.error('Ramp API error:', r.status, text);
      return res.status(502).json({ error: `Ramp API returned ${r.status}: ${text.slice(0, 200)}` });
    }

    const data = await r.json();
    const rawBills = data.data || data.bills || data.results || [];

    // Log all statuses seen so we can debug missing bills
    const statusesSeen = [...new Set(rawBills.map(b => b.status))];
    console.log('Ramp bills fetched:', rawBills.length, 'Statuses:', statusesSeen);
    rawBills.forEach(b => {
      const vendor = b.vendor?.name || b.counterparty_name || b.description || 'Unknown';
      console.log(`  Bill: ${vendor} | status: ${b.status} | amount: ${b.amount}`);
    });

    // Show everything that hasn't been fully paid or cancelled
    const EXCLUDED_STATUSES = new Set(['PAID', 'CANCELLED', 'REJECTED', 'VOIDED']);
    allBills = rawBills.filter(b => !EXCLUDED_STATUSES.has(b.status));

    // Normalize amounts — Ramp stores amounts in cents
    const bills = allBills.map(b => ({
      id: b.id,
      vendor: b.vendor?.name || b.counterparty_name || b.description || 'Unknown',
      amount: (b.amount || 0) / 100,
      due_date: b.due_at || b.due_date || null,
      status: b.status,
    }));

    const total = bills.reduce((sum, b) => sum + b.amount, 0);
    return res.json({ bills, total, count: bills.length });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Ramp API timed out. Try again.' });
    }
    return res.status(500).json({ error: err.message });
  }
}
