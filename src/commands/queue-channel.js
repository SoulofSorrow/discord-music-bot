const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { setQueueChannel, clearQueueChannel } = require('../config');
const { requireAdmin } = require('../permissions');
const { updateDashboard } = require('../dashboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-channel')
    .setDescription('Set up a channel with a live-updating queue display')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Post a self-updating queue message in a text channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Text channel for the live queue display')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('off').setDescription('Stop updating the live queue display')),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'off') {
      clearQueueChannel(guildId);
      return interaction.reply('Live queue display disabled.');
    }

    const channel = interaction.options.getChannel('channel', true);
    setQueueChannel(guildId, channel.id);
    await interaction.reply(`Live queue display set up in <#${channel.id}>. It refreshes automatically as the queue changes.`);

    // Post the initial dashboard message immediately.
    updateDashboard(interaction.client, guildId).catch(() => {});
  },
};
