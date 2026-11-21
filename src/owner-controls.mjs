import { ChannelType, Events, InteractionContextType } from 'discord.js';
import { AURUM_BOT_ID, memberWelcome } from './discord.mjs';
import { DEFAULT_WELCOME, ticketIntroCard, ticketPanelCard, ticketTopics } from './community-cards.mjs';
import release from '../package.json' with { type: 'json' };
import { GUILD_ID, OWNER_ID, assertServer } from './onboarding.mjs';
import { PUBLISH_TARGETS } from './publisher.mjs';

const prefix = 'aurum-private:';
const silent = { allowedMentions: { parse: [], repliedUser: false } };
const button = (id, label, style = 2) => ({ type: 2, custom_id: prefix + id, label, style });
const row = (...components) => ({ type: 1, components });
const targetKeys = Object.keys(PUBLISH_TARGETS);
const commands = new Set(['!help', '!ping', '!fix-bot-nickname', '!setup-tickets', '!ticket-preview', '!setup-news', '!news-preview',
  '!news-enable', '!news-pause', '!news-status', '!setup-welcome', '!sendwelcome', '!activate', '!pause-welcome', '!send-verify']);
const help = { embeds: [{ color: 0xC5A15A, title: 'Owner guide', author: { name: 'Aurum Desk' }, fields: [
  { name: 'Member welcome', value: '`!sendwelcome` previews a new member’s card here. Edit it with `!setup-welcome`. Use `!activate` or `!pause-welcome` to manage welcome DMs.' },
  { name: 'Tickets and rules', value: '`!ticket-preview` lets you try a topic privately. `!setup-tickets` (also `!spawn-tickets`) installs or refreshes the panel in start-here. `!send-verify` installs the rules button.' },
  { name: 'Gold posts', value: '`!setup-news` shows four destinations. `!news-preview <target>` and `!news-enable <target>` both open a preview. Only the confirmation button enables sharing.' },
  { name: 'Sharing status', value: '`!news-status` shows each destination. `!news-pause all` or `!news-pause <target>` pauses sharing. Targets: ' + targetKeys.map(key => '`' + key + '`').join(', ') + '.' },
  { name: 'Bot settings', value: '`!ping` shows the running version. `!fix-bot-nickname` updates the bot’s name in this server.' }
] }] };
function ticketPreviewMenu() {
  const card = ticketPanelCard();
  return { ...card, content: 'Private preview · Choose a topic to see its opening message.',
    components: [row(...Object.keys(ticketTopics).map(key => ({
      ...button('ticket-demo:' + key, ticketTopics[key].label), emoji: { name: ticketTopics[key].emoji }
    })))] };
}
const newsMenu = () => ({
  embeds: [{ color: 0xC5A15A, author: { name: 'Aurum Desk  /  Editorial' }, title: 'Review a gold post',
    description: 'Choose where you want to see the post. The preview opens here in your private conversation.',
    fields: [{ name: 'Gold news', value: 'Economic releases and policy decisions that matter for gold.', inline: true },
      { name: 'Market plan', value: 'What to watch in the next session, with the full article one tap away.', inline: true }],
    footer: { text: 'Owner controls · Each destination has its own sharing setting' } }],
  components: [row(...targetKeys.map(key => button('preview:' + key, PUBLISH_TARGETS[key].label))),
    row(button('status', 'Sharing status'), button('pause:all', 'Pause all sharing', 4))]
});

function ownerContext(source, guild) {
  const user = source.author ?? source.user;
  if (user?.id !== OWNER_ID || user.bot || source.webhookId) return false;
  if (guild.id !== GUILD_ID || guild.ownerId !== OWNER_ID || !guild.available) return false;
  return source.guildId
    ? source.guildId === GUILD_ID && source.guild?.ownerId === OWNER_ID && source.guild?.available
    : source.channel?.type === ChannelType.DM || source.context === InteractionContextType.BotDM;
}

