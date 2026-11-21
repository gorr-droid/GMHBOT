import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { GUILD_ID } from '../src/onboarding.mjs';
import { joinCard, rulesCard, ticketIntroCard, ticketPanelCard, welcomeCard } from '../src/community-cards.mjs';

test('welcome uses the packaged banner and preserves an existing custom introduction at the previous length limit', () => {
  const introduction = 'w'.repeat(2000);
  const memberId = '123456789123456789';
  const startId = '223456789123456789';
  const card = welcomeCard({ memberId, introduction, startId, rulesAvailable: true, ticketsAvailable: true });
  assert.equal(card.embeds[0].description, 'Hi <@' + memberId + '>!\n' + introduction);
  assert.ok(card.embeds[0].description.length <= 4096);
  assert.deepEqual(card.allowedMentions.parse, []);
  const banner = card.files[0];
  assert.equal(card.embeds[0].image.url, 'attachment://' + banner.name);
  assert.ok(existsSync(banner.attachment));
  assert.equal(card.components[0].components[0].url, 'https://discord.com/channels/' + GUILD_ID + '/' + startId);
  const fallback = welcomeCard();
  assert.doesNotMatch(JSON.stringify(fallback), /Accept rules|on the ticket panel|undefined/);
  assert.equal(fallback.components[0].components[0].url, 'https://discord.com/channels/' + GUILD_ID);
});

test('community previews expose the same button ids and private join and ticket details as delivery', () => {
  const member = { id: '223456789123456789', joinedTimestamp: 1720000001234 };
  const notice = joinCard(member);
  assert.equal(notice.embeds[0].fields[1].value, '<t:1720000001:F>');
  assert.deepEqual(notice.allowedMentions.parse, []);
  const inputs = [{ type: 1, components: [{ type: 2, custom_id: 'existing-id' }] }];
  assert.equal(rulesCard(inputs).components, inputs);
  const panel = ticketPanelCard();
  assert.deepEqual(panel.components[0].components.map(b => b.custom_id),
    ['aurum-ticket-open:education', 'aurum-ticket-open:chart', 'aurum-ticket-open:community']);
  const intro = ticketIntroCard('chart', 'aurum-ticket-close:existing-id');
  assert.match(intro.embeds[0].description, /timeframe/);
  assert.equal(intro.components[0].components[0].custom_id, 'aurum-ticket-close:existing-id');
});
