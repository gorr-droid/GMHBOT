import { bindFixtureChannels } from '../test-support/channels.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collection, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import {
  GUILD_ID, OWNER_ID, START_ID, TRADING_CHANNELS, observeJoin, openOnboardingState,
  assertEligibleMember, rulesClickAllowed, bindTradingChannels, channelId,
} from '../src/onboarding.mjs';
import { createRulesPanelInstaller, handleRulesButton, validateMemberRole } from '../src/discord.mjs';

bindFixtureChannels();

const applicationId = '123456789123456789';
const humanId = '223456789123456789';
const roleId = '323456789123456789';
const panelId = '423456789123456789';
const guild = { id: GUILD_ID, ownerId: OWNER_ID, available: true, roles: { everyone: { id: GUILD_ID } } };
const human = { id: humanId, guild, joinedTimestamp: 123456789, user: { bot: false }, pending: false };

test('channel discovery accepts only pinned text room identities in the verified guild', () => {
  const { channels, pins } = bindFixtureChannels();
  const expected = channelId('start-here');
  const room = channels.get(expected);
  try {
    assert.equal(TRADING_CHANNELS.size, 6);
    assert.throws(() => bindTradingChannels({ ...guild, ownerId: humanId }, channels, pins), /ownership/);
    for (const wrong of [{ id: humanId }, { guildId: humanId }, { type: 2 }]) {
      channels.set(expected, { ...room, name: 'start-here', ...wrong });
      bindTradingChannels(guild, channels, pins);
      assert.throws(() => channelId('start-here'), /unavailable/);
      assert.equal(TRADING_CHANNELS.size, 5);
    }
  } finally { bindFixtureChannels(); }
});

