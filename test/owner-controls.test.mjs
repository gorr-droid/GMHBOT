import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ChannelType, Events } from 'discord.js';
import { installOwnerControls } from '../src/owner-controls.mjs';
import { GUILD_ID, OWNER_ID } from '../src/onboarding.mjs';

function setup(t) {
  const guild = { id: GUILD_ID, available: true, ownerId: OWNER_ID };
  const client = new EventEmitter();
  client.user = { id: '118888888888888888' };
  const calls = [], privateReplies = [], publicReplies = [], settings = new Map();
  const state = { setting: (key, fallback) => settings.get(key) ?? fallback, setSetting: (k, v) => settings.set(k, v) };
  const tickets = { async handleOwnerCommand(command, msg) {
    calls.push([command, msg.guildId, msg.author.id]);
    await msg.reply({ content: 'Panel installed' });
  } };
  const publisher = {
    preview: async (owner, target) => {
      calls.push(['preview', owner, target]);
      return { message: { content: 'Private preview', embeds: [{ title: 'Gold market brief' }],
        components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Read analysis', url: 'https://gmh-shop.com/aurum' }] }] },
        approvalId: '0123456789abcdef0123' };
    },
    enable: async (...args) => { calls.push(['enable', ...args]); return 'Enabled'; },
    status: () => 'paused', pause: () => 'Paused'
  };
  const installRules = async owner => { calls.push(['install-rules', owner]); return { created: true }; };
  const ctl = installOwnerControls(client, { guild, state, tickets, publisher, installRules });
  t.after(() => ctl.close());
  async function fire(event, payload) {
    await Promise.all(client.listeners(event).map(listener => listener(payload)));
  }
  const author = { id: OWNER_ID, bot: false, send: async payload => privateReplies.push(payload) };
  async function message(content, extra = {}) {
    await fire(Events.MessageCreate, { content, guildId: GUILD_ID, guild, author,
      reply: async payload => publicReplies.push(payload), ...extra });
  }
  async function press(customId, extra = {}) {
    const event = { customId, user: author, channel: { type: ChannelType.DM }, guildId: null,
      message: { author: client.user }, isButton: () => true, isModalSubmit: () => false,
      deferReply: async () => { event.deferred = true; }, editReply: async payload => privateReplies.push(payload),
      showModal: async modal => { event.modal = modal; }, ...extra };
    await fire(Events.InteractionCreate, event);
    return event;
  }
  return { client, guild, author, calls, privateReplies, publicReplies, settings, message, press };
}

test('legacy ticket alias and regular spelling use the same verified guild from server or owner DM', async t => {
  const h = setup(t);
  await h.message('!spawn-tickets');
  await h.message('!setup-tickets', { guildId: null, guild: null, channel: { type: ChannelType.DM } });
  assert.deepEqual(h.calls, [['setup-tickets', GUILD_ID, OWNER_ID], ['setup-tickets', GUILD_ID, OWNER_ID]]);
  assert.equal(h.privateReplies.length, 2);
  assert.equal(h.publicReplies.length, 0);
});

test('a stranger, different guild, webhook, and group DM get no action or response', async t => {
  const h = setup(t);
  await h.message('!activate', { author: { ...h.author, id: '123456789000000001' } });
  await h.message('!send-verify', { author: { ...h.author, id: '123456789000000001' } });
  await h.message('!setup-tickets', { guildId: '123456789000000002' });
  await h.message('!ping', { webhookId: '123456789000000003' });
  await h.message('!ping', { guild: null, guildId: null, channel: { type: ChannelType.GroupDM } });
  await h.press('aurum-private:welcome-on', { user: { id: '123456789000000001' } });
  await h.press('aurum-private:welcome-on', { guild: h.guild, guildId: GUILD_ID });
  await h.press('aurum-private:welcome-on', { message: { author: h.author } });
  assert.equal(h.settings.size + h.calls.length + h.privateReplies.length + h.publicReplies.length, 0);
});

test('legacy send-verify dispatches once to the connected installer and privately confirms to the owner', async t => {
  const h = setup(t);
  await h.message('!send-verify');
  assert.deepEqual(h.calls, [['install-rules', OWNER_ID]]);
  assert.deepEqual(h.publicReplies, []);
  assert.match(h.privateReplies[0].content, /Rules panel installed in start-here/);
});

test('news menu and enable command only preview, then a private confirmation passes the matching approval', async t => {
  const h = setup(t);
  await h.message('!setup-news');
  const buttons = h.privateReplies.at(-1).components[0].components;
  assert.equal(buttons.length, 4);
  await h.press(buttons[0].custom_id);
  await h.message('!news-enable discord-plan');
  const confirmation = h.privateReplies.at(-1);
  assert.equal(confirmation.embeds[0].title, 'Gold market brief');
  assert.equal(confirmation.components[0].components[0].style, 5);
  assert.equal(h.calls.some(([action]) => action === 'enable'), false);
  await h.press(confirmation.components.at(-1).components[0].custom_id);
  assert.deepEqual(h.calls.at(-1), ['enable', OWNER_ID, 'discord-plan', '0123456789abcdef0123']);
  assert.deepEqual(h.publicReplies, []);
});

test('welcome is stored, previewed to the owner and toggled independently of join notices', async t => {
  const h = setup(t);
  await h.message('!setup-welcome');
  const edit = h.privateReplies.at(-1).components[0].components[0].custom_id;
  const shown = await h.press(edit);
  await h.press(shown.modal.custom_id, { isButton: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'Welcome to the gold desk.' } });
  await h.message('!sendwelcome');
  const card = h.privateReplies.at(-1);
  assert.match(card.embeds[0].description, /Welcome to the gold desk\./);
  assert.ok(card.files.length > 0);
  await h.press('aurum-private:welcome-preview');
  assert.deepEqual(h.privateReplies.at(-1), card);
  await h.message('!activate');
  assert.equal(h.settings.get('welcome-enabled'), 'true');
  await h.message('!pause-welcome');
  assert.equal(h.settings.get('welcome-enabled'), 'false');
  assert.deepEqual([...h.settings.keys()].sort(), ['welcome-enabled', 'welcome-text']);
});

test('the ticket preview is private and does not install a panel', async t => {
  const h = setup(t);
  await h.message('!ticket-preview');
  const preview = h.privateReplies.at(-1);
  assert.ok(preview.embeds[0].title);
  assert.equal(preview.components[0].components.length, 3);
  await h.press(preview.components[0].components[1].custom_id);
  assert.match(h.privateReplies.at(-1).embeds[0].title, /Chart review/);
  await h.press(h.privateReplies.at(-1).components[0].components[0].custom_id);
  assert.deepEqual(h.privateReplies.at(-1), preview);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.publicReplies, []);
});

test('ping identifies the running release in the owner DM', async t => {
  const h = setup(t);
  await h.message('!ping');
  const embed = h.privateReplies.at(-1).embeds[0];
  assert.match(embed.title, /connected/);
  assert.match(embed.footer.text, /v2\.1\.0/);
  assert.deepEqual(h.publicReplies, []);
});

test('failed private delivery produces a generic public instruction without revealing approvals', async t => {
  const h = setup(t);
  await h.message('!news-preview discord-plan', { author: { ...h.author, send: async () => { throw new Error(); } } });
  assert.equal(h.publicReplies.length, 1);
  assert.match(h.publicReplies[0].content, /open a DM/);
  assert.doesNotMatch(h.publicReplies[0].content, /0123456789abcdef|Exact private excerpt/);
});
