const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the current queue'),
  async execute(interaction) {
    const gp = getGuildPlayer(interaction.guild.id);

    if (!gp.currentItem && gp.queue.length === 0) {
      return interaction.reply({ content: 'The queue is empty.', ephemeral: true });
    }

    const lines = [];
    if (gp.currentItem) {
      lines.push(`**Now playing:** ${gp.currentItem.title}${gp.currentItem.artist ? ` — ${gp.currentItem.artist}` : ''}`);
    }
    if (gp.queue.length) {
      lines.push('');
      lines.push('**Up next:**');
      gp.queue.slice(0, 10).forEach((item, i) => {
        lines.push(`${i + 1}. ${item.title}${item.artist ? ` — ${item.artist}` : ''}`);
      });
      if (gp.queue.length > 10) lines.push(`…and ${gp.queue.length - 10} more.`);
    }

    await interaction.reply(lines.join('\n'));
  },
};
