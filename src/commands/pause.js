const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current track'),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    if (!gp.currentItem) {
      return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
    }
    gp.pause();
    await interaction.reply('Paused.');
  },
};
