const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState,
} = require('@discordjs/voice');
const { searchYoutube, createAudioProcess } = require('./youtube');
const { getGuildConfig } = require('./config');

const guildPlayers = new Map();

const MAX_PLAY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const MIN_BYTES_FOR_SUCCESS = 4096; // below this, treat a non-zero exit as a failed start, not a played track

class GuildPlayer {
  constructor(guildId) {
    this.guildId = guildId;
    this.queue = [];
    this.textChannel = null;
    this.audioPlayer = createAudioPlayer();
    this.currentItem = null;
    this.currentProcess = null;
    this.handleEnd = null; // set by attemptPlay(); resolves either from the child process exiting or the AudioPlayer itself, whichever happens first

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this.handleEnd?.(false, null);
    });

    this.audioPlayer.on('error', (error) => {
      this.handleEnd?.(true, error.message);
    });
  }

  announce(message) {
    if (this.textChannel) this.textChannel.send(message).catch(() => {});
  }

  ensureConnection(voiceChannel) {
    let connection = getVoiceConnection(this.guildId);
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: this.guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
        debug: process.env.VOICE_DEBUG === 'true',
      });
      connection.subscribe(this.audioPlayer);
      connection.on('error', (err) => console.error(`[voice:${this.guildId}] connection error:`, err));
      connection.on('stateChange', (oldState, newState) => {
        console.log(`[voice:${this.guildId}] ${oldState.status} -> ${newState.status}`);
      });
      if (process.env.VOICE_DEBUG === 'true') {
        connection.on('debug', (msg) => console.log(`[voice:${this.guildId}:debug]`, msg));
      }
    } else if (connection.joinConfig.channelId !== voiceChannel.id) {
      connection.rejoin({
        channelId: voiceChannel.id,
        selfDeaf: true,
      });
    }
    return connection;
  }

  enqueue(items, requestedBy) {
    for (const item of items) this.queue.push({ ...item, requestedBy });
  }

  async playNext() {
    if (this.audioPlayer.state.status !== AudioPlayerStatus.Idle) return;
    const next = this.queue.shift();
    if (!next) return;
    return this.attemptPlay(next, 1);
  }

  async attemptPlay(item, attempt) {
    try {
      const video = item.url ? { url: item.url, title: item.title } : await searchYoutube(item.searchQuery);
      const { volume } = getGuildConfig(this.guildId);
      const proc = createAudioProcess(video.url, volume);
      this.currentProcess = proc;

      let bytesReceived = 0;
      let settled = false;
      proc.stdout.on('data', (chunk) => {
        bytesReceived += chunk.length;
      });

      // Single authority for "this attempt is over" - called from whichever fires first:
      // the child process exiting non-zero, or the AudioPlayer's own Idle/error event.
      const finish = (failed, reason) => {
        if (settled) return;
        settled = true;
        this.handleEnd = null;
        if (this.currentProcess === proc) this.currentProcess = null;
        proc.kill('SIGKILL');

        const earlyFailure = failed && bytesReceived < MIN_BYTES_FOR_SUCCESS;
        if (earlyFailure && attempt < MAX_PLAY_ATTEMPTS) {
          setTimeout(() => this.attemptPlay(item, attempt + 1), RETRY_DELAY_MS);
          return;
        }
        if (failed) {
          const detail = reason || proc.getYtdlpStderr?.().trim()?.split('\n').pop();
          this.announce(
            `Failed to play **${item.title}**${attempt > 1 ? ` after ${attempt} attempts` : ''}${detail ? `: ${detail}` : ''}`
          );
        }
        this.currentItem = null;
        this.playNext();
      };

      proc.once('exit', (code) => {
        if (code && code !== 0) finish(true, null);
        // exit code 0 (clean end of track): let the AudioPlayer's own Idle event drive `finish` once it drains.
      });

      this.handleEnd = finish;

      const resource = createAudioResource(proc.stdout, { inputType: StreamType.OggOpus });
      this.currentItem = { ...item, url: video.url };
      this.audioPlayer.play(resource);
      if (attempt === 1) {
        this.announce(`Now playing: **${item.title}**${item.artist ? ` — ${item.artist}` : ''} (requested by <@${item.requestedBy}>)`);
      }
    } catch (err) {
      if (attempt < MAX_PLAY_ATTEMPTS) {
        setTimeout(() => this.attemptPlay(item, attempt + 1), RETRY_DELAY_MS);
      } else {
        this.announce(`Failed to play **${item.title}**: ${err.message}`);
        return this.playNext();
      }
    }
  }

  killCurrentProcess() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = null;
    }
  }

  skip() {
    this.audioPlayer.stop();
  }

  stop() {
    this.queue = [];
    this.currentItem = null;
    this.killCurrentProcess();
    this.audioPlayer.stop();
  }

  pause() {
    return this.audioPlayer.pause();
  }

  resume() {
    return this.audioPlayer.unpause();
  }

  destroy() {
    this.stop();
    const connection = getVoiceConnection(this.guildId);
    if (connection) connection.destroy();
    guildPlayers.delete(this.guildId);
  }
}

function getGuildPlayer(guildId) {
  let gp = guildPlayers.get(guildId);
  if (!gp) {
    gp = new GuildPlayer(guildId);
    guildPlayers.set(guildId, gp);
  }
  return gp;
}

async function waitForConnectionReady(connection) {
  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
}

module.exports = { getGuildPlayer, waitForConnectionReady };
