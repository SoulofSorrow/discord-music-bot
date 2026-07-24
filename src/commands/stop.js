const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue and leave the voice channel'),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    gp.destroy();
    await interaction.reply('Stopped playback, cleared the queue and left the voice channel.');
  },
};
