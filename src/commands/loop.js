const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { requireDj } = require('../permissions');

const LABELS = {
  off: 'off',
  track: '🔂 repeating the current track',
  queue: '🔁 repeating the whole queue',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the repeat mode (omit to cycle off → track → queue)')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Repeat mode')
        .addChoices(
          { name: 'off', value: 'off' },
          { name: 'track', value: 'track' },
          { name: 'queue', value: 'queue' }
        )
    ),
  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const gp = getGuildPlayer(interaction.guild.id);
    const mode = interaction.options.getString('mode');
    const applied = mode ? gp.setLoop(mode) : gp.cycleLoop();
    await interaction.reply(applied === 'off' ? 'Repeat is now **off**.' : `Repeat: **${LABELS[applied]}**.`);
  },
};
