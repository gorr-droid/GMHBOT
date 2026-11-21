import { resolve } from 'node:path';

const discordId = /^[1-9]\d{16,19}$/;

export function readConfig(env, base = process.cwd()) {
  const applicationId = env.AURUM_DISCORD_APPLICATION_ID?.trim();
  const token = env.BOT_TOKEN?.trim() || env.DISCORD_TOKEN?.trim();
  const memberRoleId = env.DISCORD_MEMBER_ROLE_ID?.trim() || undefined;

  if (applicationId && !discordId.test(applicationId)) {
    throw new Error('The optional AURUM_DISCORD_APPLICATION_ID must be the existing bot application ID.');
  }
  if (!token) {
    throw new Error('The existing host must provide BOT_TOKEN or DISCORD_TOKEN.');
  }
  if (memberRoleId && !discordId.test(memberRoleId)) {
    throw new Error('DISCORD_MEMBER_ROLE_ID must contain the existing Member role ID.');
  }

  return {
    applicationId, token, memberRoleId, telegramToken:env.AURUM_TELEGRAM_BOT_TOKEN?.trim(),
    dataDir: resolve(base, env.AURUM_DATA_DIR?.trim() || '.aurum-data')
  };
}
