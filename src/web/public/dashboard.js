const app = document.getElementById('app');

function guildIdFromPath() {
  const match = window.location.pathname.match(/^\/dashboard\/([^/]+)$/);
  return match ? match[1] : null;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue; // omit the attribute entirely (e.g. conditional disabled/class)
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) node.appendChild(child);
  return node;
}

function trackLine(item) {
  if (!item) return '';
  const artist = item.artist ? ` — ${item.artist}` : '';
  return `${item.title}${artist}`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const DISCORD_ICON =
  '<svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="currentColor"><path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/></svg>';

function renderLogin() {
  app.replaceChildren(
    el('div', { class: 'card login-card' }, [
      el('div', { class: 'icon', text: '🎶' }),
      el('h2', { text: 'Music Bot Dashboard' }),
      el('p', { class: 'muted', text: 'Log in with Discord to control servers where you are an admin.' }),
      Object.assign(el('a', { href: '/auth/discord/login', class: 'login-btn' }), {
        innerHTML: `${DISCORD_ICON}<span>Login with Discord</span>`,
      }),
    ])
  );
}

function renderPicker(session) {
  const list = el('ul', { class: 'guild-list' });
  if (session.guilds.length === 0) {
    list.appendChild(el('p', { class: 'empty-state', text: 'No servers found where you are an admin.' }));
  }
  for (const guild of session.guilds) {
    list.appendChild(
      el('li', {}, [
        el('a', { href: `/dashboard/${guild.id}` }, [
          el('span', { class: 'avatar', text: guild.name.slice(0, 1).toUpperCase() }),
          el('span', { text: guild.name }),
        ]),
      ])
    );
  }

  app.replaceChildren(
    el('div', { class: 'header' }, [
      el('span', { class: 'title' }, [el('span', { class: 'icon', text: '🎶' }), document.createTextNode(session.user.username)]),
      el('nav', {}, [el('a', { href: '/auth/logout', text: 'Log out' })]),
    ]),
    el('div', { class: 'card' }, [el('h3', { text: 'Your servers' }), list])
  );
}

function renderDashboard(guildId, session) {
  const csrfToken = session.csrfToken;
  const guild = session.guilds.find((g) => g.id === guildId);

  const nowPlaying = el('div', { class: 'card' });
  const controls = el('div', { class: 'controls' });
  const volumeRow = el('div', { class: 'volume-row' });
  const playForm = el('form', { class: 'play-form' });
  const queueCard = el('div', { class: 'card' });
  const errorBox = el('p', { class: 'error' });

  const linkInput = el('input', { type: 'text', placeholder: 'YouTube/Spotify link or search term', required: '' });
  playForm.appendChild(linkInput);
  playForm.appendChild(el('button', { class: 'primary', type: 'submit', text: 'Add' }));

  const volumeSlider = el('input', { type: 'range', min: '0', max: '200' });
  const volumeLabel = el('span', { class: 'value', text: '100%' });
  volumeRow.appendChild(el('span', { class: 'icon', text: '🔊' }));
  volumeRow.appendChild(volumeSlider);
  volumeRow.appendChild(volumeLabel);

  let volumeDebounce;
  volumeSlider.addEventListener('input', () => {
    volumeLabel.textContent = `${volumeSlider.value}%`;
    clearTimeout(volumeDebounce);
    volumeDebounce = setTimeout(() => sendControl('volume', { value: Number(volumeSlider.value) }), 300);
  });

  async function sendControl(action, extra = {}) {
    try {
      const status = await api(`/api/guilds/${guildId}/control`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ action, ...extra }),
      });
      renderStatus(status);
    } catch (err) {
      showError(err.message);
    }
  }

  function showError(message) {
    errorBox.textContent = message;
  }

  playForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const link = linkInput.value.trim();
    if (!link) return;
    try {
      const status = await api(`/api/guilds/${guildId}/play`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ link }),
      });
      linkInput.value = '';
      renderStatus(status);
    } catch (err) {
      showError(err.message);
    }
  });

  async function removeTrack(index) {
    try {
      renderStatus(
        await api(`/api/guilds/${guildId}/queue/remove`, {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ index }),
        })
      );
    } catch (err) {
      showError(err.message);
    }
  }

  async function moveTrack(from, to) {
    try {
      renderStatus(
        await api(`/api/guilds/${guildId}/queue/move`, {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ from, to }),
        })
      );
    } catch (err) {
      showError(err.message);
    }
  }

  const LOOP_LABEL = { off: 'Loop: off', track: 'Loop: track', queue: 'Loop: queue' };

  function renderStatus(status) {
    const idle = !status.current && status.queue.length === 0;

    nowPlaying.replaceChildren(
      el('h3', { text: 'Now playing' }),
      el('p', {
        class: status.current ? 'now-playing-title' : 'muted',
        text: status.current ? trackLine(status.current) : 'Nothing playing right now.',
      }),
      el('span', { class: `pill${status.current && !status.paused ? ' live' : ''}` }, [
        el('span', { class: 'dot' }),
        document.createTextNode(status.current ? (status.paused ? 'Paused' : 'Playing') : 'Idle'),
      ])
    );

    controls.replaceChildren(
      el('button', { disabled: idle ? '' : null, onclick: () => sendControl('playpause'), text: status.paused ? '▶️ Resume' : '⏸️ Pause' }),
      el('button', { disabled: idle ? '' : null, onclick: () => sendControl('skip'), text: '⏭️ Skip' }),
      el('button', { class: 'danger', disabled: idle ? '' : null, onclick: () => sendControl('stop'), text: '⏹️ Stop' }),
      el('button', { disabled: status.queue.length < 2 ? '' : null, onclick: () => sendControl('shuffle'), text: '🔀 Shuffle' }),
      el('button', {
        class: status.loopMode !== 'off' ? 'active' : null,
        onclick: () => sendControl('loop'),
        text: LOOP_LABEL[status.loopMode],
      })
    );

    volumeSlider.value = status.volume;
    volumeLabel.textContent = `${status.volume}%`;

    const items = [];
    status.queue.forEach((item, index) => {
      items.push(
        el('div', { class: 'queue-item' }, [
          el('span', { class: 'idx', text: String(index + 1) }),
          el('span', { class: 'meta', text: trackLine(item) }),
          el('span', { class: 'actions' }, [
            el('button', { disabled: index === 0 ? '' : null, onclick: () => moveTrack(index, index - 1), text: '↑' }),
            el('button', {
              disabled: index === status.queue.length - 1 ? '' : null,
              onclick: () => moveTrack(index, index + 1),
              text: '↓',
            }),
            el('button', { class: 'danger', onclick: () => removeTrack(index), text: '✕' }),
          ]),
        ])
      );
    });

    queueCard.replaceChildren(
      el('h3', { text: `Queue (${status.queue.length})` }),
      items.length ? el('div', { class: 'queue-list' }, items) : el('p', { class: 'empty-state', text: 'Nothing queued.' })
    );
  }

  app.replaceChildren(
    el('div', { class: 'header' }, [
      el('span', { class: 'title' }, [
        el('span', { class: 'icon', text: '🎶' }),
        document.createTextNode(guild ? guild.name : 'Dashboard'),
      ]),
      el('nav', {}, [el('a', { href: '/', text: '← Servers' }), el('a', { href: '/auth/logout', text: 'Log out' })]),
    ]),
    nowPlaying,
    el('div', { class: 'card' }, [el('h3', { text: 'Controls' }), controls, volumeRow]),
    el('div', { class: 'card' }, [el('h3', { text: 'Add track' }), playForm, errorBox]),
    queueCard
  );

  const refresh = () =>
    api(`/api/guilds/${guildId}/status`)
      .then(renderStatus)
      .catch((err) => showError(err.message));
  refresh();
  setInterval(refresh, 4000);
}

async function main() {
  let session;
  try {
    session = await api('/api/session');
  } catch (err) {
    app.textContent = `Failed to load: ${err.message}`;
    return;
  }

  if (!session.loggedIn) return renderLogin();

  const guildId = guildIdFromPath();
  if (!guildId) return renderPicker(session);

  if (!session.guilds.some((g) => g.id === guildId)) {
    app.replaceChildren(
      el('p', { class: 'error', text: 'You are not an admin on that server (or the bot is not in it).' }),
      el('a', { href: '/', text: '← Back to your servers' })
    );
    return;
  }

  renderDashboard(guildId, session);
}

main();
