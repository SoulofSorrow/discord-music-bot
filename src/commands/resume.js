const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');

module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume the paused track'),
  async execute(interaction) {
    const gp = getGuildPlayer(interaction.guild.id);
    if (!gp.currentItem) {
      return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
    }
    gp.resume();
    await interaction.reply('Resumed.');
  },
};
