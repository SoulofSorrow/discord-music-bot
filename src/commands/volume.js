const { SlashCommandBuilder } = require('discord.js');
const { getGuildConfig, setVolume } = require('../config');
const { requireDj } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set or show the playback volume')
    .addIntegerOption((opt) =>
      opt
        .setName('percent')
        .setDescription('Volume in percent (0-200). Omit to just show the current value.')
        .setMinValue(0)
        .setMaxValue(200)
    ),

  async execute(interaction) {
    if (!(await requireDj(interaction))) return;
    const percent = interaction.options.getInteger('percent');
    const guildId = interaction.guild.id;

    if (percent === null) {
      const { volume } = getGuildConfig(guildId);
      return interaction.reply(`Current volume: **${volume}%**`);
    }

    setVolume(guildId, percent);
    await interaction.reply(`Volume set to **${percent}%**. Applies to the next track played (use /skip to apply immediately).`);
  },
};
