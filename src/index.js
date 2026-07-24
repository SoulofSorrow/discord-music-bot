require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');
const { getGuildConfig } = require('./config');
const { getGuildPlayer, peekGuildPlayer, waitForConnectionReady, shutdownAll } = require('./player');
const { guildsWithQueue, guildsWithDashboard, close: closeDb } = require('./db');
const { requireDj } = require('./permissions');
const bus = require('./events');
const { updateDashboard, scheduleDashboardUpdate } = require('./dashboard');
const { startWebServer } = require('./web/server');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in environment. Check your .env file.');
  process.exit(1);
}

// Web dashboard is entirely optional; only validate its env vars when enabled
// so a missing DISCORD_CLIENT_SECRET etc. never takes down Discord-only setups.
let webReady = process.env.WEB_ENABLED === 'true';
if (webReady) {
  const missing = ['DISCORD_CLIENT_SECRET', 'WEB_BASE_URL', 'SESSION_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`WEB_ENABLED=true but missing env var(s): ${missing.join(', ')}. Web dashboard disabled.`);
    webReady = false;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// Refresh the live queue dashboard whenever the player signals a change.
bus.on('queueUpdate', (guildId) => scheduleDashboardUpdate(client, guildId));

const commandsDir = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

async function registerCommands() {
  const rest = new REST().setToken(DISCORD_TOKEN);
  const body = client.commands.map((c) => c.data.toJSON());

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
    console.log(`Registered ${body.length} guild commands for guild ${GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log(`Registered ${body.length} global commands (may take up to an hour to propagate).`);
  }
}

async function resolveTextChannel(guild, config) {
  if (!config.textChannelId) return null;
  return guild.channels.fetch(config.textChannelId).catch(() => null);
}

// On startup, pull any persisted queues back into memory. Bound-channel guilds
// resume playback automatically; follow-mode guilds resume when the followed
// user is next seen in voice (handled by voiceStateUpdate).
async function restoreQueues() {
  for (const guildId of guildsWithQueue()) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const gp = getGuildPlayer(guildId);
    const restored = gp.restoreFromDb();
    if (!restored) continue;

    const config = getGuildConfig(guildId);
    gp.textChannel = await resolveTextChannel(guild, config);

    // Figure out where to resume: bound channel, or the followed user's current
    // channel if they're already in voice. Otherwise wait for voiceStateUpdate.
    let channel = null;
    if (config.mode === 'channel' && config.channelId) {
      channel = await guild.channels.fetch(config.channelId).catch(() => null);
    } else if (config.mode === 'follow' && config.userId) {
      const member = await guild.members.fetch(config.userId).catch(() => null);
      channel = member?.voice?.channel ?? null;
    }

    if (!channel) {
      console.log(`[restore:${guildId}] restored ${restored} queued track(s); waiting to reconnect.`);
      continue;
    }

    try {
      const connection = gp.ensureConnection(channel);
      await waitForConnectionReady(connection);
      gp.playNext();
      console.log(`[restore:${guildId}] resumed ${restored} queued track(s) in #${channel.name}.`);
    } catch (err) {
      console.error(`[restore:${guildId}] could not rejoin voice:`, err.message);
    }
  }
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
  try {
    await restoreQueues();
  } catch (err) {
    console.error('Failed to restore persisted queues:', err);
  }
  // Redraw any configured dashboards on boot (reflects restored/idle state).
  for (const guildId of guildsWithDashboard()) {
    updateDashboard(client, guildId).catch(() => {});
  }
  if (webReady) {
    try {
      startWebServer(client);
    } catch (err) {
      console.error('Failed to start web dashboard:', err);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) return handleButton(interaction);
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// Dashboard control-panel buttons (customId 'q:<action>'), DJ-gated.
async function handleButton(interaction) {
  if (!interaction.inGuild() || !interaction.customId.startsWith('q:')) return;
  if (!(await requireDj(interaction))) return; // replies ephemerally on rejection

  const gp = getGuildPlayer(interaction.guild.id);
  switch (interaction.customId.slice(2)) {
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
    default:
      break;
  }
  // Acknowledge without a visible reply; the dashboard refreshes via queueUpdate.
  await interaction.deferUpdate().catch(() => {});
}

// Follow mode: automatically move/leave/rejoin with the followed user's voice state.
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild;
  const config = getGuildConfig(guild.id);
  if (config.mode !== 'follow' || !config.userId) return;
  if (newState.member.id !== config.userId) return;

  const gp = peekGuildPlayer(guild.id);
  const connection = getVoiceConnection(guild.id);

  // Followed user left voice entirely: leave but keep the queue for their return.
  if (!newState.channelId) {
    if (gp && (connection || gp.isActive())) {
      gp.suspend();
      gp.announce(`<@${config.userId}> left voice — paused. I'll resume when they come back.`);
    }
    return;
  }

  // Already connected: just move to the user's new channel.
  if (connection) {
    if (connection.joinConfig.channelId !== newState.channelId) {
      connection.rejoin({ channelId: newState.channelId, selfDeaf: true });
    }
    return;
  }

  // Not connected but a queue is waiting (suspended earlier, or restored on
  // startup): rejoin the user's channel and resume automatically.
  if (gp && gp.hasPending()) {
    try {
      gp.textChannel = gp.textChannel || (await resolveTextChannel(guild, config));
      const conn = gp.ensureConnection(newState.channel);
      await waitForConnectionReady(conn);
      gp.playNext();
    } catch (err) {
      console.error(`[follow:${guild.id}] auto-resume failed:`, err.message);
    }
  }
});

// Auto-leave when the bot is left alone (no human listeners) in its channel.
client.on('voiceStateUpdate', (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const connection = getVoiceConnection(guild.id);
  if (!connection) return;

  const botChannelId = connection.joinConfig.channelId;
  if (oldState.channelId !== botChannelId && newState.channelId !== botChannelId) return;

  const channel = guild.channels.cache.get(botChannelId);
  const gp = peekGuildPlayer(guild.id);
  if (!channel || !gp) return;

  const humans = channel.members.filter((m) => !m.user.bot).size;
  if (humans === 0) gp.scheduleLeave();
  else gp.clearIdleTimer();
});

// Graceful shutdown: stop playback and close the DB without wiping the queue,
// so the next boot restores and resumes it.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down…`);
  try {
    shutdownAll();
  } catch (err) {
    console.error('shutdownAll failed:', err);
  }
  // connection.destroy() above only queues the "leave channel" voice state
  // update; without this pause, client.destroy()/exit() can close the gateway
  // socket before it's actually flushed, leaving the bot stuck in voice.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    closeDb();
  } catch (err) {
    console.error('closeDb failed:', err);
  }
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(DISCORD_TOKEN);
