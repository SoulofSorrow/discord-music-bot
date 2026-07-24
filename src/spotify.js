const SPOTIFY_URL_RE =
  /open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(track|album|playlist|episode)\/([a-zA-Z0-9]+)/;

function parseSpotifyUrl(url) {
  const match = url.match(SPOTIFY_URL_RE);
  if (!match) return null;
  return { type: match[1], id: match[2] };
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;
  return cachedToken;
}

async function spotifyApi(pathname, token) {
  const res = await fetch(`https://api.spotify.com/v1${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API error ${res.status} for ${pathname}`);
  return res.json();
}

function trackToItem(track) {
  const artists = (track.artists || []).map((a) => a.name).join(', ');
  const title = track.name;
  return {
    title,
    artist: artists,
    searchQuery: artists ? `${artists} - ${title}` : title,
  };
}

async function resolveTrack(id, token) {
  const track = await spotifyApi(`/tracks/${id}`, token);
  return [trackToItem(track)];
}

async function resolveAlbum(id, token) {
  const items = [];
  let url = `/albums/${id}/tracks?limit=50`;
  while (url) {
    const page = await spotifyApi(url, token);
    for (const track of page.items) items.push(trackToItem(track));
    url = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return items;
}

async function resolvePlaylist(id, token) {
  const items = [];
  let url = `/playlists/${id}/tracks?limit=100`;
  while (url) {
    const page = await spotifyApi(url, token);
    for (const entry of page.items) {
      if (entry.track && entry.track.id) items.push(trackToItem(entry.track));
    }
    url = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return items;
}

async function resolveEpisode(id, token) {
  const episode = await spotifyApi(`/episodes/${id}`, token);
  return [
    {
      title: episode.name,
      artist: episode.show ? episode.show.name : '',
      searchQuery: episode.show ? `${episode.show.name} - ${episode.name}` : episode.name,
    },
  ];
}

async function resolveViaOEmbed(url, type) {
  if (type !== 'track' && type !== 'episode') {
    throw new Error(
      `Links of type "${type}" need SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET to be configured. ` +
        `Only single track/episode links work without credentials.`
    );
  }
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Could not fetch Spotify metadata (oEmbed error ${res.status}).`);
  const json = await res.json();
  const title = json.title || 'Unknown title';
  return [{ title, artist: '', searchQuery: title }];
}

async function resolveSpotifyLink(url) {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) throw new Error('That does not look like a valid Spotify link.');

  const token = await getAccessToken();
  if (!token) return { parsed, items: await resolveViaOEmbed(url, parsed.type) };

  let items;
  switch (parsed.type) {
    case 'track':
      items = await resolveTrack(parsed.id, token);
      break;
    case 'album':
      items = await resolveAlbum(parsed.id, token);
      break;
    case 'playlist':
      items = await resolvePlaylist(parsed.id, token);
      break;
    case 'episode':
      items = await resolveEpisode(parsed.id, token);
      break;
    default:
      throw new Error(`Unsupported Spotify link type: ${parsed.type}`);
  }
  return { parsed, items };
}

module.exports = { parseSpotifyUrl, resolveSpotifyLink };
