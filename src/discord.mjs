import {
  ActivityType, ChannelType, Client, Events, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits as P,
} from 'discord.js';
import {
  GUILD_ID, OWNER_ID, START_ID, TRADING_CHANNELS, bindTradingChannels, channelPins,
  assertEligibleMember, assertServer, observeJoin, openOnboardingState, rulesClickAllowed, snowflake,
} from './onboarding.mjs';
import { channelCard, joinCard, rulesCard, welcomeCard } from './community-cards.mjs';

const RULES = 'aurum-rules-v1';
const CONTROL = 'aurum-owner-v1';
export const AURUM_BOT_ID = '1535349548866600960';
const silent = { allowedMentions: { parse: [], repliedUser: false } };
export function memberWelcome(state, memberId, ticketsAvailable = false) {
  return welcomeCard({
    memberId, startId: START_ID, introduction: state.setting('welcome-text'),
    rulesAvailable: snowflake(state.panel?.()), ticketsAvailable,
  });
}
const button = (custom_id, label, style = 2) => ({ type: 2, style, custom_id, label });
const row = (...components) => ({ type: 1, components });
const rulesRow = row(button(RULES, 'Accept rules', 3), button(CONTROL, 'Owner tools'));
const memberPermissions = [
  P.CreateInstantInvite, P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.SendMessagesInThreads,
  P.AddReactions, P.UseExternalEmojis, P.UseExternalStickers, P.EmbedLinks, P.AttachFiles,
  P.Connect, P.Speak, P.Stream, P.UseVAD, P.ChangeNickname, P.UseApplicationCommands,
  P.SendVoiceMessages, P.UseSoundboard, P.UseExternalSounds, P.SendPolls, P.UseEmbeddedActivities,
].reduce((mask, flag) => mask | flag, 0n);

function requireRoleManagement(me) {
  if (!me.permissions.has(P.ManageRoles)) {
    throw new Error('The optional Member-role feature requires Manage Roles.');
  }
}

export function validateMemberRole({ guild, me, role, roleId, channels }) {
  assertServer(guild);
  requireRoleManagement(me);
  if (!snowflake(roleId) || role?.id !== roleId || role.id === guild.id || role.name !== 'Member'
      || role.managed || me.roles.highest.comparePositionTo(role) <= 0
      || (role.permissions.bitfield & ~memberPermissions) !== 0n) {
    throw new Error('The selected role must be the ordinary Member role, below the bot, with community permissions only.');
  }
  if (TRADING_CHANNELS.size !== Object.keys(channelPins).length) throw new Error('The expected trading channel layout could not be verified.');
  const allowed = new Set(TRADING_CHANNELS);
  for (const id of TRADING_CHANNELS) {
    const channel = channels.get(id);
    if (!channel) throw new Error('The expected trading channel layout could not be verified.');
    if (channel.parentId) allowed.add(channel.parentId);
  }
  for (const channel of channels.values()) {
    const explicit = channel.permissionOverwrites.cache.get(role.id);
    if (explicit && (explicit.allow.bitfield & ~memberPermissions) !== 0n) {
      throw new Error('Member has an unexpected channel permission. Review it before giving this role.');
    }
    if (!allowed.has(channel.id) && channel.permissionsFor(role, false)?.has(P.ViewChannel, false)) {
      throw new Error('Member can see a channel outside the trading area. Review its visibility.');
    }
  }
  const startChannel = channels.get(START_ID);
  if (!startChannel.permissionsFor(guild.roles.everyone, false)?.has([P.ViewChannel, P.ReadMessageHistory], false)) {
    throw new Error('New arrivals must be able to read the rules channel before receiving Member.');
  }
}

async function guildContext(client, options) {
  if (options.applicationId && client.user?.id !== options.applicationId) throw new Error('Discord application ID mismatch.');
  const guild = await client.guilds.fetch({ guild: GUILD_ID, force: true });
  assertServer(guild);
  return guild;
}

async function verifiedRole(guild, pinnedId, discover = false) {
  const [roles, channels, me] = await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.members.fetchMe({ force: true })]);
  let roleId = pinnedId;
  if (!roleId && discover) {
    const matches = [...roles.values()].filter(role => role.name === 'Member');
    if (matches.length !== 1) throw new Error('Expected exactly one role named Member. Set DISCORD_MEMBER_ROLE_ID for the intended role.');
    roleId = matches[0].id;
  }
  validateMemberRole({ guild, me, role: roles.get(roleId), roleId, channels });
  return roleId;
}

