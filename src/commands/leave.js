const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the voice channel without changing binding/follow settings'),
  async execute(interaction) {
    const gp = getGuildPlayer(interaction.guild.id);
    gp.destroy();
    await interaction.reply('Left the voice channel.');
  },
};
