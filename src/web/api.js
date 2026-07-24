const express = require('express');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getGuildConfig, setVolume } = require('../config');
const { getGuildPlayer, peekGuildPlayer, waitForConnectionReady } = require('../player');
const { resolveLinkOrSearch } = require('../resolveLink');

const ALLOW_CALLER_FALLBACK = process.env.ALLOW_CALLER_FALLBACK !== 'false';

function trackJson(item) {
  if (!item) return null;
  return { title: item.title, artist: item.artist || '', requestedBy: item.requestedBy || null };
}

function statusJson(gp) {
  const config = gp ? getGuildConfig(gp.guildId) : null;
  return {
    current: trackJson(gp?.currentItem),
    paused: gp?.audioPlayer?.state.status === AudioPlayerStatus.Paused,
    loopMode: gp?.loopMode ?? 'off',
    volume: config?.volume ?? 100,
    queue: (gp?.queue ?? []).map(trackJson),
  };
}

// Same precedence as /play's resolveTargetChannel (follow > bind > caller),
// except "caller" here is the logged-in web user's own current voice channel.
async function resolveTargetChannel(guild, config, discordUserId) {
  if (config.mode === 'follow' && config.userId) {
    const member = await guild.members.fetch(config.userId).catch(() => null);
    if (!member?.voice.channelId) throw new Error('The followed user is not currently in a voice channel.');
    return member.voice.channel;
  }

  if (config.mode === 'channel' && config.channelId) {
    const channel = await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel) throw new Error('The bound voice channel no longer exists.');
    return channel;
  }

  if (ALLOW_CALLER_FALLBACK) {
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member?.voice.channelId) throw new Error('Join a voice channel in Discord first.');
    return member.voice.channel;
  }

  throw new Error('No bound channel or followed user configured. Use /bind or /follow in Discord.');
}

// State-changing routes are cookie-session-authenticated, so they need their
// own CSRF check (the token is minted at login and embedded in the page).
function assertCsrf(req, res, next) {
  const token = req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }
  next();
}

function createApiRouter(guildAccess) {
  const router = express.Router({ mergeParams: true });
  router.use(guildAccess.requireGuildAdmin);

  router.get('/status', (req, res) => {
    res.json(statusJson(peekGuildPlayer(req.guild.id)));
  });

  router.post('/play', assertCsrf, async (req, res) => {
    const link = String(req.body.link || '').trim();
    if (!link) return res.status(400).json({ error: 'Missing link.' });

    const config = getGuildConfig(req.guild.id);
    let targetChannel;
    try {
      targetChannel = await resolveTargetChannel(req.guild, config, req.session.discordUserId);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let resolved;
    try {
      resolved = await resolveLinkOrSearch(link);
    } catch (err) {
      return res.status(400).json({ error: `Could not resolve that: ${err.message}` });
    }
    if (!resolved.items.length) return res.status(400).json({ error: 'No playable tracks found.' });

    const gp = getGuildPlayer(req.guild.id);
    try {
      const connection = gp.ensureConnection(targetChannel);
      await waitForConnectionReady(connection);
    } catch (err) {
      return res.status(400).json({ error: `Could not join voice channel: ${err.message}` });
    }

    gp.enqueue(resolved.items, req.session.discordUserId);
    if (!gp.isActive()) gp.playNext();
    res.json(statusJson(gp));
  });

  router.post('/control', assertCsrf, (req, res) => {
    const gp = peekGuildPlayer(req.guild.id);
    if (!gp) return res.json(statusJson(null));

    switch (req.body.action) {
      case 'playpause':
        if (gp.audioPlayer.state.status === AudioPlayerStatus.Paused) gp.resume();
        else gp.pause();
        break;
      case 'skip':
        if (gp.currentItem) gp.skip();
        break;
      case 'stop':
        gp.destroy();
        break;
      case 'shuffle':
        gp.shuffle();
        break;
      case 'loop':
        gp.cycleLoop();
        break;
      case 'volume': {
        const volume = Number(req.body.value);
        if (Number.isFinite(volume)) setVolume(req.guild.id, Math.max(0, Math.min(200, volume)));
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown action.' });
    }
    res.json(statusJson(peekGuildPlayer(req.guild.id)));
  });

  router.post('/queue/remove', assertCsrf, (req, res) => {
    const gp = peekGuildPlayer(req.guild.id);
    const removed = gp?.removeAt(Number(req.body.index));
    if (!removed) return res.status(400).json({ error: 'Invalid queue position.' });
    res.json(statusJson(gp));
  });

  router.post('/queue/move', assertCsrf, (req, res) => {
    const gp = peekGuildPlayer(req.guild.id);
    const moved = gp?.move(Number(req.body.from), Number(req.body.to));
    if (!moved) return res.status(400).json({ error: 'Invalid queue positions.' });
    res.json(statusJson(gp));
  });

  return router;
}

module.exports = { createApiRouter, assertCsrf };
