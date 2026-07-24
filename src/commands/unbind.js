const { SlashCommandBuilder } = require('discord.js');
const { clearTarget } = require('../config');
const { requireAdmin } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unbind')
    .setDescription('Clear channel binding / follow mode'),
  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    clearTarget(interaction.guild.id);
    await interaction.reply('Cleared channel binding and follow mode.');
  },
};
