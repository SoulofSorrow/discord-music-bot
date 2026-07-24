const { SlashCommandBuilder } = require('discord.js');
const { getGuildPlayer } = require('../player');
const { buildQueueEmbed } = require('../queueEmbed');

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show what is playing and what is up next'),
  async execute(interaction) {
    const gp = getGuildPlayer(interaction.guild.id);

    if (!gp.currentItem && gp.queue.length === 0) {
      return interaction.reply({ content: 'The queue is empty.', ephemeral: true });
    }

    await interaction.reply({ embeds: [buildQueueEmbed(gp)], allowedMentions: { parse: [] } });
  },
};
