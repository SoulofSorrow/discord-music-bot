const { spawn } = require('child_process');

const YOUTUBE_URL_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([\w-]{11})/;

function isYoutubeUrl(url) {
  return YOUTUBE_URL_RE.test(url);
}

function runYtDlpJson(target, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--dump-json', '--no-warnings', '--skip-download', ...extraArgs, target]);

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
      } catch (err) {
        reject(new Error('Could not parse yt-dlp output'));
      }
    });
  });
}

function searchYoutube(query) {
  return runYtDlpJson(query, ['--default-search', 'ytsearch1']);
}

function getYoutubeInfo(url) {
  return runYtDlpJson(url);
}

// Pipes yt-dlp's best audio stream through ffmpeg into Ogg/Opus, ready for @discordjs/voice.
// Returns the ffmpeg child process; its stdout is the playable stream.
function createAudioProcess(url, volume = 100) {
  const ytdlp = spawn('yt-dlp', [
    '-f',
    'bestaudio',
    '-o',
    '-',
    '--no-warnings',
    '--quiet',
    '--no-part',
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

module.exports = { isYoutubeUrl, searchYoutube, getYoutubeInfo, createAudioProcess };
