const { EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');

const PAGE_SIZE = 10;
const GREEN = 0x1db954;
const GREY = 0x95a5a6;

function trackLine(item) {
  const who = item.requestedBy ? ` · <@${item.requestedBy}>` : '';
  return `${item.title}${item.artist ? ` — ${item.artist}` : ''}${who}`;
}

// Build the queue embed for both /queue and the live dashboard. Always returns
// an embed; an idle/empty player yields a "nothing playing" state so a pinned
// dashboard message stays present rather than disappearing.
function buildQueueEmbed(gp) {
  const embed = new EmbedBuilder().setTimestamp();
  const total = (gp?.queue.length || 0) + (gp?.currentItem ? 1 : 0);

  if (!gp || total === 0) {
    return embed
      .setColor(GREY)
      .setTitle('🎶 Queue')
      .setDescription('Nothing playing right now. Use `/play` to queue something.');
  }

  const paused = gp.audioPlayer?.state.status === AudioPlayerStatus.Paused;
  embed.setColor(GREEN).setTitle(paused ? '⏸️ Queue (paused)' : '🎶 Queue');

  if (gp.currentItem) {
    embed.addFields({ name: paused ? 'Paused' : 'Now playing', value: trackLine(gp.currentItem) });
  }

  if (gp.queue.length) {
    const lines = gp.queue.slice(0, PAGE_SIZE).map((item, i) => `**${i + 1}.** ${trackLine(item)}`);
    if (gp.queue.length > PAGE_SIZE) lines.push(`…and ${gp.queue.length - PAGE_SIZE} more.`);
    embed.addFields({ name: `Up next (${gp.queue.length})`, value: lines.join('\n') });
  }

  return embed.setFooter({ text: `${total} track(s) total` });
}

module.exports = { buildQueueEmbed };
