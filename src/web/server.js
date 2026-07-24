const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const auth = require('./auth');
const { createGuildAccess } = require('./guildAccess');
const { createApiRouter } = require('./api');

function startWebServer(client) {
  const app = express();
  app.set('trust proxy', 1); // reverse proxy terminates TLS; needed for secure cookies + req.secure
  app.use(express.json());
  // Secure cookies require https; allow plain http for local testing against
  // WEB_BASE_URL=http://localhost:PORT (Discord permits localhost redirect URIs
  // without TLS). Behind a real reverse proxy, WEB_BASE_URL is https and this is true.
  const secureCookies = process.env.WEB_BASE_URL?.startsWith('https://') ?? true;
  app.use(
    cookieSession({
      name: 'session',
      secret: process.env.SESSION_SECRET,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
    })
  );

  const guildAccess = createGuildAccess(client);

  app.get('/auth/discord/login', (req, res) => {
    const state = auth.randomState();
    req.session.oauthState = state;
    res.redirect(auth.buildAuthorizeUrl(state));
  });

  app.get('/auth/discord/callback', async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      return res.status(400).send(`Discord login failed: ${errorDescription || error}`);
    }
    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).send('Invalid OAuth state — please try logging in again.');
    }
    req.session.oauthState = null;
    try {
      const accessToken = await auth.exchangeCode(code);
      const user = await auth.fetchDiscordUser(accessToken);
      req.session.discordUserId = user.id;
      req.session.username = user.username;
      req.session.avatar = user.avatar;
      req.session.csrfToken = crypto.randomBytes(24).toString('hex');
      console.log(`[web:auth] login OK for ${user.username} (${user.id})`);
      res.redirect('/');
    } catch (err) {
      console.error('[web] OAuth callback failed:', err);
      res.status(500).send('Login failed, please try again.');
    }
  });

  app.get('/auth/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
  });

  app.get('/api/session', async (req, res) => {
    if (!req.session.discordUserId) return res.json({ loggedIn: false });
    const guilds = await guildAccess.listAdminGuilds(req.session.discordUserId);
    res.json({
      loggedIn: true,
      user: { id: req.session.discordUserId, username: req.session.username, avatar: req.session.avatar },
      csrfToken: req.session.csrfToken,
      guilds,
    });
  });

  app.use('/api/guilds/:guildId', createApiRouter(guildAccess));

  app.use('/public', express.static(path.join(__dirname, 'public')));
  const indexPath = path.join(__dirname, 'views', 'dashboard.html');
  app.get(['/', '/dashboard/:guildId'], (req, res) => res.sendFile(indexPath));

  const port = Number(process.env.WEB_PORT || 3000);
  app.listen(port, () => console.log(`[web] dashboard listening on :${port}`));
  return app;
}

module.exports = { startWebServer };
