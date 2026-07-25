# Done (v2)

- [x] youtube api nutzen — YouTube Data API v3 für Suche/Video/Playlist (yt-dlp nur noch zum Streamen, Fallback ohne Key)
- [x] rechte beschränken — DJ-Tier (Playback) vs Admin-Tier (Konfiguration), via /role konfigurierbar
- [x] automatischer channel move bei anpassung — Follow-Modus: Join/Move/Rejoin automatisch, Queue bleibt beim Verlassen erhalten
- [x] channel que darstellen — /queue als Embed + Live-Dashboard-Channel (/queue-channel) mit Button-Controls
- [x] lokale sqlite für que — node:sqlite persistiert Queue + Config, Restore beim Start (Bound-Channel resumed automatisch)

# Done (v2.1 — Zusatz-Ideen)

- [x] Button-Control-Panel am Dashboard (⏸️/▶️ ⏭️ ⏹️ 🔀 🔁), DJ-gegated
- [x] Queue-Management: /remove /move /clear /shuffle /loop
- [x] Auto-Leave bei Leerlauf / allein im Channel (IDLE_TIMEOUT_MS)
- [x] Graceful Shutdown (SIGINT/SIGTERM): stoppt Playback, WAL-Checkpoint, Queue bleibt erhalten
- [x] yt-dlp-Cookies via YTDLP_COOKIES / YTDLP_COOKIES_FROM_BROWSER
- [x] CI + Lint/Tests (GitHub + Gitea, Dual-Registry-Standard) — .gitea/workflows/ci.yml + .github/workflows/ci.yml, push zu Gitea- bzw. GHCR-Registry

# Deferred (auf Wunsch)

- [ ] Track-Dauer & Gesamtlänge im Embed (braucht zusätzliche YouTube-API-Calls / Spotify-Dauer)
- [ ] Such-Auswahl-Menü statt automatisch Treffer 1
