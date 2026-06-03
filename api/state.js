export default async function handler(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://taylor634.github.io/cash-flow-dashboard';
  const origin = new URL(frontendUrl).origin;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return res.status(503).json({
      error: 'Cloud storage not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel environment variables.',
    });
  }

  const upstash = async (...cmd) => {
    const r = await fetch(UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmd),
    });
    if (!r.ok) throw new Error(`Upstash error ${r.status}`);
    return r.json();
  };

  const year = req.query.year || (req.body?.year) || '2026';
  const key = `cashflow:${year}`;

  if (req.method === 'GET') {
    const result = await upstash('GET', key);
    const state = result.result ? JSON.parse(result.result) : null;
    return res.json({ state });
  }

  if (req.method === 'POST') {
    const { state } = req.body;
    if (!state) return res.status(400).json({ error: 'state required' });
    const savedAt = new Date().toISOString();
    await upstash('SET', key, JSON.stringify({ ...state, lastSavedAt: savedAt }));
    return res.json({ ok: true, savedAt });
  }

  if (req.method === 'DELETE') {
    await upstash('DEL', key);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
