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
const { insertQueueItem, deleteQueueItem, clearGuildQueue, loadQueueRows } = require('./db');
const bus = require('./events');

const guildPlayers = new Map();

const MAX_PLAY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const MIN_BYTES_FOR_SUCCESS = 4096; // below this, treat a non-zero exit as a failed start, not a played track
const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MS ?? 300000); // 0 disables auto-leave
const LOOP_MODES = ['off', 'track', 'queue'];

class GuildPlayer {
  constructor(guildId) {
    this.guildId = guildId;
    this.queue = [];
    this.textChannel = null;
    this.audioPlayer = createAudioPlayer();
    this.currentItem = null;
    this.currentProcess = null;
    this.handleEnd = null; // set by attemptPlay(); resolves either from the child process exiting or the AudioPlayer itself, whichever happens first
    this.playToken = 0; // bumped to invalidate the in-flight attempt (its retries and finish become no-ops)
    this.loopMode = 'off'; // 'off' | 'track' | 'queue'
    this.idleTimer = null; // auto-leave timer (idle queue or empty channel)
    this.lastAnnouncedId = null; // suppress repeat "now playing" spam while track-looping
    this.skipRequested = false; // set by skip() so track-loop advances instead of repeating

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

  // Signal that the queue / playback state changed so the live dashboard (if
  // configured) can refresh. Debounced on the listener side.
  notifyChange() {
    bus.emit('queueUpdate', this.guildId);
  }

  // Rehydrate the in-memory queue from SQLite (called once on startup).
  restoreFromDb() {
    this.queue = loadQueueRows(this.guildId).map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist || '',
      url: r.url || undefined,
      searchQuery: r.search_query || undefined,
      requestedBy: r.requested_by || undefined,
    }));
    return this.queue.length;
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
      connection.rejoin({ channelId: voiceChannel.id, selfDeaf: true });
    }
    return connection;
  }

  enqueue(items, requestedBy) {
    for (const item of items) {
      const record = { ...item, requestedBy };
      record.id = insertQueueItem({ guildId: this.guildId, ...record });
      this.queue.push(record);
    }
    this.clearIdleTimer();
    this.notifyChange();
  }

  async playNext() {
    if (this.audioPlayer.state.status !== AudioPlayerStatus.Idle) return;
    const next = this.queue.shift();
    if (!next) {
      this.scheduleLeave(); // nothing left to play → arm auto-leave
      return;
    }
    this.clearIdleTimer();
    return this.attemptPlay(next, 1, ++this.playToken);
  }

  // `token` identifies this logical play and is reused across retries. If
  // suspend()/stop() bumps playToken, this attempt and its callbacks bail.
  async attemptPlay(item, attempt, token) {
    if (token !== this.playToken) return; // invalidated before we could start
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
        if (settled || token !== this.playToken) return;
        settled = true;
        this.handleEnd = null;
        if (this.currentProcess === proc) this.currentProcess = null;
        proc.kill('SIGKILL');

        const earlyFailure = failed && bytesReceived < MIN_BYTES_FOR_SUCCESS;
        if (earlyFailure && attempt < MAX_PLAY_ATTEMPTS) {
          setTimeout(() => this.attemptPlay(item, attempt + 1, token), RETRY_DELAY_MS);
          return; // keep the DB row so a restart could still replay it
        }
        if (failed) {
          const detail = reason || proc.getYtdlpStderr?.().trim()?.split('\n').pop();
          this.announce(
            `Failed to play **${item.title}**${attempt > 1 ? ` after ${attempt} attempts` : ''}${detail ? `: ${detail}` : ''}`
          );
        }
        // Loop handling — only for tracks that actually played (never loop a
        // failure). A pending skip advances past a track-loop for this one hop.
        // Reuse the resolved url so we don't re-search on replay.
        const skipping = this.skipRequested;
        this.skipRequested = false;
        const resolved = { ...item, url: video.url };
        if (!failed && !skipping && this.loopMode === 'track') {
          this.queue.unshift(resolved); // same DB row, replays from the top
        } else if (!failed && this.loopMode === 'queue') {
          deleteQueueItem(item.id);
          resolved.id = insertQueueItem({ guildId: this.guildId, ...resolved });
          this.queue.push(resolved); // re-added at the end of the queue
        } else {
          deleteQueueItem(item.id); // track is done (played or permanently failed)
        }
        this.currentItem = null;
        this.notifyChange();
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
      this.notifyChange();
      if (attempt === 1 && item.id !== this.lastAnnouncedId) {
        this.lastAnnouncedId = item.id;
        this.announce(`Now playing: **${item.title}**${item.artist ? ` — ${item.artist}` : ''} (requested by <@${item.requestedBy}>)`);
      }
    } catch (err) {
      if (token !== this.playToken) return; // invalidated mid-resolution
      if (attempt < MAX_PLAY_ATTEMPTS) {
        setTimeout(() => this.attemptPlay(item, attempt + 1, token), RETRY_DELAY_MS);
      } else {
        this.announce(`Failed to play **${item.title}**: ${err.message}`);
        deleteQueueItem(item.id);
        this.currentItem = null;
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
    this.skipRequested = true; // advance past a track-loop instead of repeating
    this.audioPlayer.stop();
  }

  stop() {
    this.playToken++; // invalidate the in-flight attempt so its finish() can't re-trigger playback
    this.clearIdleTimer();
    this.skipRequested = false;
    this.queue = [];
    this.currentItem = null;
    clearGuildQueue(this.guildId);
    this.killCurrentProcess();
    this.audioPlayer.stop();
    this.notifyChange();
  }

  pause() {
    const ok = this.audioPlayer.pause();
    this.notifyChange();
    return ok;
  }

  resume() {
    const ok = this.audioPlayer.unpause();
    this.notifyChange();
    return ok;
  }

  // Leave voice but keep the queue intact. The current track is put back at the
  // front so it replays from the start when the bot reconnects. Used by follow
  // mode when the followed user leaves voice entirely.
  suspend() {
    this.playToken++; // invalidate the in-flight attempt: its finish() must not delete the row or advance
    this.clearIdleTimer();
    this.skipRequested = false;
    if (this.currentItem) {
      this.queue.unshift(this.currentItem); // DB row for it still exists → replays on reconnect
      this.currentItem = null;
    }
    this.killCurrentProcess();
    this.audioPlayer.stop();
    const connection = getVoiceConnection(this.guildId);
    if (connection) connection.destroy();
    this.notifyChange();
  }

  // --- queue management --------------------------------------------------

  setLoop(mode) {
    if (!LOOP_MODES.includes(mode)) return this.loopMode;
    this.loopMode = mode;
    this.notifyChange();
    return this.loopMode;
  }

  cycleLoop() {
    return this.setLoop(LOOP_MODES[(LOOP_MODES.indexOf(this.loopMode) + 1) % LOOP_MODES.length]);
  }

  // Remove the up-next item at a 0-based index. Returns the removed item or null.
  removeAt(index) {
    if (index < 0 || index >= this.queue.length) return null;
    const [removed] = this.queue.splice(index, 1);
    deleteQueueItem(removed.id);
    this.notifyChange();
    return removed;
  }

  // Move an up-next item from one 0-based position to another. Returns the item.
  move(from, to) {
    if (from < 0 || from >= this.queue.length || to < 0 || to >= this.queue.length) return null;
    const [item] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, item);
    this.reorderPersist();
    this.notifyChange();
    return item;
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.reorderPersist();
    this.notifyChange();
    return this.queue.length;
  }

  // Clear the up-next list but keep the current track playing.
  clearUpcoming() {
    const count = this.queue.length;
    for (const item of this.queue) deleteQueueItem(item.id);
    this.queue = [];
    this.notifyChange();
    return count;
  }

  // Rewrite the up-next rows so their id order matches the new in-memory order
  // (id is the persisted play order). The currently-playing row is untouched.
  reorderPersist() {
    for (const item of this.queue) deleteQueueItem(item.id);
    for (const item of this.queue) item.id = insertQueueItem({ guildId: this.guildId, ...item });
  }

  // --- auto-leave --------------------------------------------------------

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // Arm the auto-leave timer. On fire: if a queue is still pending (e.g. left
  // alone mid-playback) suspend so it can resume later; otherwise just leave.
  scheduleLeave() {
    this.clearIdleTimer();
    if (!IDLE_TIMEOUT_MS || IDLE_TIMEOUT_MS <= 0) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.hasPending()) {
        this.suspend();
        this.announce("Left the channel after being idle — I kept the queue and'll resume on demand.");
      } else {
        this.leaveVoice();
      }
    }, IDLE_TIMEOUT_MS);
  }

  leaveVoice() {
    this.clearIdleTimer();
    const connection = getVoiceConnection(this.guildId);
    if (connection) connection.destroy();
    this.notifyChange();
  }

  hasPending() {
    return this.currentItem != null || this.queue.length > 0;
  }

  isActive() {
    return this.currentItem != null || this.audioPlayer.state.status !== AudioPlayerStatus.Idle;
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

function peekGuildPlayer(guildId) {
  return guildPlayers.get(guildId) || null;
}

// Graceful shutdown: stop audio and leave voice everywhere WITHOUT clearing the
// persisted queue, so the next boot can restore and resume it.
function shutdownAll() {
  for (const gp of guildPlayers.values()) {
    gp.playToken++;
    gp.clearIdleTimer();
    gp.killCurrentProcess();
    gp.audioPlayer.stop();
    const connection = getVoiceConnection(gp.guildId);
    if (connection) connection.destroy();
  }
}

async function waitForConnectionReady(connection) {
  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
}

module.exports = { getGuildPlayer, peekGuildPlayer, waitForConnectionReady, shutdownAll };
