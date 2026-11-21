import { bindFixtureChannels } from '../test-support/channels.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPublisher, PUBLISH_TARGETS } from '../src/publisher.mjs';
import { GUILD_ID, OWNER_ID } from '../src/onboarding.mjs';
import { discordArticle, discordArticlePreview, readSiteFeed, sampleArticle,
  telegramArticle, verifyPublicArticle } from '../src/site-posts.mjs';

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
        state.sent.push([id, payload]);
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
        state.sent.push([body.chat_id, body]);
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
  return { install, state, enable, fetchImpl, dataDir };
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
  assert.match(preview.text, /Historical example/);
  assert.deepEqual(preview.message.embeds, discordArticle(sampleArticle('news')).embeds);
  assert.deepEqual(preview.message.components, discordArticle(sampleArticle('news')).components);
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
  for (const [target, payload] of state.sent) {
    assert.doesNotMatch(JSON.stringify(payload), /Test article [14]/);
    const expected = target === PUBLISH_TARGETS['discord-news'].channelId ? 2
      : target === PUBLISH_TARGETS['discord-plan'].channelId ? 3 : null;
    if (expected) {
      assert.equal(payload.embeds[0].title, 'Test article ' + expected);
      assert.equal(payload.components[0].components[0].url, origin + '/aurum/example-' + expected);
      assert.equal(payload.enforceNonce, true);
      assert.deepEqual(payload.allowedMentions.parse, []);
    } else {
      assert.equal(payload.parse_mode, 'HTML');
      assert.match(payload.text, /<b>Test article [23]<\/b>/);
      assert.match(payload.reply_markup.inline_keyboard[0][0].url, /\/aurum\/example-[23]$/);
    }
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
  assert.equal(state.sent[0][1].reply_markup.inline_keyboard[0][0].url, origin + '/aurum/example-9');
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

test('a public article contributes its own context and source anchors to the actual delivery', async t => {
  const { state, install, enable } = harness(t);
  const pub = install();
  await enable(pub, 'discord-news');
  await enable(pub, 'telegram-news');
  state.now += 1000;
  const entry = post(12, 'news', state.now);
  entry.title = 'A & B < 10';
  state.posts = [entry];
  state.html.set(entry.url, '<meta name="aurum-article-id" content="' + entry.id + '">' +
    '<article><header><div><p>Standfirst</p></div></header><div><div><p>The spread was &lt; 1 &amp; widened. ' +
    '<a href="#x">[1]</a></p></div><section><ol><li id="article-source-1">' +
    '<a href="https://example.test">Original &amp; official</a></li></ol></section></div></article>');
  await pub.tick();
  assert.equal(state.sent.length, 2);
  const discord = state.sent.find(([target]) => target === PUBLISH_TARGETS['discord-news'].channelId)[1];
  const telegram = state.sent.find(([target]) => target === String(state.telegramId))[1];
  assert.match(discord.embeds[0].fields[0].value, /spread was \\< 1 & widened/);
  assert.ok(discord.embeds[0].fields[1].value.endsWith(entry.url + '#article-source-1)'));
  assert.match(telegram.text, /A &amp; B &lt; 10/);
  assert.match(telegram.text, /spread was &lt; 1 &amp; widened/);
  assert.match(telegram.text, /Original &amp; official/);
  assert.doesNotMatch(telegram.text, /example\.test/);
  assert.deepEqual((await pub.preview(OWNER_ID, 'discord-news')).message.embeds, discord.embeds);
  const preview = await pub.preview(OWNER_ID, 'telegram-news');
  assert.match(preview.message.content, /Private preview.*Telegram/);
  assert.match(preview.message.embeds[0].description, /Original & official/);
  assert.equal(preview.message.components[0].components[0].url, telegram.reply_markup.inline_keyboard[0][0].url);
  assert.equal(state.sent.length, 2);
});

test('format upgrade pauses old opt-ins exactly once and preserves the delivery ledger and Telegram binding', async t => {
  const { state, install, enable, dataDir } = harness(t);
  const old = install();
  await enable(old, 'telegram-news');
  const { approvalId } = await old.preview(OWNER_ID, 'discord-plan');
  state.now += 1000;
  state.posts = [post(20, 'news', state.now)];
  await old.tick();
  await old.close();
  const file = join(dataDir, 'publisher.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec('PRAGMA user_version = 0');
  legacy.close();
  const updated = install();
  state.now += 1000;
  state.posts.push(post(21, 'news', state.now));
  await updated.tick();
  assert.equal(state.sent.length, 1);
  await assert.rejects(updated.enable(OWNER_ID, 'discord-plan', approvalId), /fresh preview/);
  const audit = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(audit.prepare("SELECT outcome FROM deliveries WHERE target='telegram-news' AND post=?")
      .get(state.posts[0].id).outcome, 'sent');
    assert.equal(audit.prepare("SELECT bound FROM targets WHERE name='telegram-news'").get().bound, String(state.telegramId));
  } finally { audit.close(); }
  await enable(updated, 'telegram-news');
  await updated.close();
  const restarted = install();
  state.now += 1000;
  state.posts.push(post(22, 'news', state.now));
  await restarted.tick();
  assert.equal(state.sent.length, 2);
  assert.equal(state.sent[1][1].reply_markup.inline_keyboard[0][0].url, origin + '/aurum/example-22');
});

test('both platforms preserve a literal headline, bound message lengths and label historical samples', () => {
  const example = sampleArticle('news');
  const article = { ...example, title: '<a> @everyone *watch*',
    context: '[] @'.repeat(400), summary: '<i> & '.repeat(300) };
  const discord = discordArticle(article);
  const telegram = telegramArticle(article);
  assert.match(discord.embeds[0].title, /\\\*watch\\\*/);
  assert.doesNotMatch(discord.embeds[0].title, /@everyone/);
  assert.match(telegram.text, /&lt;a&gt; @everyone \*watch\*/);
  assert.doesNotMatch(telegram.text, /<i> &/);
  assert.match(telegram.text, /Historical example/);
  assert.ok(discord.embeds[0].fields.every(field => field.value.length <= 1024));
  assert.ok(discordArticlePreview(article, 'telegram').embeds[0].description.length <= 4096);
  assert.ok(telegram.text.replace(/<[^>]*>/g, '').replace(/&(?:lt|gt|amp|quot);/g, 'x').length <= 4096);
  assert.equal(telegram.reply_markup.inline_keyboard[0][0].url, origin + '/aurum');
});
