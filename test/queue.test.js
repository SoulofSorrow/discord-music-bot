const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the SQLite database in a temp dir BEFORE requiring any module that
// opens the DB (db.js reads DATA_DIR at load time).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dmb-test-'));

const config = require('../src/config');
const { getGuildConfig } = config;
const { getGuildPlayer } = require('../src/player');
const { buildQueueEmbed } = require('../src/queueEmbed');
const db = require('../src/db');

test('config: defaults for an unknown guild', () => {
  const cfg = getGuildConfig('g-unknown');
  assert.equal(cfg.volume, 100);
  assert.equal(cfg.mode, null);
  assert.deepEqual(cfg.djRoleIds, []);
  assert.deepEqual(cfg.adminRoleIds, []);
});

test('config: writes round-trip through SQLite', () => {
  config.setBoundChannel('g1', 'chan-1');
  config.addRole('g1', 'dj', 'role-dj');
  config.addRole('g1', 'admin', 'role-admin');
  config.setQueueChannel('g1', 'text-1');
  config.setVolume('g1', 55);

  const cfg = getGuildConfig('g1');
  assert.equal(cfg.mode, 'channel');
  assert.equal(cfg.channelId, 'chan-1');
  assert.deepEqual(cfg.djRoleIds, ['role-dj']);
  assert.deepEqual(cfg.adminRoleIds, ['role-admin']);
  assert.equal(cfg.queueChannelId, 'text-1');
  assert.equal(cfg.volume, 55);
});

test('config: removeRole and clearQueueChannel', () => {
  config.addRole('g2', 'dj', 'r1');
  config.removeRole('g2', 'dj', 'r1');
  config.setQueueChannel('g2', 't');
  config.clearQueueChannel('g2');
  const cfg = getGuildConfig('g2');
  assert.deepEqual(cfg.djRoleIds, []);
  assert.equal(cfg.queueChannelId, null);
});

test('player: enqueue assigns db ids and persists', () => {
  const gp = getGuildPlayer('gp1');
  gp.enqueue([{ title: 'A', url: 'u-a' }, { title: 'B', searchQuery: 'b' }], 'user-1');
  assert.equal(gp.queue.length, 2);
  assert.ok(gp.queue[0].id != null && gp.queue[1].id != null);
  assert.equal(gp.queue[0].requestedBy, 'user-1');
});

test('player: move / shuffle / removeAt / clearUpcoming', () => {
  const gp = getGuildPlayer('gp2');
  gp.enqueue([{ title: '1', url: 'u1' }, { title: '2', url: 'u2' }, { title: '3', url: 'u3' }], 'u');
  gp.move(0, 2);
  assert.equal(gp.queue[2].title, '1');

  const before = gp.queue.length;
  gp.shuffle();
  assert.equal(gp.queue.length, before);

  const removed = gp.removeAt(0);
  assert.ok(removed);
  assert.equal(gp.queue.length, before - 1);

  const cleared = gp.clearUpcoming();
  assert.equal(cleared, before - 1);
  assert.equal(gp.queue.length, 0);
});

test('player: loop modes cycle off -> track -> queue -> off', () => {
  const gp = getGuildPlayer('gp3');
  assert.equal(gp.loopMode, 'off');
  assert.equal(gp.cycleLoop(), 'track');
  assert.equal(gp.cycleLoop(), 'queue');
  assert.equal(gp.cycleLoop(), 'off');
  assert.equal(gp.setLoop('bogus'), 'off'); // invalid mode ignored
});

test('player: restoreFromDb rehydrates the queue', () => {
  const gp = getGuildPlayer('gp4');
  gp.enqueue([{ title: 'Persisted', url: 'u-9' }], 'user-9');
  const count = gp.restoreFromDb();
  assert.equal(count, 1);
  assert.equal(gp.queue[0].title, 'Persisted');
});

test('queueEmbed: idle and populated states build valid embeds', () => {
  const idle = buildQueueEmbed(null).toJSON();
  assert.ok(idle.title);
  assert.match(idle.description, /Nothing playing/);

  const gp = getGuildPlayer('gp5');
  gp.enqueue([{ title: 'X', url: 'u-x' }], 'u');
  const populated = buildQueueEmbed(gp).toJSON();
  assert.ok(populated.title);
  assert.ok(populated.fields.length >= 1);
});

test.after(() => {
  db.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});
