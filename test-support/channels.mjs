import { createHash } from 'node:crypto';
import { bindTradingChannels, channelPins, GUILD_ID, OWNER_ID } from '../src/onboarding.mjs';

export function bindFixtureChannels() {
  const channels = new Map();
  const pins = {};
  for (const [index, key] of Object.keys(channelPins).entries()) {
    const id = String(900000000000000000n + BigInt(index));
    channels.set(id, { id, guildId: GUILD_ID, type: 0 });
    pins[key] = createHash('sha256').update(id).digest('hex');
  }
  bindTradingChannels({ id: GUILD_ID, ownerId: OWNER_ID, available: true }, channels, pins);
  return { channels, pins };
}
