import { ChannelType, Events, InteractionContextType } from 'discord.js';
import { AURUM_BOT_ID, welcomeText } from './discord.mjs';
import { GUILD_ID, OWNER_ID, assertServer } from './onboarding.mjs';
import { PUBLISH_TARGETS } from './publisher.mjs';

const prefix = 'aurum-private:';
const silent = { allowedMentions: { parse: [], repliedUser: false } };
const button = (id, label, style = 2) => ({ type: 2, custom_id: prefix + id, label, style });
const row = (...components) => ({ type: 1, components });
const targetKeys = Object.keys(PUBLISH_TARGETS);
const commands = new Set(['!help', '!ping', '!fix-bot-nickname', '!setup-tickets', '!setup-news', '!news-preview',
  '!news-enable', '!news-pause', '!news-status', '!setup-welcome', '!sendwelcome', '!activate', '!pause-welcome', '!send-verify']);
const help = [
  'Aurum Desk owner commands',
  '!setup-news — preview and enable website articles for each destination.',
  '!news-preview <target> or !news-enable <target> — open its preview and confirmation button.',
  '!news-pause <target|all> and !news-status — pause or check sharing.',
  'Targets: ' + targetKeys.join(', '),
  '!setup-welcome — edit the new-member DM. !sendwelcome sends a preview to you.',
  '!activate and !pause-welcome — turn welcome DMs on or off. Owner join notices stay active.',
  '!setup-tickets or !spawn-tickets — install the trading support ticket panel.',
  '!send-verify — install the rules and Member role button in start-here.',
  '!fix-bot-nickname — make the bot appear as Aurum Desk in this server.',
  '!ping — check the bot connection.'
].join('\n');
const newsMenu = () => ({
  content: 'Choose a destination to review its website article format and sharing settings.',
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
  const currentWelcome = () => state.setting('welcome-text', welcomeText());
  function welcomeMenu() {
    const enabled = state.setting('welcome-enabled', 'true') === 'true';
    return { content: `New-member welcome DMs are ${enabled ? 'on' : 'off'}.`,
      components: [row(button('welcome-edit', 'Edit welcome'), button('welcome-preview', 'Send me a preview'),
        button('welcome-on', 'Enable welcomes', 3), button('welcome-off', 'Pause welcomes', 4))] };
  }
  function setWelcome(enabled) {
    state.setSetting('welcome-enabled', String(enabled));
    return `New-member welcome DMs are now ${enabled ? 'on' : 'off'}. Owner join notices stay active.`;
  }
  async function preview(key) {
    const { text, approvalId } = await publisher.preview(OWNER_ID, key);
    return { content: text, components: [row(button(`enable:${key}:${approvalId}`, 'Enable future articles here', 3),
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
        case '!ping': return await send('Aurum Desk is connected.');
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
        case '!sendwelcome': return await send(currentWelcome());
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
      if (action === 'preview' && targetKeys.includes(key)) return await reply(await preview(key));
      if (action === 'enable' && targetKeys.includes(key)) return await reply(await publisher.enable(OWNER_ID, key, approvalId));
      if (action === 'pause' && (key === 'all' || targetKeys.includes(key))) return await reply(publisher.pause(OWNER_ID, key));
      if (action === 'status') return await reply(publisher.status(OWNER_ID));
      if (action === 'welcome-preview') return await reply(currentWelcome());
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
