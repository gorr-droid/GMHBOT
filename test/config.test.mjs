import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.mjs';

const config = {
  AURUM_DISCORD_APPLICATION_ID: '123456789012345678',
  BOT_TOKEN: 'test-only',
};

test('the existing application can welcome members without role management', () => {
  assert.equal(readConfig(config).memberRoleId, undefined);
});

test('both deployed legacy token names work without a new application ID', () => {
  assert.equal(readConfig({ DISCORD_TOKEN:'example' }).token,'example');
  assert.equal(readConfig({ BOT_TOKEN:'example2' }).token,'example2');
  assert.throws(() => readConfig({}), /BOT_TOKEN/);
});

test('optional rules acceptance requires an explicit role ID', () => {
  assert.throws(() => readConfig({ ...config, DISCORD_MEMBER_ROLE_ID: 'Member' }), /DISCORD_MEMBER_ROLE_ID/);
});