async function connect(options, listen) {
  if (!options.token || (options.applicationId && !snowflake(options.applicationId))) {
    throw new Error('Set the existing bot token and a valid application ID if configured.');
  }
  if (options.memberRoleId && !snowflake(options.memberRoleId)) throw new Error('Invalid Member-role ID.');
  let state;
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];
  if (options.installHandlers && listen) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages);
  const client = new Client({
    intents,
    partials:[Partials.Channel],
    allowedMentions: silent.allowedMentions,
    rest: { retries: 0, timeout: 15000 },
  });
  const originalDestroy = client.destroy.bind(client);
  let closed = false;
  const active = new Set();
  const verified = Promise.withResolvers();
  verified.promise.catch(() => {});
  function afterVerification(action, onError) {
    if (closed) return;
    const task = verified.promise.then(() => {
      if (!closed) return action(state);
    }).catch(onError);
    active.add(task);
    task.finally(() => active.delete(task)).catch(() => {});
  }
  client.destroy = async () => {
    if (closed) return;
    closed = true;
    verified.resolve();
    try {
      await Promise.allSettled([...active]);
      await originalDestroy();
    } finally { state?.close(); }
  };
  let timer;
  try {
    listen?.(client, afterVerification);
    const ready = new Promise((resolve, reject) => {
      client.once(Events.ClientReady, resolve);
      client.once(Events.Error, reject);
      timer = setTimeout(() => reject(new Error('Discord connection timed out.')), 45000);
    });
    await Promise.all([ready, client.login(options.token)]);
    const guild = await guildContext(client, options);
    bindTradingChannels(guild, await guild.channels.fetch());
    state = openOnboardingState(options.dataDir, client.user.id);
    if (listen) await options.installHandlers?.(client, { guild, state });
    verified.resolve();
    client.on(Events.Error, () => console.error('Discord gateway reported a connection error.'));
    return { client, state, guild };
  } catch (error) {
    verified.reject(error);
    await client.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function ownedRulesMessage(message, client) {
  return message.channelId === START_ID && !message.webhookId && message.author?.id === client.user.id
    && message.components.some(actionRow => actionRow.components.some(component => component.customId === RULES));
}

async function ensureRulesMessage(client, state, guild) {
  const channel = await guild.channels.fetch(START_ID, { force: true });
  if (channel?.id !== START_ID || channel.type !== ChannelType.GuildText || channel.guildId !== GUILD_ID) {
    throw new Error('Rules channel mismatch.');
  }
  const payload = channelCard(channel, client.user.id, rulesCard([rulesRow]));
  // Older installations pinned a text-only panel. Refresh it at the same message ID.
  async function reuse(existing) {
    if ((existing.content || '') !== (payload.content || '') || existing.embeds?.[0]?.title !== payload.embeds[0]?.title) {
      await existing.edit({ ...payload, content: payload.content || null });
    }
    state.setPanel(existing.id);
    return { messageId: existing.id, created: false };
  }
  const previous = state.panel();
  if (snowflake(previous)) {
    const existing = await channel.messages.fetch(previous);
    if (!ownedRulesMessage(existing, client)) throw new Error('Registered rules panel could not be verified.');
    return reuse(existing);
  }
  const history = await channel.messages.fetch({ limit: 100 });
  const existing = history.filter(message => ownedRulesMessage(message, client));
  if (existing.size > 1) throw new Error('There are multiple Aurum rules messages. Resolve the duplicate before setup.');
  if (existing.size === 1) {
    return reuse(existing.first());
  }
  if (previous === 'unconfirmed') throw new Error('Earlier panel delivery is unconfirmed. Inspect the channel before retrying.');
  state.setPanel('unconfirmed');
  let message;
  try {
    message = await channel.send({ ...payload, ...silent });
  } catch (error) {
    if ([400, 401, 403, 404].includes(error?.status)) state.setPanel('rejected');
    throw error;
  }
  if (!snowflake(message.id) || !ownedRulesMessage(message, client)) throw new Error('Rules panel delivery could not be confirmed.');
  state.setPanel(message.id);
  return { messageId: message.id, created: true };
}

export function createRulesPanelInstaller(client, state, options) {
  let installation;
  return function install(owner) {
    if (owner !== OWNER_ID) return Promise.reject(new Error('Only the verified Aurum Desk owner can install the rules panel.'));
    if (!installation) {
      installation = (async () => {
        const guild = await guildContext(client, options);
        const pinned = options.memberRoleId || state.setting('member-role-id');
        const roleId = await verifiedRole(guild, pinned, true);
        const result = await ensureRulesMessage(client, state, guild);
        state.setSetting('member-role-id', roleId);
        return result;
      })().finally(() => { installation = undefined; });
    }
    return installation;
  };
}

// A separate operator invocation still supports the original explicit role-ID setup.
export async function installRulesPanel(options) {
  if (!snowflake(options.memberRoleId)) throw new Error('Panel installation requires the verified Member-role ID.');
  const { client, state, guild } = await connect(options);
  try {
    await verifiedRole(guild, options.memberRoleId);
    const result = await ensureRulesMessage(client, state, guild);
    state.setSetting('member-role-id', options.memberRoleId);
    return result;
  } finally { await client.destroy(); }
}

const ownerButtons = [
  button(CONTROL + '-health', 'Health'),
  button(CONTROL + '-telegram', 'Telegram draft'),
  button(CONTROL + '-discord', 'Discord draft'),
];

export async function handleRulesButton(interaction, options, state, client) {
  if (!interaction.isButton() || interaction.guildId !== GUILD_ID || interaction.channelId !== START_ID) return;
  const id = interaction.customId;
  if (id !== RULES && id !== CONTROL && !id.startsWith(CONTROL + '-')) return;
  assertServer(interaction.guild);
  const root = id === RULES || id === CONTROL;
  if (root && !rulesClickAllowed({
    state, channelId: interaction.channelId, messageId: interaction.message.id,
    messageAuthorId: interaction.message.author?.id, applicationId: client.user.id,
  })) return;
  if (!root && (interaction.message.author?.id !== client.user.id
    || !interaction.message.flags.has(MessageFlags.Ephemeral))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (id === RULES) {
    const roleId = options.memberRoleId || state.setting('member-role-id');
    if (!roleId) return interaction.editReply('Member-role onboarding is turned off.');
    const guild = await guildContext(client, options);
    await verifiedRole(guild, roleId);
    const member = await guild.members.fetch({ user: interaction.user.id, force: true });
    if (member.roles.cache.has(roleId)) return interaction.editReply('You already have the Member role.');
    try { assertEligibleMember(member, roleId, state); } catch (error) {
      return interaction.editReply(error.message);
    }
    await member.roles.add(roleId, 'Member accepted the Aurum Desk rules');
    return interaction.editReply('Welcome in! You can now join trading-chat and trade-reviews.');
  }
  if (interaction.user.id !== OWNER_ID || interaction.guild.ownerId !== interaction.user.id) {
    return interaction.editReply('These tools are for the server owner.');
  }
  if (id === CONTROL) {
    const buttons = [...ownerButtons];
    if (options.pausePosting) buttons.push(button(CONTROL + '-pause', 'Pause posting', 4));
    return interaction.editReply({ content: 'Aurum Desk owner tools', components: [row(...buttons)] });
  }
  let text;
  if (id === CONTROL + '-health') {
    const counts = state.counts().map(item => `${item.recipient} · ${item.outcome} · ${item.count}`);
    text = ['Onboarding connected.', ...counts, await options.getStatus?.()].filter(Boolean).join('\n');
  } else if (id === CONTROL + '-pause' && options.pausePosting) {
    text = (await options.pausePosting()) || 'Posting paused.';
  } else if ([CONTROL + '-telegram', CONTROL + '-discord'].includes(id)) {
    const preview = await options.getDraftPreview?.(id.slice(CONTROL.length + 1));
    if (preview && typeof preview === 'object') return interaction.editReply({ ...preview, ...silent });
    text = preview || 'No reviewed draft is available.';
  } else {
    text = 'Unknown owner action.';
  }
  return interaction.editReply({ content: String(text).slice(0, 2000), ...silent });
}

export async function startDiscord(options) {
  const { client } = await connect(options, (client, afterVerification) => {
    // A fresh Gateway session needs its activity again, including after a reconnect.
    client.on(Events.ShardReady, shardId => afterVerification(() => {
      if (client.user?.id === AURUM_BOT_ID && client.user.bot) {
        client.user.setActivity('XAUUSD • Aurum Desk', { type: ActivityType.Watching, shardId });
      }
    }, () => console.error('Unable to set the Aurum Desk activity.')));
    client.on(Events.GuildMemberAdd, member => afterVerification(state => observeJoin(state, member, {
      welcome: state.setting('welcome-enabled','true') === 'true'
        ? () => member.send({ ...memberWelcome(state, member.id, options.hasTicketPanel?.()), ...silent }) : null,
      notifyOwner: async () => {
        const owner = await member.guild.fetchOwner();
        if (owner.id !== OWNER_ID) throw new Error('Owner identity changed.');
        return owner.send({ ...joinCard(member), ...silent });
      },
    }), () => console.error('Unable to record the Discord join event.')));
    client.on(Events.InteractionCreate, interaction => afterVerification(
      state => handleRulesButton(interaction, options, state, client),
      async () => {
        console.error('Aurum Desk could not complete a button action.');
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply('The action could not be confirmed. The owner can check the bot setup.').catch(() => {});
        }
      },
    ));
  });
  return client;
}
