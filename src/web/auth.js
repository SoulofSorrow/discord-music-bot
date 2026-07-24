const crypto = require('crypto');

const API_BASE = 'https://discord.com/api/v10';
// Only "identify" is needed: admin status is checked against the bot's own
// guild list (client.guilds.cache), not the user's OAuth guild membership.
const SCOPES = 'identify';

function config() {
  return {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: `${process.env.WEB_BASE_URL}/auth/discord/callback`,
  };
}

function randomState() {
  return crypto.randomBytes(24).toString('hex');
}

function buildAuthorizeUrl(state) {
  const { clientId, redirectUri } = config();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `https://discord.com/oauth2/authorize?${query.toString()}`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = config();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Discord token exchange failed (${res.status})`);
  const json = await res.json();
  return json.access_token;
}

async function fetchJson(pathname, accessToken) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord API ${pathname} failed (${res.status})`);
  return res.json();
}

// Returns { id, username, avatar }.
function fetchDiscordUser(accessToken) {
  return fetchJson('/users/@me', accessToken);
}

module.exports = { randomState, buildAuthorizeUrl, exchangeCode, fetchDiscordUser };
