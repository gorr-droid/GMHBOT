import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { GUILD_ID, OWNER_ID, assertServer, channelId, snowflake } from './onboarding.mjs';
import { discordArticle, discordArticlePreview, formatExcerpt, readSiteFeed,
  sampleArticle, siteOrigin, telegramArticle, verifyPublicArticle } from './site-posts.mjs';

const telegramChannel = '@AurumDeskk';
const fiveMinutes = 5 * 60 * 1000;
const freshness = 48 * 60 * 60 * 1000;
export const PUBLISH_TARGETS = Object.freeze({
  'discord-news': { label: 'Discord · #news-calendar', kind: 'news', get channelId() { return channelId('news-calendar'); } },
  'discord-plan': { label: 'Discord · #gold-market-plan', kind: 'plan', get channelId() { return channelId('gold-market-plan'); } },
  'telegram-news': { label: 'Telegram · @AurumDeskk · news', kind: 'news' },
  'telegram-plan': { label: 'Telegram · @AurumDeskk · plans', kind: 'plan' }
});

function requireOwner(id) {
  if (id !== OWNER_ID) throw new Error('Only the Aurum Desk server owner can manage publishing.');
}

function requireTarget(key) {
  if (!Object.hasOwn(PUBLISH_TARGETS, key)) throw new Error('Unknown Aurum Desk destination.');
  return PUBLISH_TARGETS[key];
}


