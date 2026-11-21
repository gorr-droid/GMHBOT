import { bindFixtureChannels } from '../test-support/channels.mjs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ChannelType, Events, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { GUILD_ID, OWNER_ID, START_ID } from '../src/onboarding.mjs';
import { installTicketHandlers } from '../src/tickets.mjs';

bindFixtureChannels();

const BOT = '1000000000000000001';
const MEMBER = '1000000000000000002';
const OTHER = '1000000000000000003';
const LEGACY = '1000000000000000004';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'aurum-ticket-'));
  const client = Object.assign(new EventEmitter(), { user: { id: BOT } });
  const channels = new Map();
  const guild = { id: GUILD_ID, ownerId: OWNER_ID, available: true };
  let sequence = 111111111111111111n;
  const id = () => (++sequence).toString();
  const created = [];
  const capture = list => new Map(list.map(entry => [entry.id, {
    type: entry.type, allow: { bitfield: entry.allow }, deny: { bitfield: entry.deny },
  }]));
  function room(roomId, options = {}) {
    const messages = new Map();
    const channel = {
      id: roomId, type: ChannelType.GuildText, guildId: GUILD_ID, parentId: null, topic: options.topic,
      permissionOverwrites: {
        cache: capture(options.permissionOverwrites ?? []),
        async set(overwrites) { this.cache = capture(overwrites); },
      },
      messages: { async fetch(arg) {
        if (typeof arg !== 'string') return messages;
        if (messages.has(arg)) return messages.get(arg);
        throw Object.assign(new Error('Unknown message'), { code: 10008 });
      } },
      async send(payload) {
        const message = { id: id(), author: { id: BOT }, content: payload.content, components: payload.components.map(
          row => ({ components: row.components.map(b => ({ customId: b.custom_id })) }),
        ) };
        messages.set(message.id, message);
        return message;
      },
      sent: messages,
    };
    channels.set(roomId, channel);
    return channel;
  }
  const start = room(START_ID);
  const legacy = room(LEGACY);
  guild.channels = {
    async fetch(target) { return target ? channels.get(target) : channels; },
    async create(options) {
      created.push(options);
      return room(id(), options);
    },
  };
  let handler;
  function startHandlers() { handler = installTicketHandlers(client, { guild, dataDir: dir }); }
  startHandlers();
  t.after(async () => { await handler.close(); rmSync(dir, { recursive: true, force: true }); });

  async function setup(user = OWNER_ID) {
    const replies = [];
    const recognized = await handler.handleOwnerCommand('!setup-tickets', {
      guild, guildId: guild.id, author: { id: user },
      reply: async payload => replies.push(payload.content),
    });
    assert.equal(recognized, true);
    return replies;
  }

  async function press(customId, channel, message, user = MEMBER, guildId = GUILD_ID) {
    const i = {
      customId, channelId: channel.id, message, guild, guildId, user: { id: user }, isButton: () => true,
      deferReply: async ({ flags }) => { assert.equal(flags, MessageFlags.Ephemeral); i.deferred = true; },
      editReply: async text => { i.text = text; },
    };
    await Promise.all(client.listeners(Events.InteractionCreate).map(listener => listener(i)));
    return i;
  }
  const first = target => [...target.sent.values()][0];
  const ask = (topic = 'chart', user = MEMBER) => press('aurum-ticket-open:' + topic, start, first(start), user);
  return {
    dir, guild, channels, start, legacy, created, setup, press, ask, first,
    async restart() { await handler.close(); startHandlers(); },
    tickets() { return [...channels.values()].filter(c => c.topic?.startsWith('Aurum Desk private ticket ')); },
  };
}

