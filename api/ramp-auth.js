export default function handler(req, res) {
  const { RAMP_CLIENT_ID, RAMP_REDIRECT_URI } = process.env;

  if (!RAMP_CLIENT_ID || !RAMP_REDIRECT_URI) {
    return res.status(500).send(
      'Ramp not configured. Add RAMP_CLIENT_ID and RAMP_REDIRECT_URI to your Vercel environment variables.'
    );
  }

  const params = new URLSearchParams({
    client_id: RAMP_CLIENT_ID,
    redirect_uri: RAMP_REDIRECT_URI,
    response_type: 'code',
    scope: 'bills:read',
  });

  res.redirect(`https://app.ramp.com/v1/authorize?${params}`);
}