async function destination(options, target, boundId) {
  if (target.channelId) {
    const client = options.getClient?.() ?? options.client;
    if (client?.user?.id !== options.applicationId) throw new Error('The configured Discord bot is unavailable.');
    const guild = await client.guilds.fetch({ guild: GUILD_ID, force: true });
    assertServer(guild);
    const channel = await guild.channels.fetch(target.channelId, { force: true });
    const me = await guild.members.fetchMe();
    if (channel?.id !== target.channelId || channel.guildId !== GUILD_ID || channel.type !== ChannelType.GuildText
      || !channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) {
      throw new Error('Verify the configured Discord room and the bot’s channel permissions.');
    }
    return { id: target.channelId, send: async (article, nonce) => {
      const message = await channel.send({ ...discordArticle(article),
        nonce, enforceNonce: true });
      if (message?.channelId !== target.channelId || !snowflake(message.id)) {
        throw new Error('Discord delivery unconfirmed.');
      }
    } };
  }
  if (!options.telegramToken) throw new Error('Set the dedicated Telegram bot token before enabling this destination.');
  const call = async (method, body) => {
    // The Telegram Bot API requires the token in the path. Never propagate transport error details.
    try {
      const result = await options.fetchImpl(`https://api.telegram.org/bot${options.telegramToken}/${method}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!result.ok) throw new Error();
      const data = await result.json();
      if (data?.ok !== true || !data.result) throw new Error();
      return data.result;
    } catch { throw new Error('Telegram could not confirm the request. Check bot channel permissions.'); }
  };
  const chat = await call('getChat', { chat_id: telegramChannel });
  const id = String(chat.id);
  if (chat.type !== 'channel' || chat.username?.toLowerCase() !== telegramChannel.slice(1).toLowerCase()
    || !/^-100\d+$/.test(id) || !Number.isSafeInteger(chat.id) || (boundId && boundId !== id)) {
    throw new Error('The Telegram destination could not be verified.');
  }
  const bot = await call('getMe', {});
  if (!bot.is_bot || !Number.isSafeInteger(bot.id)) throw new Error('Telegram bot identity unavailable.');
  const membership = await call('getChatMember', { chat_id: id, user_id: bot.id });
  if (membership.user?.id !== bot.id || membership.status !== 'administrator' || membership.can_post_messages !== true) {
    throw new Error('The Telegram bot needs permission to post in @AurumDeskk.');
  }
  return { id, send: async article => {
    const message = await call('sendMessage', { chat_id: id, ...telegramArticle(article) });
    if (String(message.chat?.id) !== id || !Number.isSafeInteger(message.message_id)) {
      throw new Error('Telegram delivery unconfirmed.');
    }
  } };
}

export function createPublisher(input) {
  if (!input.dataDir || !snowflake(input.applicationId)) throw new Error('Publisher data directory and application ID required.');
  const options = { fetchImpl: fetch, now: Date.now, ...input };
  const origin = siteOrigin(options.siteOrigin);
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(options.dataDir, 'publisher.sqlite'));
  try {
    db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS identity (id INTEGER PRIMARY KEY, application TEXT, origin TEXT);
      CREATE TABLE IF NOT EXISTS targets (name TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0,
        since INTEGER DEFAULT 0, generation INTEGER DEFAULT 0, approval TEXT, expires INTEGER DEFAULT 0,
        bound TEXT, health TEXT DEFAULT 'paused');
      CREATE TABLE IF NOT EXISTS deliveries (target TEXT, post TEXT, outcome TEXT, PRIMARY KEY(target, post));
    `);
    db.prepare('INSERT OR IGNORE INTO identity VALUES(1, ?, ?)').run(options.applicationId, origin);
    const identity = db.prepare('SELECT * FROM identity WHERE id=1').get();
    if (identity.application !== options.applicationId || identity.origin !== origin) {
      throw new Error('Publisher records belong to a different application or website.');
    }
    // Material presentation changes need a fresh owner preview. Keep history and bound identities.
    db.exec('BEGIN IMMEDIATE');
    try {
      const { user_version: version } = db.prepare('PRAGMA user_version').get();
      if (version > 1) throw new Error('This publisher state requires a newer bot.');
      if (version === 0) {
        db.exec(`UPDATE targets SET enabled=0, generation=generation+1, approval=NULL,
          expires=0, health='paused'; PRAGMA user_version=1;`);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const add = db.prepare('INSERT OR IGNORE INTO targets(name) VALUES (?)');
    for (const key of Object.keys(PUBLISH_TARGETS)) add.run(key);
  } catch (error) {
    db.close();
    throw error;
  }
  const targetRow = db.prepare('SELECT * FROM targets WHERE name=?');
  const mark = db.prepare('INSERT OR IGNORE INTO deliveries VALUES (?, ?, ?)');
  const seen = db.prepare('SELECT 1 FROM deliveries WHERE target=? AND post=?');
  const health = db.prepare('UPDATE targets SET health=? WHERE name=? AND enabled=1 AND generation=?');
  const feed = () => readSiteFeed(options.fetchImpl, origin);
  let closed = false, timer, busy;
  function open() { if (closed) throw new Error('Publisher has stopped.'); }

  async function preview(owner, key) {
    open(); requireOwner(owner);
    const target = requireTarget(key);
    let article;
    try {
      const posts = await feed();
      const latest = posts.findLast(post => post.kind === target.kind && post.published <= options.now());
      if (latest) article = await verifyPublicArticle(options.fetchImpl, latest);
    } catch { /* The owner can inspect the format while the public site is unavailable. */ }
    open();
    const approvalId = randomBytes(10).toString('hex');
    db.prepare('UPDATE targets SET approval=?, expires=? WHERE name=?')
      .run(approvalId, options.now() + 15 * 60000, key);
    const post = article ?? sampleArticle(target.kind);
    const heading = 'Private preview · ' + target.label + (post.historical ? ' · Historical example' : '');
    const platform = key.startsWith('discord-') ? 'discord' : 'telegram';
    return { text: heading + '\n\n' + formatExcerpt(post),
      message: { content: heading, ...discordArticlePreview(post, platform) }, approvalId };
  }

  async function enable(owner, key, approvalId) {
    open(); requireOwner(owner);
    const target = requireTarget(key);
    function approved() {
      open();
      const row = targetRow.get(key);
      if (row.enabled) throw new Error('This destination is already enabled.');
      if (!approvalId || row.approval !== approvalId || row.expires <= options.now()) {
        throw new Error('Open a fresh preview for this destination first.');
      }
      return row;
    }
    const row = approved();
    const telegramBinding = () => db.prepare("SELECT bound FROM targets WHERE name LIKE 'telegram-%' AND bound IS NOT NULL LIMIT 1").get()?.bound;
    const posts = await feed().catch(() => { throw new Error('Publishing stays paused until the public website feed is available.'); });
    open();
    const delivery = await destination(options, target, target.channelId ? row.bound : telegramBinding());
    open();
    db.exec('BEGIN IMMEDIATE');
    try {
      approved();
      if (!target.channelId && telegramBinding() && telegramBinding() !== delivery.id) {
        throw new Error('The configured Telegram channel identity has changed.');
      }
      for (const post of posts.filter(post => post.kind === target.kind)) mark.run(key, post.id, 'baseline');
      db.prepare(`UPDATE targets SET enabled=1, since=?, generation=generation+1, approval=NULL,
        expires=0, bound=?, health='waiting for a new article' WHERE name=?`).run(options.now(), delivery.id, key);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return `Automatic sharing enabled for ${target.label}. Only newly published articles qualify.`;
  }

  function pause(owner, key = 'all') {
    open(); requireOwner(owner);
    if (key !== 'all') requireTarget(key);
    db.prepare(`UPDATE targets SET enabled=0, generation=generation+1, approval=NULL,
      expires=0, health='paused' WHERE (?='all' OR name=?)`).run(key, key);
    return key === 'all' ? 'All automatic publishing is paused.' : `Paused ${PUBLISH_TARGETS[key].label}.`;
  }

  function status(owner) {
    open(); requireOwner(owner);
    return db.prepare(`SELECT t.*, (SELECT count(*) FROM deliveries d WHERE d.target=t.name
      AND d.outcome='unconfirmed') AS uncertain FROM targets t ORDER BY t.name`).all()
      .map(row => `${PUBLISH_TARGETS[row.name].label} · ${row.enabled ? 'on' : 'off'} · ${row.health}`
        + (row.uncertain ? ` · ${row.uncertain} unconfirmed (check the channel)` : '')).join('\n');
  }

  async function run() {
    const subscriptions = db.prepare('SELECT * FROM targets WHERE enabled=1').all();
    if (!subscriptions.length) return;
    let posts;
    try { posts = await feed(); } catch {
      for (const row of subscriptions) health.run('public website feed unavailable', row.name, row.generation);
      return;
    }
    const verified = new Map();
    for (const row of subscriptions) {
      const key = row.name, target = PUBLISH_TARGETS[key];
      health.run('watching the public website', key, row.generation);
      for (const post of posts) {
        if (closed) return;
        const now = options.now();
        if (post.kind !== target.kind || post.published <= row.since || post.published > now
          || now - post.published > freshness || seen.get(key, post.id)) continue;
        if (!verified.has(post.id)) {
          verified.set(post.id, await verifyPublicArticle(options.fetchImpl, post).catch(() => null));
        }
        if (!verified.get(post.id)) {
          health.run('waiting for verified public article', key, row.generation);
          continue;
        }
        let delivery;
        try { delivery = await destination(options, target, row.bound); }
        catch { health.run('destination unavailable; awaiting next check', key, row.generation); continue; }
        if (closed) return;
        // Reserve in the same SQL statement that checks the owner's current opt-in.
        // Any crash/timeout after this point leaves an unreplayed unconfirmed attempt.
        const claimed = db.prepare(`INSERT OR IGNORE INTO deliveries
          SELECT name, ?, 'unconfirmed' FROM targets WHERE name=? AND enabled=1 AND generation=? AND bound=?`)
          .run(post.id, key, row.generation, delivery.id).changes;
        if (!claimed) continue;
        const nonce = createHash('sha256').update(key + post.id).digest('hex').slice(0, 24);
        try {
          await delivery.send(verified.get(post.id), nonce);
          db.prepare("UPDATE deliveries SET outcome='sent' WHERE target=? AND post=?").run(key, post.id);
          health.run('latest article sent', key, row.generation);
        } catch { health.run('delivery unconfirmed; inspect the destination', key, row.generation); }
      }
    }
  }
  function tick() {
    open();
    if (!busy) busy = run().finally(() => { busy = undefined; });
    return busy;
  }
  function start() {
    open();
    if (timer) return;
    const poll = () => tick().catch(() => console.error('Aurum Desk publisher check failed.'));
    timer = setInterval(poll, fiveMinutes);
    timer.unref();
    poll();
  }
  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try { await busy; } finally { db.close(); }
  }
  return { preview, enable, pause, status, tick, start, close };
}
