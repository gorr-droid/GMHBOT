// Keep the original hosting entry point. Host-provided secrets take precedence.
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
await import('./src/main.mjs');
