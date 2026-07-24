const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { clearTarget } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unbind')
    .setDescription('Clear channel binding / follow mode')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    clearTarget(interaction.guild.id);
    await interaction.reply('Cleared channel binding and follow mode.');
  },
};
