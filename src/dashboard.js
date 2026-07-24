const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { getGuildConfig, setQueueMessageId } = require('./config');
const { peekGuildPlayer } = require('./player');
const { buildQueueEmbed } = require('./queueEmbed');

const DEBOUNCE_MS = 1500;
const pending = new Map(); // guildId -> timeout

const LOOP_EMOJI = { off: '🔁', track: '🔂', queue: '🔁' };

// Control-panel buttons for the dashboard message. customIds are 'q:<action>'
// and are handled centrally in index.js (with a DJ permission check).
function buildComponents(gp) {
  const idle = !gp || (!gp.currentItem && gp.queue.length === 0);
  const paused = gp?.audioPlayer?.state.status === AudioPlayerStatus.Paused;
  const loopMode = gp?.loopMode ?? 'off';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('q:playpause')
      .setEmoji(paused ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(idle),
    new ButtonBuilder().setCustomId('q:skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(idle),
    new ButtonBuilder().setCustomId('q:stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger).setDisabled(idle),
    new ButtonBuilder()
      .setCustomId('q:shuffle')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!gp || gp.queue.length < 2),
    new ButtonBuilder()
      .setCustomId('q:loop')
      .setEmoji(LOOP_EMOJI[loopMode])
      .setStyle(loopMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success)
  );
  return [row];
}

// Refresh the dashboard message for a guild. Edits the existing message when
// possible; (re)creates it if missing or deleted. No-op when no dashboard
// channel is configured.
async function updateDashboard(client, guildId) {
  const config = getGuildConfig(guildId);
  if (!config.queueChannelId) return;

  const channel = await client.channels.fetch(config.queueChannelId).catch(() => null);
  if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) return;

  const gp = peekGuildPlayer(guildId);
  const payload = { embeds: [buildQueueEmbed(gp)], components: buildComponents(gp), allowedMentions: { parse: [] } };

  if (config.queueMessageId) {
    const existing = await channel.messages.fetch(config.queueMessageId).catch(() => null);
    if (existing) {
      await existing.edit(payload).catch(() => {});
      return;
    }
  }

  const sent = await channel.send(payload).catch(() => null);
  if (sent) setQueueMessageId(guildId, sent.id);
}

// Coalesce bursts of changes (e.g. queueing a 50-track playlist) into a single
// edit per guild.
function scheduleDashboardUpdate(client, guildId) {
  clearTimeout(pending.get(guildId));
  pending.set(
    guildId,
    setTimeout(() => {
      pending.delete(guildId);
      updateDashboard(client, guildId).catch((err) =>
        console.error(`[dashboard:${guildId}]`, err.message)
      );
    }, DEBOUNCE_MS)
  );
}

module.exports = { updateDashboard, scheduleDashboardUpdate };
