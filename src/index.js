require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const { getGuildConfig } = require('./config');
const { getGuildPlayer } = require('./player');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in environment. Check your .env file.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

const commandsDir = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

async function registerCommands() {
  const rest = new REST().setToken(DISCORD_TOKEN);
  const body = client.commands.map((c) => c.data.toJSON());

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
    console.log(`Registered ${body.length} guild commands for guild ${GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log(`Registered ${body.length} global commands (may take up to an hour to propagate).`);
  }
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// Follow mode: move/leave with the followed user's voice state.
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild;
  const config = getGuildConfig(guild.id);
  if (config.mode !== 'follow' || !config.userId) return;
  if (newState.member.id !== config.userId) return;

  const connection = getVoiceConnection(guild.id);

  if (!newState.channelId) {
    // Followed user left voice entirely.
    if (connection) getGuildPlayer(guild.id).destroy();
    return;
  }

  if (!connection) return; // Bot isn't active in this guild yet; /play will join when used.
  if (connection.joinConfig.channelId === newState.channelId) return;

  connection.rejoin({ channelId: newState.channelId, selfDeaf: true });
});

client.login(DISCORD_TOKEN);
