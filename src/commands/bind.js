const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { setBoundChannel } = require('../config');
const { requireAdmin } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bind')
    .setDescription('Bind the bot to a specific voice channel (overrides follow mode)')
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Voice channel to bind to')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const channel = interaction.options.getChannel('channel', true);
    setBoundChannel(interaction.guild.id, channel.id);
    await interaction.reply(`Bound to voice channel <#${channel.id}>. Use /unbind to clear this.`);
  },
};
