const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the up-next queue (the current track keeps playing)'),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    const count = gp.clearUpcoming();
    if (!count) {
      return interaction.reply({ content: 'The up-next queue is already empty.', ephemeral: true });
    }
    await interaction.reply(`Cleared ${count} track(s) from the up-next queue.`);
  },
};
