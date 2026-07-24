const { spawn } = require('child_process');

const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([\w-]{11})/;
const PLAYLIST_ID_RE = /[?&]list=([\w-]+)/;

function isYoutubeUrl(url) {
  return YOUTUBE_URL_RE.test(url) || /[/?]playlist\?/.test(url);
}

// Optional yt-dlp cookie args for age-restricted / bot-checked videos.
// YTDLP_COOKIES = path to a Netscape cookies file; YTDLP_COOKIES_FROM_BROWSER =
// a browser name yt-dlp reads cookies from (e.g. "chrome", "firefox").
function ytdlpCookieArgs() {
  if (process.env.YTDLP_COOKIES) return ['--cookies', process.env.YTDLP_COOKIES];
  if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
    return ['--cookies-from-browser', process.env.YTDLP_COOKIES_FROM_BROWSER];
  }
  return [];
}

// Returns { type: 'video'|'playlist', id } for a YouTube URL, or null.
// A bare /playlist link resolves to the whole playlist; a watch link resolves
// to the single video even if it carries a &list= param (predictable).
function parseYoutube(url) {
  const video = url.match(YOUTUBE_URL_RE);
  const list = url.match(PLAYLIST_ID_RE);
  if (/[/?]playlist\?/.test(url) && list) return { type: 'playlist', id: list[1] };
  if (video) return { type: 'video', id: video[1] };
  if (list) return { type: 'playlist', id: list[1] };
  return null;
}

// --- YouTube Data API v3 -------------------------------------------------

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function apiKey() {
  return process.env.YOUTUBE_API_KEY || null;
}

async function apiGet(endpoint, params) {
  const query = new URLSearchParams({ ...params, key: apiKey() }).toString();
  const res = await fetch(`${API_BASE}/${endpoint}?${query}`);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(`YouTube API ${endpoint} failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function apiSearch(query) {
  const json = await apiGet('search', { part: 'snippet', type: 'video', maxResults: '1', q: query });
  const item = json.items?.[0];
  if (!item) throw new Error(`No YouTube results for "${query}"`);
  return { url: watchUrl(item.id.videoId), title: item.snippet.title };
}

async function apiVideoInfo(videoId) {
  const json = await apiGet('videos', { part: 'snippet', id: videoId });
  const item = json.items?.[0];
  if (!item) throw new Error('YouTube video not found (private, deleted, or region-blocked).');
  return { url: watchUrl(videoId), title: item.snippet.title };
}

async function apiPlaylistItems(playlistId) {
  const items = [];
  let pageToken;
  do {
    const json = await apiGet('playlistItems', {
      part: 'snippet',
      maxResults: '50',
      playlistId,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const entry of json.items || []) {
      const videoId = entry.snippet?.resourceId?.videoId;
      const title = entry.snippet?.title;
      // Skip deleted/private placeholders that carry no usable title.
      if (!videoId || !title || title === 'Deleted video' || title === 'Private video') continue;
      items.push({ title, artist: '', url: watchUrl(videoId) });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  if (!items.length) throw new Error('That playlist has no playable videos.');
  return items;
}

// --- yt-dlp fallback (used when no YOUTUBE_API_KEY is set) ----------------

function runYtDlpJson(target, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--dump-json',
      '--no-warnings',
      '--skip-download',
      ...ytdlpCookieArgs(),
      ...extraArgs,
      target,
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', reject);
    proc.on('close', (code) => {
      const line = stdout.trim().split('\n')[0];
      if (code !== 0 || !line) {
        return reject(new Error(stderr.trim().split('\n').pop() || 'yt-dlp lookup failed'));
      }
      try {
        const info = JSON.parse(line);
        resolve({ url: info.webpage_url, title: info.title });
      } catch {
        reject(new Error('Could not parse yt-dlp output'));
      }
    });
  });
}

// --- public resolution API ----------------------------------------------

// Search YouTube for a query and return the top hit as { url, title }.
function searchYoutube(query) {
  if (apiKey()) return apiSearch(query);
  return runYtDlpJson(query, ['--default-search', 'ytsearch1']);
}

// Look up metadata for a single YouTube URL as { url, title }.
function getYoutubeInfo(url) {
  const parsed = parseYoutube(url);
  if (apiKey() && parsed?.type === 'video') return apiVideoInfo(parsed.id);
  return runYtDlpJson(url);
}

// Resolve any YouTube URL into a queueable item list: { parsed, items }.
async function resolveYoutube(url) {
  const parsed = parseYoutube(url);
  if (!parsed) throw new Error('That does not look like a valid YouTube link.');

  if (parsed.type === 'playlist') {
    if (!apiKey()) {
      throw new Error('Playlist links require YOUTUBE_API_KEY to be configured.');
    }
    return { parsed, items: await apiPlaylistItems(parsed.id) };
  }

  const video = await getYoutubeInfo(url);
  return { parsed, items: [{ title: video.title, artist: '', url: video.url }] };
}

// Pipes yt-dlp's best audio stream through ffmpeg into Ogg/Opus, ready for
// @discordjs/voice. Returns the ffmpeg child process; its stdout is the stream.
function createAudioProcess(url, volume = 100) {
  const ytdlp = spawn('yt-dlp', [
    '-f',
    'bestaudio',
    '-o',
    '-',
    '--no-warnings',
    '--quiet',
    '--no-part',
    ...ytdlpCookieArgs(),
    url,
  ]);
  const ffmpeg = spawn('ffmpeg', [
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-vn',
    '-af',
    `volume=${Math.max(0, volume) / 100}`,
    '-acodec',
    'libopus',
    '-f',
    'ogg',
    'pipe:1',
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ytdlp.on('error', (err) => ffmpeg.emit('error', err));
  ytdlp.stdout.on('error', () => {}); // swallow EPIPE when ffmpeg exits first
  ffmpeg.stdin.on('error', () => {}); // swallow EPIPE when yt-dlp exits first

  let ytdlpStderr = '';
  ytdlp.stderr.on('data', (chunk) => {
    ytdlpStderr += chunk;
  });

  ffmpeg.kill = ((originalKill) => (...args) => {
    ytdlp.kill('SIGKILL');
    return originalKill.apply(ffmpeg, args);
  })(ffmpeg.kill.bind(ffmpeg));

  ffmpeg.getYtdlpStderr = () => ytdlpStderr;

  return ffmpeg;
}

module.exports = {
  isYoutubeUrl,
  parseYoutube,
  searchYoutube,
  getYoutubeInfo,
  resolveYoutube,
  createAudioProcess,
};