function database(t) {
  const directory = mkdtempSync(join(tmpdir(), 'aurum-onboarding-test-'));
  let state = openOnboardingState(directory, applicationId);
  t.after(() => {
    state.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    get state() { return state; },
    directory,
    reopen() {
      state.close();
      state = openOnboardingState(directory, applicationId);
    },
  };
}

test('duplicate concurrent joins and replay after restart send once per membership', async t => {
  const store = database(t);
  let memberCount = 0;
  let ownerCount = 0;
  const messages = {
    welcome: async () => { memberCount++; },
    notifyOwner: async () => { ownerCount++; },
  };
  await Promise.all([observeJoin(store.state, human, messages), observeJoin(store.state, human, messages)]);
  store.reopen();
  await observeJoin(store.state, human, messages);
  assert.deepEqual([memberCount, ownerCount], [1, 1]);
  await observeJoin(store.state, { ...human, joinedTimestamp: human.joinedTimestamp + 1 }, messages);
  assert.deepEqual([memberCount, ownerCount], [2, 2]);
  assert.throws(() => openOnboardingState(store.directory, applicationId), /locked|busy/i);
});

test('blocked member DMs and unknown owner deliveries have separate outcomes', async t => {
  const { state } = database(t);
  const messages = {
    welcome: async () => { throw Object.assign(new Error('DM blocked'), { code: 50007 }); },
    notifyOwner: async () => { throw new Error('Network timeout after request'); },
  };
  await observeJoin(state, human, messages);
  let called = false;
  const check = () => { called = true; };
  await observeJoin(state, human, { welcome: check, notifyOwner: check });
  assert.equal(called, false);
  assert.deepEqual(state.counts().map(r => [r.recipient, r.outcome]), [['member', 'dm-blocked'], ['owner', 'unconfirmed']]);
});

test('bot joins and other guilds are ignored and mismatched ownership fails closed', async t => {
  const { state } = database(t);
  let count = 0;
  const messages = { welcome: () => count++, notifyOwner: () => count++ };
  await observeJoin(state, { ...human, guild: { ...guild, id: humanId } }, messages);
  await observeJoin(state, { ...human, user: { bot: true } }, messages);
  await assert.rejects(observeJoin(state, { ...human, guild: { ...guild, ownerId: humanId } }, messages));
  await assert.rejects(observeJoin(state, { ...human, joinedTimestamp: null }, messages));
  assert.equal(count, 0);
  assert.equal(state.counts().length, 0);
});

test('rules clicks are bound to the current authorized panel and its bot author', t => {
  const { state } = database(t);
  const inputs = { state, messageId: panelId, messageAuthorId: applicationId, applicationId, channelId: START_ID };
  assert.equal(rulesClickAllowed(inputs), false);
  state.setPanel(panelId);
  assert.equal(rulesClickAllowed(inputs), true);
  for (const invalid of [{ channelId: humanId }, { messageId: humanId }, { messageAuthorId: humanId }]) {
    assert.equal(rulesClickAllowed({ ...inputs, ...invalid }), false);
  }
  assert.throws(() => assertEligibleMember(human, roleId, state));
  state.reserve(humanId, human.joinedTimestamp, 'member');
  assert.doesNotThrow(() => assertEligibleMember(human, roleId, state));
  for (const invalid of [{ pending: true }, { user: { bot: true } }, { joinedTimestamp: 1234 }]) {
    assert.throws(() => assertEligibleMember({ ...human, ...invalid }, roleId, state));
  }
});

function roleConfig() {
  const me = { roles: { highest: { comparePositionTo: () => 1 } }, permissions: new PermissionsBitField(P.ManageRoles) };
  const role = { id: roleId, name: 'Member', managed: false, permissions: new PermissionsBitField(P.SendMessages) };
  const channels = new Collection(Array.from(TRADING_CHANNELS, id => [id, {
    id, parentId: null, permissionOverwrites: { cache: new Map() },
    permissionsFor: () => new PermissionsBitField([P.ViewChannel, P.ReadMessageHistory]),
  }]));
  return { guild, me, role, roleId, channels };
}

test('role grant check rejects privilege, hierarchy, archive exposure and inaccessible rules', () => {
  assert.doesNotThrow(() => validateMemberRole(roleConfig()));
  for (const mutate of [
    c => { c.role.managed = true; },
    c => { c.role.name = 'Staff'; },
    c => { c.role.id = GUILD_ID; },
    c => { c.role.permissions = new PermissionsBitField(P.ManageWebhooks); },
    c => { c.me.permissions = new PermissionsBitField(P.SendMessages); },
    c => { c.me.roles.highest.comparePositionTo = () => 0; },
    c => { c.channels.set(humanId, { ...c.channels.get(START_ID), id: humanId }); },
    c => { c.channels.get(START_ID).permissionOverwrites.cache.set(roleId, { allow: new PermissionsBitField(P.ManageMessages) }); },
    c => { c.channels.get(START_ID).permissionsFor = () => new PermissionsBitField(); },
    c => { c.channels.delete(START_ID); },
  ]) {
    const config = roleConfig();
    mutate(config);
    assert.throws(() => validateMemberRole(config));
  }
});

test('running rules installation discovers one ordinary Member, coalesces concurrent installs and revalidates every click', async t => {
  const store = database(t);
  const c = roleConfig();
  const roles = new Collection([[roleId, c.role]]);
  const start = c.channels.get(START_ID);
  const history = new Collection();
  const grants = [];
  const me = { id: applicationId };
  const targetMember = { ...human, roles: { cache: new Collection(), add: async id => grants.push(id) } };
  const server = { ...guild, roles: { ...guild.roles, fetch: async () => roles },
    members: { fetchMe: async () => c.me, fetch: async () => targetMember },
    channels: { fetch: async id => id ? c.channels.get(id) : c.channels } };
  const client = { user: me, guilds: { fetch: async () => server } };
  Object.assign(start, { type: 0, guildId: GUILD_ID,
    messages: { fetch: async query => typeof query === 'string' ? history.get(query) : history },
    send: async payload => {
      assert.equal(history.size, 0, 'A second panel was attempted');
      assert.doesNotMatch(payload.content, /https?:\/\//);
      const message = { id: panelId, channelId: START_ID, author: me, components: [
        { components: payload.components[0].components.map(item => ({ customId: item.custom_id })) }
      ] };
      history.set(panelId, message);
      return message;
    }
  });
  const install = createRulesPanelInstaller(client, store.state, {});
  await assert.rejects(install(humanId), /owner/);
  const secondId = '323456789123456788';
  roles.set(secondId, { ...c.role, id: secondId });
  await assert.rejects(install(OWNER_ID), /exactly one/);
  assert.equal(store.state.setting('member-role-id'), undefined);
  roles.delete(secondId);
  await Promise.all([install(OWNER_ID), install(OWNER_ID)]);
  assert.equal(history.size, 1);
  assert.equal(store.state.setting('member-role-id'), roleId);
  assert.equal((await install(OWNER_ID)).created, false);
  store.reopen();
  const interaction = { isButton: () => true, guildId: GUILD_ID, channelId: START_ID, guild: server,
    customId: 'aurum-rules-v1', message: history.get(panelId), user: { id: humanId },
    deferReply: async () => {}, editReply: async () => {} };
  store.state.reserve(humanId, human.joinedTimestamp, 'owner');
  await handleRulesButton(interaction, {}, store.state, client);
  assert.deepEqual(grants, [roleId]);
  c.role.permissions = new PermissionsBitField(P.ManageRoles);
  await assert.rejects(handleRulesButton(interaction, {}, store.state, client), /ordinary Member/);
  assert.equal(grants.length, 1);
  roles.delete(roleId);
  roles.set(secondId, { ...c.role, permissions: new PermissionsBitField(), id: secondId });
  await assert.rejects(handleRulesButton(interaction, {}, store.state, client), /ordinary Member/);
  assert.equal(grants.length, 1);
});
