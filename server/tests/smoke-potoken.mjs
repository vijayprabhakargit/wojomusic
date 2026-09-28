// Smoke test: mint session-bound + content-bound tokens, then probe clients.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const poToken = require('../poToken.js');

const VIDEO = process.argv[2] || 'dQw4w9WgXcQ';

console.log('--- 1. warm up BotGuard minter ---');
const warm = await poToken.warmUp(globalThis.fetch);
console.log('warmUp ok:', warm, 'status:', JSON.stringify(poToken.status()));

console.log('--- 2. mint content-bound token for', VIDEO, '---');
const t = await poToken.generatePoToken(VIDEO, globalThis.fetch);
console.log('content token length:', t ? t.length : 'NULL');

console.log('--- 3. probe clients via youtubei.js diagnose ---');
const yt = await import('../youtube.mjs');
const d = await yt.diagnose(VIDEO);
console.log('egress IP:', d.egressIp);
console.log('identity:', JSON.stringify(d.identity));
console.log('minter:', JSON.stringify(d.poTokenMinter));
for (const r of d.results) {
  console.log(`  ${r.client.padEnd(12)} ${r.mode.padEnd(12)} ${r.status}  ${r.reason || ''}`);
}
process.exit(0);

