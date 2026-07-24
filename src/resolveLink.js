const { isYoutubeUrl, resolveYoutube, searchYoutube } = require('./youtube');
const { parseSpotifyUrl, resolveSpotifyLink } = require('./spotify');

// Shared by the /play command and the web dashboard's "add track" endpoint:
// dispatches a YouTube link, Spotify link, or free-text search term to the
// right resolver and returns { parsed, items }.
async function resolveLinkOrSearch(link) {
  if (isYoutubeUrl(link)) return resolveYoutube(link);
  if (parseSpotifyUrl(link)) return resolveSpotifyLink(link);

  const video = await searchYoutube(link);
  return { parsed: { type: 'search' }, items: [{ title: video.title, artist: '', url: video.url }] };
}

module.exports = { resolveLinkOrSearch };
