const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');

module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current track'),
  async execute(interaction) {
    const gp = getGuildPlayer(interaction.guild.id);
    if (!gp.currentItem) {
      return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
    }
    gp.pause();
    await interaction.reply('Paused.');
  },
};
