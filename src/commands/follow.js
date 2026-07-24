const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setFollowUser } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('follow')
    .setDescription('Make the bot follow a user between voice channels (overrides channel binding)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to follow into voice channels').setRequired(true)
    ),
  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    setFollowUser(interaction.guild.id, user.id);
    await interaction.reply(`Now following <@${user.id}>. Use /unbind to clear this.`);
  },
};
