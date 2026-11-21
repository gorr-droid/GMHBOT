import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const GUILD_ID = '1040987039270707231';
export const OWNER_ID = '659477576422785025';
// Resolve the six approved room identities from Discord without publishing their IDs.
export const channelPins = Object.freeze({
  'start-here': '1349357dfe55b598ff8e7e374a7278fce7f1dea5ea1ba5b4cbb0993a21d0ef2c',
  'gold-market-plan': '29e04482ce892d14602b3060f0d504556b1711df43d09588de6f700dc2230b49',
  'news-calendar': 'b7bc515e2905a180f3731db293fb04072a945aca6d914cd51eade5da570ab398',
  'learn-gold': '0bc82661196ae9072ffd5363b6cbc442c0a3c6bf2a9cd3c91f4c784c39e02f9f',
  'trading-chat': '4006d07b9912779a55ce4b5d09e0a5605cf4dda972d238940c5ce0da2c7436c6',
  'trade-reviews': '7197449baadecbb90d92933c6f931cf1c0660c99642fc863deafd47e95ef564a',
});
const resolvedChannels = new Map();
export let START_ID;
export const TRADING_CHANNELS = new Set();

export function bindTradingChannels(guild, channels, pins = channelPins) {
  assertServer(guild);
  const available = new Map();
  for (const channel of channels.values()) {
    if (channel?.guildId !== guild.id || !snowflake(channel.id) || channel.type !== 0) continue;
    const digest = createHash('sha256').update(channel.id).digest('hex');
    available.set(digest, channel.id);
  }
  resolvedChannels.clear();
  TRADING_CHANNELS.clear();
  for (const [key, digest] of Object.entries(pins)) {
    const id = available.get(digest);
    if (id) {
      resolvedChannels.set(key, id);
      TRADING_CHANNELS.add(id);
    }
  }
  START_ID = resolvedChannels.get('start-here');
}

export function channelId(key) {
  const id = resolvedChannels.get(key);
  if (!id) throw new Error('The approved Discord channel is unavailable: ' + key);
  return id;
}

export function assertServer(guild) {
  if (guild?.id !== GUILD_ID || guild.ownerId !== OWNER_ID || !guild.available) {
    throw new Error('Aurum Desk server and ownership could not be verified.');
  }
}

export function snowflake(value) {
  return typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value);
}

export function openOnboardingState(dataDir, applicationId) {
  if (!dataDir || !snowflake(applicationId)) throw new Error('Bot identity and data directory required.');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // Holding a separate SQLite write transaction excludes another local worker.
  // The operating system releases its lock on process exit, including a crash.
  const lock = new DatabaseSync(join(dataDir, 'onboarding-worker.sqlite'));
  let db;
  try {
    lock.exec('BEGIN EXCLUSIVE');
    db = new DatabaseSync(join(dataDir, 'onboarding.sqlite'));
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries (
        user_id TEXT NOT NULL, joined INTEGER NOT NULL, recipient TEXT NOT NULL,
        outcome TEXT NOT NULL, PRIMARY KEY(user_id, joined, recipient)
      );
    `);
    db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('app', applicationId);
    if (db.prepare("SELECT value FROM metadata WHERE key='app'").get().value !== applicationId) {
      throw new Error('Onboarding data belongs to a different Discord application.');
    }
  } catch (error) {
    db?.close();
    lock.close();
    throw error;
  }
  const metadata = db.prepare('SELECT value FROM metadata WHERE key=?');
  const set = db.prepare('INSERT OR REPLACE INTO metadata VALUES (?, ?)');
  const reserve = db.prepare('INSERT OR IGNORE INTO deliveries VALUES (?, ?, ?, ?)');
  const finish = db.prepare('UPDATE deliveries SET outcome=? WHERE user_id=? AND joined=? AND recipient=?');
  return {
    reserve(user, joined, recipient) {
      return reserve.run(user, joined, recipient, 'unconfirmed').changes === 1;
    },
    finish(user, joined, recipient, outcome) {
      finish.run(outcome, user, joined, recipient);
    },
    sawJoin(user, joined) {
      return Boolean(db.prepare('SELECT 1 FROM deliveries WHERE user_id=? AND joined=? LIMIT 1').get(user, joined));
    },
    counts() {
      return db.prepare('SELECT recipient, outcome, COUNT(*) AS count FROM deliveries GROUP BY recipient, outcome').all();
    },
    setting(key, fallback) { return metadata.get('setting:' + key)?.value ?? fallback; },
    setSetting(key, value) { set.run('setting:' + key, value); },
    panel() { return metadata.get('panel')?.value; },
    setPanel(value) { set.run('panel', value); },
    close() {
      try { db.close(); } finally { lock.close(); }
    },
  };
}

// Persist BEFORE sending: a connection drop can occur after a DM was delivered.
// Unconfirmed attempts stay visible in diagnostics and are never replayed on join.
async function deliver(state, member, recipient, send) {
  if (!state.reserve(member.id, member.joinedTimestamp, recipient)) return;
  let outcome;
  try {
    await send();
    outcome = 'delivered';
  } catch (error) {
    outcome = Number(error?.code) === 50007 ? 'dm-blocked' : 'unconfirmed';
  }
  state.finish(member.id, member.joinedTimestamp, recipient, outcome);
}

export async function observeJoin(state, member, { welcome, notifyOwner }) {
  if (member.guild.id !== GUILD_ID || member.user.bot) return;
  assertServer(member.guild);
  if (!snowflake(member.id) || !Number.isSafeInteger(member.joinedTimestamp) || member.joinedTimestamp <= 0) {
    throw new Error('Discord did not supply a stable membership identity.');
  }
  await Promise.all([
    welcome ? deliver(state, member, 'member', welcome) : undefined,
    deliver(state, member, 'owner', notifyOwner),
  ]);
}

export function rulesClickAllowed({ state, channelId, messageId, messageAuthorId, applicationId }) {
  return snowflake(START_ID) && channelId === START_ID && snowflake(messageId) && messageId === state.panel()
    && messageAuthorId === applicationId;
}

export function assertEligibleMember(member, roleId, state) {
  assertServer(member.guild);
  if (member.user.bot || member.id === OWNER_ID || member.pending !== false) {
    throw new Error('Complete the server membership screening and try again.');
  }
  if (!snowflake(roleId) || !state.sawJoin(member.id, member.joinedTimestamp ?? 0)) {
    throw new Error('Automatic membership is available to new arrivals recorded by Aurum Desk.');
  }
}
