import { readConfig } from './config.mjs';

async function main(command) {
  if (!['check-config', 'install-rules', 'start'].includes(command)) {
    throw new Error('Choose check-config, install-rules, or start.');
  }
  const options = readConfig(process.env);
  if (command === 'check-config') {
    console.log('Local configuration present. ' + (options.memberRoleId ? 'Member-role ID configured.' : 'Owner can configure Member access with !send-verify.'));
    return;
  }

  const { AURUM_BOT_ID, startDiscord, installRulesPanel, createRulesPanelInstaller } = await import('./discord.mjs');
  if (command === 'install-rules') {
    if (!options.memberRoleId) throw new Error('Set DISCORD_MEMBER_ROLE_ID before installing the rules panel.');
    const panel = await installRulesPanel(options);
    console.log('Rules panel ' + (panel.created ? 'created' : 'already available') + ' in start-here. Message ID: ' + panel.messageId);
    return;
  }

  const { installTicketHandlers } = await import('./tickets.mjs');
  const { createPublisher } = await import('./publisher.mjs');
  const { installOwnerControls } = await import('./owner-controls.mjs');
  const { OWNER_ID } = await import('./onboarding.mjs');
  let publisher, tickets, controls;
  const client = await startDiscord({
    ...options,
    hasTicketPanel: () => tickets?.hasPanel(),
    getStatus: () => publisher?.status(OWNER_ID),
    pausePosting: () => publisher?.pause(OWNER_ID),
    installHandlers: async (connectedClient, {guild, state}) => {
      tickets = installTicketHandlers(connectedClient, {guild, dataDir:options.dataDir});
      publisher = createPublisher({
        dataDir:options.dataDir, applicationId:connectedClient.user.id,
        getClient:()=>connectedClient, telegramToken:options.telegramToken,
      });
      // On upgrade, refresh only an existing, verified ticket panel in the bound start channel.
      // A missing panel is installed only when its owner uses the original setup command.
      if (connectedClient.user.id === AURUM_BOT_ID) {
        await tickets.refreshExistingPanel().catch(() => console.warn('Ticket panel refresh could not be confirmed; use !setup-tickets to retry.'));
      }
      controls = installOwnerControls(connectedClient, {guild, state, tickets, publisher,
        installRules: createRulesPanelInstaller(connectedClient, state, options)});
      publisher.start();
    },
    getDraftPreview: async (platform) => {
      if (!['telegram', 'discord'].includes(platform)) throw new Error('Unknown preview platform.');
      return (await publisher.preview(OWNER_ID, platform + '-plan')).message;
    }
  });
  console.log('Connected to Aurum Desk. Listening for new members.');
  let closing;
  const close = () => {
    if (!closing) closing = (async () => {
      await controls.close();
      await Promise.allSettled([tickets.close(), publisher.close()]);
      await client.destroy();
    })().catch(() => { console.error('Shutdown needs review.'); process.exitCode = 1; });
    return closing;
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

try {
  await main(process.argv[2] || 'start');
} catch (error) {
  // Discord errors may carry request metadata. Only print the message, scrubbing
  // the bot token in case it was included by an underlying dependency.
  let message = String(error?.message ?? 'Startup failed');
  for (const value of [process.env.BOT_TOKEN,process.env.DISCORD_TOKEN,process.env.AURUM_TELEGRAM_BOT_TOKEN]) {
    if (value?.trim()) message = message.replaceAll(value.trim(),'[redacted]');
  }
  console.error(message);
  process.exitCode = 1;
}