test('owner setup is explicit and repeatable; an accepted request creates one private channel atomically', async t => {
  const f = fixture(t);
  assert.deepEqual(await f.setup(OTHER), []);
  assert.equal(f.start.sent.size, 0);
  await Promise.all([f.setup(), f.setup()]);
  assert.equal(f.start.sent.size, 1);
  assert.equal(f.created.length, 0);
  const requests = await Promise.all([f.ask(), f.ask('education')]);
  assert.equal(f.created.length, 1);
  const [channel] = f.tickets();
  assert.ok(requests.every(i => i.text.includes(channel.id)));
  const acl = channel.permissionOverwrites.cache;
  assert.equal(acl.get(GUILD_ID).deny.bitfield, P.ViewChannel);
  assert.deepEqual([...acl.keys()].sort(), [GUILD_ID, MEMBER, BOT, OWNER_ID].sort());
  assert.equal(f.created[0].parent, undefined);
  assert.equal(channel.sent.size, 1);
  assert.match(f.first(channel).content, /Chart review/);
  assert.equal(f.legacy.sent.size, 0);
});

test('button trust, close authorization, durable archive and a fresh ticket after closing', async t => {
  const f = fixture(t);
  await f.setup();
  const panel = f.first(f.start);
  const name = 'aurum-ticket-open:chart';
  assert.equal((await f.press(name, f.legacy, panel)).deferred, undefined);
  assert.equal((await f.press(name, f.start, { ...panel, id: '123' })).deferred, undefined);
  assert.equal((await f.press(name, f.start, { ...panel, author: { id: OTHER } })).deferred, undefined);
  assert.equal((await f.press(name, f.start, panel, MEMBER, '123')).deferred, undefined);
  assert.equal((await f.press('aurum-ticket-open:other', f.start, panel)).deferred, undefined);
  await f.ask();
  await f.restart();
  await f.setup();
  await f.ask('community');
  assert.equal(f.start.sent.size, 1);
  assert.equal(f.created.length, 1);
  const [channel] = f.tickets();
  const intro = f.first(channel);
  const close = intro.components[0].components[0].customId;
  assert.match((await f.press(close, channel, intro, OTHER)).text, /Only the requester/);
  assert.equal((await f.press(close, f.legacy, intro, OWNER_ID)).deferred, undefined);
  assert.equal((await f.press(close, channel, { ...intro, id: '999' }, OWNER_ID)).deferred, undefined);
  assert.equal(channel.permissionOverwrites.cache.has(MEMBER), true);
  await f.press(close, channel, intro, OWNER_ID);
  assert.equal(channel.permissionOverwrites.cache.has(MEMBER), false);
  assert.equal(channel.permissionOverwrites.cache.get(GUILD_ID).deny.bitfield, P.ViewChannel);
  assert.equal(f.channels.get(channel.id), channel);
  await f.ask('community');
  assert.equal(f.tickets().length, 2);
  assert.match(f.first(f.tickets()[1]).content, /Community \/ VIP access/);
  assert.equal((await f.press(close, channel, intro)).deferred, undefined);
});

test('recovers a created channel after a lost Discord response; never opens a duplicate', async t => {
  const f = fixture(t);
  await f.setup();
  const create = f.guild.channels.create;
  f.guild.channels.create = async opts => { await create(opts); throw new Error('Dropped connection'); };
  assert.match((await f.ask()).text, /could not be confirmed/);
  await f.restart();
  assert.match((await f.ask()).text, /Your ticket is ready/);
  assert.equal(f.created.length, 1);
  assert.equal(f.tickets()[0].sent.size, 1);
});

test('retries a confirmed permission rejection and refuses to post in a channel with unexpected access', async t => {
  const f = fixture(t);
  await f.setup();
  const create = f.guild.channels.create;
  f.guild.channels.create = async () => { throw Object.assign(new Error('Missing permission'), { status: 403 }); };
  assert.match((await f.ask()).text, /could not be confirmed/);
  f.guild.channels.create = async opts => {
    const channel = await create(opts);
    channel.permissionOverwrites.cache.set(OTHER, channel.permissionOverwrites.cache.get(BOT));
    return channel;
  };
  assert.match((await f.ask()).text, /could not be confirmed/);
  await f.restart();
  assert.match((await f.ask()).text, /could not be confirmed/);
  assert.equal(f.created.length, 1);
  assert.equal(f.tickets()[0].sent.size, 0);
});
