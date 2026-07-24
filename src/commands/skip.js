const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    if (!gp.currentItem) {
      return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
    }
    const skipped = gp.currentItem.title;
    gp.skip();
    await interaction.reply(`Skipped **${skipped}**.`);
  },
};
