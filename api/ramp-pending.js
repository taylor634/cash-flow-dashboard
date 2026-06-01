export default async function handler(req, res) {
  // Origin header is scheme+host only — strip any path from FRONTEND_URL
  const frontendUrl = process.env.FRONTEND_URL || 'https://taylor634.github.io/cash-flow-dashboard';
  const origin = new URL(frontendUrl).origin; // e.g. "https://taylor634.github.io"
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
    const allBills = [];

    // Fetch bills that are approved/scheduled but not yet cleared from the bank
    for (const status of ['APPROVED', 'PAYMENT_PROCESSING']) {
      let cursor = null;

      do {
        const url = new URL('https://api.ramp.com/developer/v1/bills');
        url.searchParams.set('status', status);
        url.searchParams.set('page_size', '100');
        if (cursor) url.searchParams.set('start', cursor);

        const r = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (r.status === 401) {
          return res.status(401).json({ error: 'Ramp token expired — please reconnect.' });
        }

        if (!r.ok) {
          console.error('Ramp API error:', r.status, await r.text());
          break;
        }

        const data = await r.json();
        if (data.data) allBills.push(...data.data);
        cursor = data.page?.next || null;
      } while (cursor);
    }

    // Ramp bill amounts are in cents
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
    return res.status(500).json({ error: err.message });
  }
}
