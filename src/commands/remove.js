const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the up-next queue by its position')
    .addIntegerOption((o) =>
      o
        .setName('position')
        .setDescription('Position in the up-next list (see /queue)')
        .setRequired(true)
        .setMinValue(1)
    ),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    const pos = interaction.options.getInteger('position', true);
    const removed = gp.removeAt(pos - 1);
    if (!removed) {
      return interaction.reply({ content: `There is no track at position ${pos}.`, ephemeral: true });
    }
    await interaction.reply({ content: `Removed **${removed.title}** (was position ${pos}).`, allowedMentions: { parse: [] } });
  },
};
