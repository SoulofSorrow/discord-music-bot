const { EventEmitter } = require('events');

// Lightweight in-process bus so the player can signal queue changes without
// holding a reference to the Discord client. index.js subscribes and refreshes
// the queue dashboard; emitted payload is the guildId.
//   bus.emit('queueUpdate', guildId)
const bus = new EventEmitter();
bus.setMaxListeners(0);

module.exports = bus;
