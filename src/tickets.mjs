import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ChannelType, Events, MessageFlags, OverwriteType, PermissionFlagsBits as P } from 'discord.js';
import { assertServer, GUILD_ID, OWNER_ID, snowflake, START_ID } from './onboarding.mjs';
import { channelCard, ticketIntroCard, ticketPanelCard, ticketTopics } from './community-cards.mjs';

const openPrefix = 'aurum-ticket-open:';
const closePrefix = 'aurum-ticket-close:';
const silent = { allowedMentions: { parse: [], repliedUser: false } };
const access = P.ViewChannel | P.SendMessages | P.ReadMessageHistory | P.AttachFiles;
const token = () => randomBytes(12).toString('hex');
const ticketTopic = key => 'Aurum Desk private ticket ' + key;
const setupHint = 'The ticket action could not be confirmed. The server owner can check the channel and the bot’s permissions.';

function overwrites(bot, requester) {
  return [
    { id: GUILD_ID, type: OverwriteType.Role, allow: 0n, deny: P.ViewChannel },
    ...[...new Set([bot, OWNER_ID, requester].filter(Boolean))].map(id => ({
      id, type: OverwriteType.Member, allow: access, deny: 0n,
    })),
  ];
}

function isTicket(channel, key) {
  return channel?.guildId === GUILD_ID && channel.type === ChannelType.GuildText
    && channel.parentId === null && channel.topic === ticketTopic(key);
}

function checkPrivacy(channel, bot, requester) {
  const expected = overwrites(bot, requester);
  const actual = channel.permissionOverwrites.cache;
  if (actual.size !== expected.length || !expected.every(entry => {
    const found = actual.get(entry.id);
    return found?.type === entry.type && found.allow.bitfield === entry.allow && found.deny.bitfield === entry.deny;
  })) throw new Error('Ticket permissions differ from the approved private layout.');
}

function hasButton(message, id, bot) {
  return message?.author?.id === bot && !message.webhookId && message.components?.some(
    action => action.components?.some(component => component.customId === id),
  );
}

function noDelivery(error) {
  return [400, 401, 403, 404, 429].includes(error?.status);
}

async function refreshCard(message, card) {
  const current = message.embeds?.[0];
  const next = card.embeds[0];
  const sameFields = (current?.fields ?? []).every((field, index) =>
    field.name === next?.fields[index]?.name && field.value === next.fields[index].value);
  if ((message.content || '') === (card.content || '') && current?.title === next?.title
      && current?.description === next?.description && current?.footer?.text === next?.footer?.text
      && (current?.fields?.length ?? 0) === (next?.fields?.length ?? 0) && sameFields) return;
  await message.edit({ ...card, content: card.content || null });
}

