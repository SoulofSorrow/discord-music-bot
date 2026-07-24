const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track to a different position in the up-next queue')
    .addIntegerOption((o) =>
      o.setName('from').setDescription('Current position').setRequired(true).setMinValue(1)
    )
    .addIntegerOption((o) =>
      o.setName('to').setDescription('New position').setRequired(true).setMinValue(1)
    ),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    const from = interaction.options.getInteger('from', true);
    const to = interaction.options.getInteger('to', true);
    const moved = gp.move(from - 1, to - 1);
    if (!moved) {
      return interaction.reply({ content: 'Invalid positions — check /queue.', ephemeral: true });
    }
    await interaction.reply({ content: `Moved **${moved.title}** to position ${to}.`, allowedMentions: { parse: [] } });
  },
};
