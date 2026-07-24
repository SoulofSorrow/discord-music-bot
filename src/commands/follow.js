const { SlashCommandBuilder } = require('discord.js');
const { setFollowUser } = require('../config');
const { requireAdmin } = require('../permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('follow')
    .setDescription('Make the bot follow a user between voice channels (overrides channel binding)')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to follow into voice channels').setRequired(true)
    ),
  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const user = interaction.options.getUser('user', true);
    setFollowUser(interaction.guild.id, user.id);
    await interaction.reply(`Now following <@${user.id}>. I'll join, move, and rejoin with them automatically. Use /unbind to clear this.`);
  },
};
