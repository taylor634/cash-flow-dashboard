export default async function handler(req, res) {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://taylor634.github.io/cash-flow-dashboard';

  if (error || !code) {
    return res.redirect(
      `${frontendUrl}#ramp_error=${encodeURIComponent(error || 'missing_code')}`
    );
  }

  try {
    // Ramp requires client credentials as HTTP Basic Auth
    const credentials = Buffer.from(
      `${process.env.RAMP_CLIENT_ID}:${process.env.RAMP_CLIENT_SECRET}`
    ).toString('base64');

    const resp = await fetch('https://api.ramp.com/developer/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.RAMP_REDIRECT_URI,
      }),
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }

    if (data.access_token) {
      const expires = Date.now() + (data.expires_in || 3600) * 1000;
      return res.redirect(
        `${frontendUrl}#ramp_token=${encodeURIComponent(data.access_token)}&ramp_expires=${expires}`
      );
    }

    // Show a readable error message
    const errMsg = typeof data.error === 'string'
      ? data.error
      : (data.error_description || data.message || JSON.stringify(data));

    return res.redirect(
      `${frontendUrl}#ramp_error=${encodeURIComponent(errMsg)}`
    );
  } catch (err) {
    return res.redirect(
      `${frontendUrl}#ramp_error=${encodeURIComponent(err.message)}`
    );
  }
}
