const { SlashCommandBuilder } = require('discord.js');
const { getGuildConfig, addRole, removeRole } = require('../config');
const { requireAdmin } = require('../permissions');

function tierOption(opt) {
  return opt
    .setName('tier')
    .setDescription('Which permission tier')
    .setRequired(true)
    .addChoices({ name: 'dj', value: 'dj' }, { name: 'admin', value: 'admin' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage DJ / admin roles (who may control playback vs. configure the bot)')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Grant a role a permission tier')
        .addStringOption(tierOption)
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to grant').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Revoke a permission tier from a role')
        .addStringOption(tierOption)
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to revoke').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show configured DJ and admin roles')),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'list') {
      const config = getGuildConfig(guildId);
      const fmt = (ids) => (ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '—');
      return interaction.reply({
        content:
          `**DJ roles** (control playback${config.djRoleIds.length ? '' : ', currently open to everyone'}): ${fmt(config.djRoleIds)}\n` +
          `**Admin roles** (configure the bot, in addition to Manage Server): ${fmt(config.adminRoleIds)}`,
        allowedMentions: { parse: [] },
      });
    }

    const tier = interaction.options.getString('tier', true);
    const role = interaction.options.getRole('role', true);
    const tierLabel = tier === 'admin' ? 'admin' : 'DJ';

    if (sub === 'add') {
      addRole(guildId, tier, role.id);
      const note =
        tier === 'dj'
          ? ' Only DJ roles (and admins) may control playback from now on.'
          : ' Members with this role can now configure the bot.';
      return interaction.reply({
        content: `Added <@&${role.id}> to the **${tierLabel}** tier.${note}`,
        allowedMentions: { parse: [] },
      });
    }

    // remove
    const remaining = removeRole(guildId, tier, role.id);
    const note =
      tier === 'dj' && remaining.length === 0
        ? ' No DJ roles remain — anyone can control playback again.'
        : '';
    return interaction.reply({
      content: `Removed <@&${role.id}> from the **${tierLabel}** tier.${note}`,
      allowedMentions: { parse: [] },
    });
  },
};
