import { bindFixtureChannels } from '../test-support/channels.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublisher, PUBLISH_TARGETS } from '../src/publisher.mjs';
import { GUILD_ID, OWNER_ID } from '../src/onboarding.mjs';
import { readSiteFeed, verifyPublicArticle } from '../src/site-posts.mjs';

bindFixtureChannels();

const origin = 'https://gmh-shop.com';
const applicationId = '111111111111111111';
const sampleTime = Date.parse('2026-11-21T13:05:00Z');
function post(id, kind = 'news', time = sampleTime) {
  const slug = 'example-' + id;
  return { id: '00000000-0000-4000-9000-' + String(id).padStart(12, '0'), kind, slug,
    title: 'Test article ' + id, summary: 'Test-only local excerpt.', published_at: new Date(time).toISOString(),
    url: origin + '/aurum/' + slug };
}

function harness(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'aurum-publisher-test-'));
  const state = { now: sampleTime, posts: [], calls: [], sent: [], html: new Map(), fail: null,
    feedOnline: true, telegramId: -1001234567890 };
  const guild = { id: GUILD_ID, ownerId: OWNER_ID, available: true, members: { fetchMe: async () => ({}) },
    channels: { fetch: async id => ({
      id, guildId: GUILD_ID, type: 0, permissionsFor: () => ({ has: () => true }),
      send: async payload => {
        state.sent.push([id, payload.content]);
        if (state.fail === id) throw new Error('Uncertain delivery');
        return { id: '123456789012345678', channelId: id };
      }
    }) } };
  const fetchImpl = async (url, opts) => {
    state.calls.push(url);
    assert.equal(opts.redirect, 'error');
    if (url === origin + '/api/aurum/feed') {
      return Response.json({ posts: state.posts }, { status: state.feedOnline ? 200 : 503 });
    }
    if (url.startsWith(origin + '/aurum/')) {
      const article = state.posts.find(item => item.url === url);
      const html = state.html.get(url) ?? '<html><head><meta content="' + article?.id
        + '" name="aurum-article-id"/></head></html>';
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (url.startsWith('https://api.telegram.org/botTEST/')) {
      const method = url.split('/').at(-1);
      const body = JSON.parse(opts.body);
      let result;
      if (method === 'getChat') result = { id: state.telegramId, type: 'channel', username: 'AurumDeskk' };
      if (method === 'getMe') result = { id: 42, is_bot: true };
      if (method === 'getChatMember') result = { user: { id: 42 }, status: 'administrator', can_post_messages: true };
      if (method === 'sendMessage') {
        assert.equal(body.chat_id, String(state.telegramId));
        state.sent.push([body.chat_id, body.text]);
        result = { message_id: 42, chat: { id: state.telegramId } };
      }
      assert.ok(result, 'Unexpected Telegram method');
      return Response.json({ ok: true, result });
    }
    throw new Error('Unexpected URL');
  };
  const options = { dataDir, applicationId, telegramToken: 'TEST', fetchImpl, now: () => state.now,
    getClient: () => ({ user: { id: applicationId }, guilds: { fetch: async () => guild } }) };
  const instances = [];
  function install() {
    const publisher = createPublisher(options);
    instances.push(publisher);
    return publisher;
  }
  async function enable(publisher, key) {
    const { approvalId } = await publisher.preview(OWNER_ID, key);
    return publisher.enable(OWNER_ID, key, approvalId);
  }
  t.after(async () => {
    for (const instance of instances) await instance.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return { install, state, enable, fetchImpl };
}

test('paused mode is silent and controls require an owner and a fresh destination-specific preview', async t => {
  const { install, state } = harness(t);
  const pub = install();
  await pub.tick();
  assert.deepEqual(state.calls, []);
  await assert.rejects(pub.preview('stranger', 'discord-news'), /owner/);
  assert.throws(() => pub.pause('stranger'), /owner/);
  await assert.rejects(pub.enable(OWNER_ID, 'discord-news', 'invented'), /preview/);
  state.feedOnline = false;
  const preview = await pub.preview(OWNER_ID, 'discord-news');
  assert.match(preview.text, /FORMAT SAMPLE ONLY/);
  await assert.rejects(pub.enable(OWNER_ID, 'discord-news', preview.approvalId), /paused/);
  state.feedOnline = true;
  await assert.rejects(pub.enable(OWNER_ID, 'discord-plan', preview.approvalId), /preview/);
  state.now += 15 * 60000;
  await assert.rejects(pub.enable(OWNER_ID, 'discord-news', preview.approvalId), /preview/);
  assert.equal(state.sent.length, 0);
});

test('routes only new public posts to their four exact destinations and deduplicates concurrent checks', async t => {
  const { install, state, enable } = harness(t);
  const pub = install();
  const baseline = post(1);
  state.posts = [baseline];
  assert.match((await pub.preview(OWNER_ID, 'discord-news')).text, /Test article 1/);
  for (const target of Object.keys(PUBLISH_TARGETS)) await enable(pub, target);
  state.now += 60000;
  state.posts.push(post(2, 'news', state.now), post(3, 'plan', state.now), post(4, 'news', state.now + 900000));
  await Promise.all([pub.tick(), pub.tick(), pub.tick()]);
  assert.equal(state.sent.length, 4);
  for (const [target, text] of state.sent) {
    assert.doesNotMatch(text, /Test article [14]/);
    const expected = target === PUBLISH_TARGETS['discord-news'].channelId ? 2
      : target === PUBLISH_TARGETS['discord-plan'].channelId ? 3 : null;
    if (expected) assert.ok(text.endsWith('/aurum/example-' + expected));
  }
  assert.equal(state.sent.filter(([target]) => target === String(state.telegramId)).length, 2);
  await pub.close();
  await install().tick();
  assert.equal(state.sent.length, 4);
});

test('uncertain sends survive restart, while another destination still receives the article', async t => {
  const { install, state, enable } = harness(t);
  const pub = install();
  await enable(pub, 'discord-news');
  await enable(pub, 'telegram-news');
  state.now += 1000;
  state.posts = [post(7, 'news', state.now)];
  state.fail = PUBLISH_TARGETS['discord-news'].channelId;
  await pub.tick();
  assert.equal(state.sent.length, 2);
  assert.match(pub.status(OWNER_ID), /1 unconfirmed/);
  await pub.close();
  state.fail = null;
  await install().tick();
  assert.equal(state.sent.length, 2);
});

test('wrong article identity, stale posts, and a Telegram username changing owners cannot send', async t => {
  const { install, state, enable } = harness(t);
  const pub = install();
  await enable(pub, 'telegram-plan');
  state.now += 3 * 86400000;
  const stale = post(8, 'plan', sampleTime + 1000);
  const current = post(9, 'plan', state.now);
  state.posts = [stale, current];
  state.html.set(current.url, '<meta name="aurum-article-id" content="' + stale.id + '">');
  await pub.tick();
  assert.equal(state.sent.length, 0);
  state.html.delete(current.url);
  state.telegramId -= 1;
  await pub.tick();
  assert.equal(state.sent.length, 0);
  state.telegramId += 1;
  await pub.tick();
  assert.equal(state.sent.length, 1);
  assert.ok(state.sent[0][1].endsWith('/aurum/example-9'));
  pub.pause(OWNER_ID);
  state.now += 1000;
  state.posts.push(post(10, 'plan', state.now));
  await pub.tick();
  await enable(pub, 'telegram-plan');
  await pub.tick();
  assert.equal(state.sent.length, 1);
});

test('feed filters wrong hosts, path tricks and ambiguous IDs; HTML requires real article metadata', async t => {
  const { state, fetchImpl } = harness(t);
  const valid = post(16);
  const duplicate = post(25);
  state.posts = [valid, { ...post(17), url: 'https://example.com/aurum/example-17' },
    { ...post(18), url: origin + '/aurum/example-18?redirect=elsewhere' },
    { ...post(19), url: origin + '/login' }, duplicate, duplicate];
  const posts = await readSiteFeed(fetchImpl, origin);
  assert.deepEqual(posts.map(p => p.id), [valid.id]);
  const fake = '<meta name="aurum-article-id" content="' + valid.id + '">';
  for (const html of ['<!--' + fake + '-->', '<script>' + fake + '</script>', '<template>' + fake + '</template>',
    fake + fake, '<meta name="aurum-article-id" content="' + duplicate.id + '">']) {
    state.html.set(valid.url, html);
    await assert.rejects(verifyPublicArticle(fetchImpl, posts[0]), /identity/);
  }
  state.html.set(valid.url, fake);
  await verifyPublicArticle(fetchImpl, posts[0]);
});