export function installTicketHandlers(client, { guild, dataDir }) {
  assertServer(guild);
  const bot = client.user?.id;
  if (!snowflake(bot)) throw new Error('Ticket handler requires a verified bot identity.');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'tickets-' + bot + '.sqlite'));
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS panel (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), nonce TEXT NOT NULL, message TEXT
    );
    CREATE TABLE IF NOT EXISTS tickets (
      requester TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, topic TEXT NOT NULL,
      channel TEXT UNIQUE, closing INTEGER NOT NULL DEFAULT 0, intro TEXT
    );`);
  const getTicket = db.prepare('SELECT * FROM tickets WHERE requester=?');
  const getPanel = db.prepare('SELECT * FROM panel WHERE singleton=1');
  const jobs = new Map();
  let stopping = false;

  // Serialize a member's open and close actions, including simultaneous button presses.
  function enqueue(key, action) {
    if (stopping) return Promise.resolve();
    const task = (jobs.get(key) || Promise.resolve()).catch(() => {}).then(action);
    jobs.set(key, task);
    task.finally(() => { if (jobs.get(key) === task) jobs.delete(key); }).catch(() => {});
    return task;
  }

  async function panel({ createIfMissing = true } = {}) {
    if (!snowflake(START_ID)) throw new Error('Cannot verify the trading start channel.');
    const channel = await guild.channels.fetch(START_ID, { force: true });
    if (channel?.guildId !== GUILD_ID || channel.type !== ChannelType.GuildText || channel.id !== START_ID) {
      throw new Error('Cannot verify the trading start channel.');
    }
    const card = channelCard(channel, bot, ticketPanelCard());
    let record = getPanel.get();
    if (record?.message) {
      try {
        const existing = await channel.messages.fetch(record.message);
        if (!hasButton(existing, openPrefix + 'education', bot)) throw new Error('Invalid ticket panel.');
        await refreshCard(existing, card);
        return 'The ticket panel is already in <#' + START_ID + '>.';
      } catch (error) {
        if (error.code !== 10008) throw error;
        db.prepare('DELETE FROM panel WHERE singleton=1').run();
        record = undefined;
      }
    }
    // Discover an earlier successful POST even if the machine lost its database or response.
    const recent = await channel.messages.fetch({ limit: 100 });
    const matches = [...recent.values()].filter(message => hasButton(message, openPrefix + 'education', bot));
    if (matches.length > 1) throw new Error('More than one ticket panel was found.');
    if (!matches.length) {
      if (record) throw new Error('Earlier ticket panel delivery is unconfirmed.');
      if (!createIfMissing) return;
    }
    const nonce = record?.nonce ?? token();
    db.prepare('INSERT OR IGNORE INTO panel VALUES (1, ?, NULL)').run(nonce);
    let message = matches[0];
    if (message) {
      await refreshCard(message, card);
    } else {
      try {
        message = await channel.send({ ...card, nonce, enforceNonce: true });
      } catch (error) {
        if (noDelivery(error)) db.prepare('DELETE FROM panel WHERE singleton=1').run();
        throw error;
      }
    }
    db.prepare('UPDATE panel SET message=? WHERE singleton=1').run(message.id);
    return 'The ticket panel is ready in <#' + START_ID + '>.';
  }

  async function ticketChannel(record) {
    const channel = await guild.channels.fetch(record.channel, { force: true });
    if (!isTicket(channel, record.key)) throw new Error('Cannot verify the registered ticket.');
    return channel;
  }

  async function finishClose(record) {
    const channel = await ticketChannel(record);
    db.prepare('UPDATE tickets SET closing=1 WHERE key=?').run(record.key);
    // A single Discord edit removes the requester and reasserts the private archive permissions.
    await channel.permissionOverwrites.set(overwrites(bot), 'Close Aurum Desk ticket');
    db.prepare('DELETE FROM tickets WHERE key=?').run(record.key);
  }

  async function open(requester, selected) {
    const existing = getTicket.get(requester);
    if (existing?.closing) await finishClose(existing);
    const key = token();
    const fresh = db.prepare('INSERT OR IGNORE INTO tickets(requester,key,topic) VALUES(?,?,?)')
      .run(requester, key, selected).changes === 1;
    const record = getTicket.get(requester);
    let channel;
    if (record.channel) {
      channel = await ticketChannel(record);
    } else if (fresh) {
      try {
        channel = await guild.channels.create({
          name: 'ticket-' + record.key.slice(0, 10), type: ChannelType.GuildText,
          topic: ticketTopic(record.key), permissionOverwrites: overwrites(bot, requester),
          reason: 'Member requested an Aurum Desk ticket',
        });
      } catch (error) {
        if (noDelivery(error)) db.prepare('DELETE FROM tickets WHERE key=?').run(record.key);
        throw error;
      }
    } else {
      // A crash or timeout may have occurred after Discord created the channel.
      const all = await guild.channels.fetch();
      const matches = [...all.values()].filter(item => isTicket(item, record.key));
      if (matches.length !== 1) throw new Error('Cannot confirm earlier channel creation.');
      [channel] = matches;
    }
    if (!isTicket(channel, record.key)) throw new Error('Unexpected channel returned.');
    checkPrivacy(channel, bot, requester);
    if (!record.channel) db.prepare('UPDATE tickets SET channel=? WHERE key=?').run(channel.id, record.key);
    const closeId = closePrefix + record.key;
    const card = channelCard(channel, bot, ticketIntroCard(record.topic, closeId));
    let intro = record.intro;
    if (intro) {
      try {
        const message = await channel.messages.fetch(intro);
        if (!hasButton(message, closeId, bot)) throw new Error('Cannot verify the ticket controls.');
        await refreshCard(message, card);
      } catch (error) {
        if (error.code !== 10008) throw error;
        intro = undefined;
      }
    }
    if (!intro) {
      const history = await channel.messages.fetch({ limit: 100 });
      const prior = [...history.values()].find(msg => hasButton(msg, closeId, bot));
      if (prior) await refreshCard(prior, card);
      const message = prior ?? await channel.send({ ...card, nonce: record.key, enforceNonce: true });
      db.prepare('UPDATE tickets SET intro=? WHERE key=?').run(message.id, record.key);
    }
    return 'Your ticket is ready in <#' + channel.id + '>.';
  }

  async function interactionAction(i) {
    if (stopping || !i.isButton() || i.guildId !== GUILD_ID || i.user?.bot || !snowflake(i.user?.id)
        || i.message?.author?.id !== bot || i.message.webhookId) return;
    assertServer(i.guild);
    const id = i.customId;
    if (id.startsWith(openPrefix)) {
      const selected = id.slice(openPrefix.length);
      if (!Object.hasOwn(ticketTopics, selected) || i.channelId !== START_ID || i.message.id !== getPanel.get()?.message) return;
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const reply = await enqueue(i.user.id, () => open(i.user.id, selected));
      if (reply) await i.editReply(reply);
    } else if (id.startsWith(closePrefix)) {
      const key = id.slice(closePrefix.length);
      const record = db.prepare('SELECT * FROM tickets WHERE key=? AND channel=? AND intro=?').get(key, i.channelId, i.message.id);
      if (!record) return;
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      if (i.user.id !== record.requester && i.user.id !== OWNER_ID) {
        await i.editReply('Only the requester or the server owner can close this ticket.');
        return;
      }
      await enqueue(record.requester, async () => {
        if (getTicket.get(record.requester)?.key === key) await finishClose(record);
      });
      await i.editReply('🔒 Ticket closed and archived. You can open a new conversation from the ticket panel.');
    }
  }

  function listener(i) {
    return interactionAction(i).catch(async () => {
      console.error('An Aurum Desk ticket action could not be confirmed.');
      if (i.deferred || i.replied) await i.editReply(setupHint).catch(() => {});
    });
  }
  client.on(Events.InteractionCreate, listener);
  return {
    hasPanel: () => snowflake(getPanel.get()?.message),
    refreshExistingPanel: () => enqueue('panel', () => panel({ createIfMissing: false })),
    async handleOwnerCommand(command, message) {
      if (String(command).replace(/^!/, '').toLowerCase() !== 'setup-tickets') return false;
      if (message.guildId !== GUILD_ID || message.author?.id !== OWNER_ID || message.author.bot || message.webhookId) return true;
      assertServer(message.guild);
      const result = await enqueue('panel', panel).catch(() => setupHint);
      if (result) await message.reply({ content: result, ...silent });
      return true;
    },
    async close() {
      if (stopping) return;
      stopping = true;
      client.off(Events.InteractionCreate, listener);
      await Promise.allSettled([...jobs.values()]);
      db.close();
    },
  };
}
