export default async function handler(req, res) {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://taylor634.github.io/cash-flow-dashboard';

  if (error || !code) {
    return res.redirect(
      `${frontendUrl}#ramp_error=${encodeURIComponent(error || 'missing_code')}`
    );
  }

  try {
    const resp = await fetch('https://api.ramp.com/developer/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.RAMP_REDIRECT_URI,
        client_id: process.env.RAMP_CLIENT_ID,
        client_secret: process.env.RAMP_CLIENT_SECRET,
      }),
    });

    const data = await resp.json();

    if (data.access_token) {
      const expires = Date.now() + (data.expires_in || 3600) * 1000;
      return res.redirect(
        `${frontendUrl}#ramp_token=${encodeURIComponent(data.access_token)}&ramp_expires=${expires}`
      );
    }

    return res.redirect(
      `${frontendUrl}#ramp_error=${encodeURIComponent(data.error || 'token_exchange_failed')}`
    );
  } catch (err) {
    return res.redirect(
      `${frontendUrl}#ramp_error=${encodeURIComponent(err.message)}`
    );
  }
}