async function fixBotNickname(client, guild) {
  if (client.user?.id !== AURUM_BOT_ID || !client.user.bot) return 'The Aurum Desk bot identity could not be verified.';
  try {
    const me = await guild.members.fetchMe({ force: true });
    if (me.id !== AURUM_BOT_ID) return 'The Aurum Desk server member could not be verified.';
    if (me.displayName === 'Aurum Desk') return 'This server already shows the bot as Aurum Desk.';
    const nick = me.user.displayName === 'Aurum Desk' ? null : 'Aurum Desk';
    const updated = await guild.members.editMe({ nick, reason: 'Aurum Desk owner requested the bot profile update' });
    if (updated.id === AURUM_BOT_ID && updated.displayName === 'Aurum Desk') return 'This server now shows the bot as Aurum Desk.';
  } catch {
    return 'Discord could not update the server nickname. Check the bot’s Change Nickname permission or edit its server profile in Discord.';
  }
  return 'The updated server nickname could not be confirmed.';
}

export function installOwnerControls(client, { guild, state, tickets, publisher, installRules }) {
  assertServer(guild);
  const active = new Set();
  let closing = false;
  const currentWelcome = () => state.setting('welcome-text', DEFAULT_WELCOME);
  const previewWelcome = () => memberWelcome(state, OWNER_ID, tickets?.hasPanel?.());
  function welcomeMenu() {
    const enabled = state.setting('welcome-enabled', 'true') === 'true';
    return { embeds: [{ color: 0xC5A15A, author: { name: 'Aurum Desk  /  Community' }, title: 'Member welcome',
      description: 'Preview the card a new member receives or edit its introduction.',
      fields: [{ name: 'Welcome DMs', value: enabled ? 'On' : 'Paused', inline: true },
        { name: 'Join notifications', value: 'Sent privately to the owner', inline: true }] }],
      components: [row(button('welcome-edit', 'Edit welcome'), button('welcome-preview', 'Send me a preview'),
        button('welcome-on', 'Enable welcomes', 3), button('welcome-off', 'Pause welcomes', 4))] };
  }
  function setWelcome(enabled) {
    state.setSetting('welcome-enabled', String(enabled));
    return `New-member welcome DMs are now ${enabled ? 'on' : 'off'}. Owner join notices stay active.`;
  }
  async function preview(key) {
    const { message, approvalId } = await publisher.preview(OWNER_ID, key);
    return { ...message, components: [...(message.components ?? []), row(button(`enable:${key}:${approvalId}`, 'Enable future articles here', 3),
      button('pause:' + key, 'Pause this destination', 4))] };
  }
  async function onMessage(message) {
    if (!ownerContext(message, guild)) return;
    const pieces = String(message.content ?? '').trim().split(/\s+/);
    const input = pieces[0].toLowerCase();
    const command = input === '!spawn-tickets' ? '!setup-tickets' : input;
    if (!commands.has(command)) return;
    const key = pieces[1]?.toLowerCase();
    const send = payload => message.author.send({ ...(typeof payload === 'string' ? { content: payload } : payload), ...silent });
    try {
      switch (command) {
        case '!ping': return await send({ embeds: [{ title: 'Aurum Desk is connected',
          color: 0xC5A15A, footer: { text: 'Discord gateway  •  v' + release.version } }] });
        case '!help': return await send(help);
        case '!fix-bot-nickname': return await send(await fixBotNickname(client, guild));
        case '!setup-news': return await send(newsMenu());
        case '!news-status': return await send(publisher.status(OWNER_ID));
        case '!news-preview':
        case '!news-enable':
          return await send(targetKeys.includes(key) ? await preview(key) : newsMenu());
        case '!news-pause':
          return await send(!key || key === 'all' || targetKeys.includes(key) ? publisher.pause(OWNER_ID, key || 'all')
            : 'Use !news-pause with a destination or all.');
        case '!setup-welcome': return await send(welcomeMenu());
        case '!sendwelcome': return await send(previewWelcome());
        case '!ticket-preview': return await send(ticketPreviewMenu());
        case '!activate': return await send(setWelcome(true));
        case '!pause-welcome': return await send(setWelcome(false));
        case '!send-verify': {
          let panel;
          try { panel = await installRules(OWNER_ID); }
          catch (error) {
            const known = /^(Expected exactly one role|The selected role|The optional Member-role feature|The expected trading channel layout|Member has an unexpected|Member can see a channel|New arrivals must|Earlier panel delivery|There are multiple Aurum|Registered rules panel)/;
            return await send(known.test(error?.message) ? error.message
              : 'The rules panel could not be confirmed. Check the bot’s access to start-here and the Member role.');
          }
          return await send(panel.created ? 'Rules panel installed in start-here.' : 'The rules panel is already available in start-here.');
        }
        case '!setup-tickets':
          // The pinned guild and authenticated owner are passed to the existing ticket handler in both contexts.
          return await tickets.handleOwnerCommand('setup-tickets', { guild, guildId: guild.id, author: message.author, reply: send });
      }
    } catch {
      if (message.guildId) await message.reply({ content: 'Please open a DM with the bot and use !help to check the owner controls.', ...silent }).catch(() => {});
      else await send('The action could not be confirmed. Use !news-status or !help to review the setup.').catch(() => {});
    }
  }
  async function onInteraction(i) {
    if (!ownerContext(i, guild) || i.guildId || !i.customId?.startsWith(prefix)) return;
    const [action, key, approvalId] = i.customId.slice(prefix.length).split(':');
    const reply = content => i.editReply({ ...(typeof content === 'string' ? { content } : content), ...silent });
    try {
      if (i.isModalSubmit() && action === 'welcome-save') {
        const text = i.fields.getTextInputValue('welcome-text').trim();
        await i.deferReply();
        if (!text || text.length > 2000) return await reply('Enter a welcome message between 1 and 2,000 characters.');
        state.setSetting('welcome-text', text);
        return await reply('Welcome message saved. Use !sendwelcome to read it.');
      }
      if (!i.isButton() || i.message?.author?.id !== client.user?.id) return;
      if (action === 'welcome-edit') {
        return await i.showModal({ custom_id: prefix + 'welcome-save', title: 'Edit new-member welcome',
          components: [row({ type: 4, custom_id: 'welcome-text', style: 2, label: 'Welcome message',
            required: true, max_length: 2000, value: currentWelcome() })] });
      }
      await i.deferReply();
      if (action === 'ticket-demo' && Object.hasOwn(ticketTopics, key)) {
        const example = ticketIntroCard(key, prefix + 'ticket-back');
        return await reply({ ...example, content: 'Private preview · Ticket opening message',
          components: [row(button('ticket-back', 'Back to ticket topics'))] });
      }
      if (action === 'ticket-back') return await reply(ticketPreviewMenu());
      if (action === 'preview' && targetKeys.includes(key)) return await reply(await preview(key));
      if (action === 'enable' && targetKeys.includes(key)) return await reply(await publisher.enable(OWNER_ID, key, approvalId));
      if (action === 'pause' && (key === 'all' || targetKeys.includes(key))) return await reply(publisher.pause(OWNER_ID, key));
      if (action === 'status') return await reply(publisher.status(OWNER_ID));
      if (action === 'welcome-preview') return await reply(previewWelcome());
      if (action === 'welcome-on' || action === 'welcome-off') return await reply(setWelcome(action === 'welcome-on'));
      return await reply('Use !help to open the current owner controls.');
    } catch (error) {
      if (i.deferred) {
        // Only display known publisher messages. Third-party API errors can contain request metadata.
        const known = /^(Open a fresh preview|Publishing stays paused|This destination is already enabled|Set the dedicated Telegram bot token|The Telegram bot needs permission|Verify the configured Discord room)/;
        const content = known.test(error?.message) ? error.message
          : 'The action could not be confirmed. Check the website feed, bot permissions and destination, then open a fresh preview.';
        await reply(content).catch(() => {});
      }
    }
  }
  function track(handler) {
    return event => {
      if (closing) return;
      const work = handler(event).catch(() => console.error('Aurum Desk owner action failed.'));
      active.add(work);
      work.finally(() => active.delete(work)).catch(() => {});
      return work;
    };
  }
  const messageListener = track(onMessage), interactionListener = track(onInteraction);
  client.on(Events.MessageCreate, messageListener);
  client.on(Events.InteractionCreate, interactionListener);
  return { async close() {
    closing = true;
    client.off(Events.MessageCreate, messageListener);
    client.off(Events.InteractionCreate, interactionListener);
    await Promise.allSettled([...active]);
  } };
}
