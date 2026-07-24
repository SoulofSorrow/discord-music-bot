const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getGuildConfig } = require('../config');
const { resolveSpotifyLink } = require('../spotify');
const { isYoutubeUrl, getYoutubeInfo } = require('../youtube');
const { getGuildPlayer, waitForConnectionReady } = require('../player');

const ALLOW_CALLER_FALLBACK = process.env.ALLOW_CALLER_FALLBACK !== 'false';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a Spotify link (track/album/playlist/episode) or a YouTube link')
    .addStringOption((opt) =>
      opt.setName('link').setDescription('Spotify link').setRequired(true)
    ),

  async execute(interaction) {
    const link = interaction.options.getString('link', true);
    const guild = interaction.guild;
    const config = getGuildConfig(guild.id);

    if (config.allowedRoleIds.length > 0) {
      const member = await guild.members.fetch(interaction.user.id);
      const hasAllowedRole = member.roles.cache.some((role) => config.allowedRoleIds.includes(role.id));
      if (!hasAllowedRole) {
        return interaction.reply({
          content: `You don't have permission to queue songs. Allowed roles: ${config.allowedRoleIds
            .map((id) => `<@&${id}>`)
            .join(', ')}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    let targetChannel = null;

    if (config.mode === 'follow' && config.userId) {
      const member = await guild.members.fetch(config.userId).catch(() => null);
      if (!member || !member.voice.channelId) {
        return interaction.reply({
          content: `The followed user <@${config.userId}> is not currently in a voice channel.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      targetChannel = member.voice.channel;
    } else if (config.mode === 'channel' && config.channelId) {
      targetChannel = await guild.channels.fetch(config.channelId).catch(() => null);
      if (!targetChannel) {
        return interaction.reply({
          content: `The bound voice channel no longer exists. Ask an admin to /bind a new one.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (ALLOW_CALLER_FALLBACK) {
      const member = await guild.members.fetch(interaction.user.id);
      if (!member.voice.channelId) {
        return interaction.reply({
          content: `Join a voice channel first, or ask an admin to /bind a channel or /follow a user.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      targetChannel = member.voice.channel;
    } else {
      return interaction.reply({
        content: `This bot has no bound channel or followed user configured. Ask an admin to run /bind or /follow.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    let resolved;
    try {
      if (isYoutubeUrl(link)) {
        const video = await getYoutubeInfo(link);
        resolved = { parsed: { type: 'video' }, items: [{ title: video.title, artist: '', url: video.url }] };
      } else {
        resolved = await resolveSpotifyLink(link);
      }
    } catch (err) {
      return interaction.editReply(`Could not resolve that link: ${err.message}`);
    }

    if (!resolved.items.length) {
      return interaction.editReply('No playable tracks found in that link.');
    }

    const gp = getGuildPlayer(guild.id);
    gp.textChannel = interaction.channel;

    try {
      const connection = gp.ensureConnection(targetChannel);
      await waitForConnectionReady(connection);
    } catch (err) {
      return interaction.editReply(`Could not join voice channel: ${err.message}`);
    }

    gp.enqueue(resolved.items, interaction.user.id);

    const wasIdle = !gp.currentItem;
    if (wasIdle) gp.playNext();

    if (resolved.items.length === 1) {
      await interaction.editReply(
        wasIdle
          ? `Loading **${resolved.items[0].title}**…`
          : `Queued **${resolved.items[0].title}** (position ${gp.queue.length}).`
      );
    } else {
      await interaction.editReply(
        `Queued ${resolved.items.length} tracks from that ${resolved.parsed.type}.`
      );
    }
  },
};
