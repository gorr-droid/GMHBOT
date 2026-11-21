import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempDisposableSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { ActivityType, ChannelType, Client, Events } from 'discord.js';
import { AURUM_BOT_ID, startDiscord } from '../src/discord.mjs';
import { GUILD_ID, OWNER_ID } from '../src/onboarding.mjs';
import { installOwnerControls } from '../src/owner-controls.mjs';

test('the verified runtime sets the watching activity on initial connection and reidentification', async t => {
  const guild = { id: GUILD_ID, available: true, ownerId: OWNER_ID, channels: { fetch: async () => new Map() } };
  const directory = mkdtempDisposableSync(join(tmpdir(), 'aurum-profile-'));
  const activities = [];
  let botId = AURUM_BOT_ID;
  t.mock.method(Client.prototype, 'login', async function () {
    this.user = { id: botId, bot: true, setActivity: (...args) => activities.push(args) };
    this.guilds.fetch = async () => guild;
    this.emit(Events.ShardReady, 0);
    this.emit(Events.ClientReady, this);
  });
  let client;
  try {
    client = await startDiscord({ token: 'offline-test', dataDir: directory.path });
    client.emit(Events.ShardReady, 0);
    await setImmediate();
    const expected = ['XAUUSD • Aurum Desk', { type: ActivityType.Watching, shardId: 0 }];
    assert.deepEqual(activities, [expected, expected]);
    await client.destroy();
    botId = '992000000000000001';
    client = await startDiscord({ token: 'offline-test', dataDir: join(directory.path, 'other') });
    await setImmediate();
    assert.equal(activities.length, 2);
  } finally {
    await client?.destroy();
    directory.remove();
  }
});

test('the owner can fix the verified bot’s nickname without rewriting its global profile', async t => {
  const client = new EventEmitter();
  client.user = { id: AURUM_BOT_ID, bot: true, displayName: 'Aurum Desk' };
  const member = { id: AURUM_BOT_ID, user: client.user, displayName: 'NullCheck' };
  const edits = [], replies = [];
  const guild = { id: GUILD_ID, available: true, ownerId: OWNER_ID, members: {
    async fetchMe() { return member; },
    async editMe({ nick }) {
      edits.push(nick);
      member.displayName = nick ?? member.user.displayName;
      return member;
    },
  } };
  const controls = installOwnerControls(client, { guild });
  t.after(() => controls.close());
  async function command(authorId = OWNER_ID) {
    const msg = { content: '!fix-bot-nickname', channel: { type: ChannelType.DM },
      author: { id: authorId, send: async payload => replies.push(payload.content) } };
    await Promise.all(client.listeners(Events.MessageCreate).map(listener => listener(msg)));
  }
  await command('992000000000000002');
  assert.deepEqual(replies, []);
  await command();
  assert.deepEqual(edits, [null]);
  assert.match(replies.at(-1), /now shows/);
  await command();
  assert.deepEqual(edits, [null]);
  assert.match(replies.at(-1), /already shows/);
  member.displayName = member.user.displayName = 'NullCheck';
  await command();
  assert.deepEqual(edits, [null, 'Aurum Desk']);
  member.displayName = 'Legacy';
  client.user = { id: '992000000000000003', bot: true };
  await command();
  assert.equal(edits.length, 2);
  assert.match(replies.at(-1), /identity could not be verified/);
});
