import { fileURLToPath } from 'node:url';
import { PermissionFlagsBits as P } from 'discord.js';
import { GUILD_ID, snowflake } from './onboarding.mjs';

const gold = 0xcda85b;
const mark = 'https://gmh-shop.com/aurum-desk-mark.webp';
const research = 'https://gmh-shop.com/aurum';
const banner = fileURLToPath(new URL('../branding/banner.png', import.meta.url));
const silent = { allowedMentions: { parse: [], repliedUser: false } };
const author = { name: 'Aurum Desk', icon_url: mark };
export const DEFAULT_WELCOME = 'We study what moves gold. Bring a chart, ask a question or read along while you get to know the desk.';

// Keep the same controls and guidance in existing rooms that withhold Embed Links.
export function channelCard(channel, bot, card) {
  if (channel.permissionsFor(bot)?.has(P.EmbedLinks) !== false) return card;
  const [embed] = card.embeds;
  const text = ['**' + embed.title + '**', embed.description,
    ...embed.fields.map(field => '**' + field.name + '**\n' + field.value), embed.footer.text].join('\n\n');
  return { ...card, content: text, embeds: [] };
}

function link(label, url, emoji) {
  return { type: 2, style: 5, label, url, emoji: { name: emoji } };
}

export function welcomeCard({ memberId, introduction = DEFAULT_WELCOME, startId, rulesAvailable = false, ticketsAvailable = false } = {}) {
  const startUrl = 'https://discord.com/channels/' + GUILD_ID + (snowflake(startId) ? '/' + startId : '');
  const name = snowflake(memberId) ? '<@' + memberId + '>' : 'there';
  const fields = [
    { name: '📍 Your first stop', value: rulesAvailable && snowflake(startId)
      ? 'Open **start-here**, read the community rules and select **Accept rules** to join the discussion.'
      : 'Open the server guide for channel links and the community rules.' },
    { name: '🗓️ Follow gold', value: '**Gold Market Plan** covers the session. **News Calendar** lists upcoming releases. In **Trade Reviews**, share your timeframe and what would change your view.' },
    { name: '🎟️ Free VIP access', value: ticketsAvailable && snowflake(startId)
      ? 'In **start-here**, choose **Community / VIP access** on the ticket panel to ask the owner about joining.'
      : 'Interested in joining the free VIP group? Visit the [community page](' + research + '#vip) for contact options.' },
  ];
  return {
    embeds: [{ author, color: gold, title: 'Welcome to Aurum Desk',
      description: 'Hi ' + name + '!\n' + introduction, fields,
      image: { url: 'attachment://aurum-welcome.png' },
      footer: { text: 'XAU/USD  •  Member guide' } }],
    files: [{ attachment: banner, name: 'aurum-welcome.png', description: 'Aurum Desk community banner' }],
    components: [{ type: 1, components: [link(snowflake(startId) ? 'Open start-here' : 'Open the server', startUrl, '👋'),
      link('Gold research', research, '📖')] }], ...silent,
  };
}

export function joinCard(member) {
  const seconds = Math.floor(member.joinedTimestamp / 1000);
  return {
    embeds: [{ author, color: gold, title: 'New member at the desk',
      description: '<@' + member.id + '> joined Aurum Desk.',
      fields: [
        { name: 'Member ID', value: '`' + member.id + '`', inline: true },
        { name: 'Joined', value: '<t:' + seconds + ':F>', inline: true },
      ], footer: { text: 'Membership  •  Owner notice' } }], ...silent,
  };
}

export function rulesCard(components) {
  return {
    content: '',
    embeds: [{ author, color: gold, title: 'Before you join the discussion',
      description: 'Read the rules below, then select **Accept rules** to receive the Member role.',
      fields: [
        { name: '📊 Show your reasoning', value: 'Label the instrument and timeframe on charts. Explain the idea and identify practice trades.' },
        { name: '🤝 Respect other members', value: 'Keep feedback constructive. Promotions, unsolicited DMs, requests for account access and promises of returns are outside our community rules.' },
      ], footer: { text: 'Community rules  •  Aurum Desk' } }],
    components, ...silent,
  };
}

export const ticketTopics = {
  education: { label: 'Gold education', emoji: '📚', summary: 'Ask about a gold-market concept, reading a chart or managing risk.',
    prompt: 'Which concept are you working on? Tell us what you have tried and where you got stuck.' },
  chart: { label: 'Chart review', emoji: '📊', summary: 'Get a second look at a chart and the reasoning behind your idea.',
    prompt: 'Attach your chart with the instrument and timeframe visible. What level matters to you, and what would invalidate your idea?' },
  community: { label: 'Community / VIP access', emoji: '🎟️', summary: 'Ask about the community or request access to the free VIP group.',
    prompt: 'Tell us which community space you want to join or need help accessing. VIP membership is free. The owner reviews requests here.' },
};

export function ticketPanelCard() {
  const components = Object.entries(ticketTopics).map(([key, topic]) => ({
    type: 2, style: 2, custom_id: 'aurum-ticket-open:' + key, label: topic.label, emoji: { name: topic.emoji },
  }));
  return {
    content: '',
    embeds: [{ author, color: gold, title: 'Open a private ticket',
      description: 'Choose a topic below to start a conversation with the desk. If you already have a ticket, your button takes you back to it.',
      fields: Object.values(ticketTopics).map(topic => ({ name: topic.emoji + ' ' + topic.label, value: topic.summary })),
      footer: { text: 'The owner and server administrators can read tickets.' } }],
    components: [{ type: 1, components }], ...silent,
  };
}

export function ticketIntroCard(key, closeId) {
  const topic = ticketTopics[key];
  return {
    embeds: [{ author, color: gold, title: topic.emoji + ' ' + topic.label,
      description: topic.prompt,
      fields: [{ name: 'When you’re finished', value: 'You or the owner can close this ticket. Closing removes your access and archives the conversation.' }],
      footer: { text: 'Private ticket  •  Aurum Desk' } }],
    components: [{ type: 1, components: [{ type: 2, style: 4, custom_id: closeId, label: 'Close ticket', emoji: { name: '🔒' } }] }], ...silent,
  };
}
