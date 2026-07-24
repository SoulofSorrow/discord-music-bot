const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, addAllowedRole, removeAllowedRole } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allow-role')
    .setDescription('Manage which roles are allowed to queue songs with /play')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Allow a role to use /play (once any role is added, only allowed roles can queue)')
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to allow').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a role from the allow-list')
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List roles currently allowed to use /play')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const config = getGuildConfig(interaction.guild.id);
      if (!config.allowedRoleIds.length) {
        return interaction.reply({
          content: 'No role restriction is configured — anyone can use /play.',
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: `Roles allowed to use /play: ${config.allowedRoleIds.map((id) => `<@&${id}>`).join(', ')}`,
        ephemeral: true,
      });
    }

    const role = interaction.options.getRole('role', true);

    if (sub === 'add') {
      addAllowedRole(interaction.guild.id, role.id);
      return interaction.reply(`<@&${role.id}> can now use /play. Only allowed roles may queue songs from now on.`);
    }

    if (sub === 'remove') {
      const remaining = removeAllowedRole(interaction.guild.id, role.id);
      return interaction.reply(
        remaining.length
          ? `Removed <@&${role.id}>. Remaining allowed roles: ${remaining.map((id) => `<@&${id}>`).join(', ')}`
          : `Removed <@&${role.id}>. No roles are restricted anymore — anyone can use /play.`
      );
    }
  },
};
