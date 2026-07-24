const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Randomly shuffle the up-next queue'),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    if (gp.queue.length < 2) {
      return interaction.reply({ content: 'Need at least two up-next tracks to shuffle.', ephemeral: true });
    }
    const count = gp.shuffle();
    await interaction.reply(`Shuffled ${count} track(s).`);
  },
};
