// Invite codes the way the app makes them (src/app/interfaces/invite.ts): no 0/O, 1/I/l, since
// codes get read aloud and typed on tablets.
const crypto = require('crypto');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function newCode(length = 12) {
  return Array.from(crypto.randomBytes(length), b => ALPHABET[b % ALPHABET.length]).join('');
}

module.exports = { newCode };
