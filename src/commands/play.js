const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getGuildConfig, setTextChannel } = require('../config');
const { parseSpotifyUrl, resolveSpotifyLink } = require('../spotify');
const { isYoutubeUrl, resolveYoutube, searchYoutube } = require('../youtube');
const { getGuildPlayer, waitForConnectionReady } = require('../player');
const { requireDj } = require('../permissions');

const ALLOW_CALLER_FALLBACK = process.env.ALLOW_CALLER_FALLBACK !== 'false';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a YouTube link/playlist, a Spotify link, or a search term')
    .addStringOption((opt) =>
      opt.setName('link').setDescription('YouTube/Spotify link or search term').setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireDj(interaction))) return;

    const link = interaction.options.getString('link', true).trim();
    const guild = interaction.guild;
    const config = getGuildConfig(guild.id);

    const targetChannel = await resolveTargetChannel(interaction, guild, config);
    if (!targetChannel) return; // resolveTargetChannel already replied

    await interaction.deferReply();

    let resolved;
    try {
      if (isYoutubeUrl(link)) {
        resolved = await resolveYoutube(link);
      } else if (parseSpotifyUrl(link)) {
        resolved = await resolveSpotifyLink(link);
      } else {
        // Free-text search term → resolve the top YouTube hit up front so the
        // announced title is correct.
        const video = await searchYoutube(link);
        resolved = { parsed: { type: 'search' }, items: [{ title: video.title, artist: '', url: video.url }] };
      }
    } catch (err) {
      return interaction.editReply(`Could not resolve that: ${err.message}`);
    }

    if (!resolved.items.length) {
      return interaction.editReply('No playable tracks found.');
    }

    const gp = getGuildPlayer(guild.id);
    gp.textChannel = interaction.channel;
    setTextChannel(guild.id, interaction.channel.id); // remember for restore announcements

    try {
      const connection = gp.ensureConnection(targetChannel);
      await waitForConnectionReady(connection);
    } catch (err) {
      return interaction.editReply(`Could not join voice channel: ${err.message}`);
    }

    gp.enqueue(resolved.items, interaction.user.id);

    const wasIdle = !gp.isActive();
    if (wasIdle) gp.playNext();

    if (resolved.items.length === 1) {
      await interaction.editReply(
        wasIdle
          ? `Loading **${resolved.items[0].title}**…`
          : `Queued **${resolved.items[0].title}** (position ${gp.queue.length}).`
      );
    } else {
      await interaction.editReply(`Queued ${resolved.items.length} tracks from that ${resolved.parsed.type}.`);
    }
  },
};

// Decide which voice channel to play in: follow > bind > caller fallback.
// Replies with an ephemeral error and returns null when no target is available.
async function resolveTargetChannel(interaction, guild, config) {
  if (config.mode === 'follow' && config.userId) {
    const member = await guild.members.fetch(config.userId).catch(() => null);
    if (!member || !member.voice.channelId) {
      await interaction.reply({
        content: `The followed user <@${config.userId}> is not currently in a voice channel.`,
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }
    return member.voice.channel;
  }

  if (config.mode === 'channel' && config.channelId) {
    const channel = await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel) {
      await interaction.reply({
        content: 'The bound voice channel no longer exists. Ask an admin to /bind a new one.',
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }
    return channel;
  }

  if (ALLOW_CALLER_FALLBACK) {
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.voice.channelId) {
      await interaction.reply({
        content: 'Join a voice channel first, or ask an admin to /bind a channel or /follow a user.',
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }
    return member.voice.channel;
  }

  await interaction.reply({
    content: 'This bot has no bound channel or followed user configured. Ask an admin to run /bind or /follow.',
    flags: MessageFlags.Ephemeral,
  });
  return null;
}
