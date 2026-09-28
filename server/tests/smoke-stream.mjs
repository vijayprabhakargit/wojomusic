// End-to-end: attested session -> getStreamUrl -> verify CDN URL plays (Range)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const yt = await import('../youtube.mjs');

const VIDEO = process.argv[2] || 'dQw4w9WgXcQ';

const info = await yt.getInfo(VIDEO);
console.log('info:', JSON.stringify(info).slice(0, 160));

const s = await yt.getStreamUrl(VIDEO);
console.log('mime:', s.mimeType, 'len:', s.contentLength);
console.log('url host:', new URL(s.url).host);
console.log('has pot:', new URL(s.url).searchParams.has('pot'));

const r = await fetch(s.url, { headers: { Range: 'bytes=0-1023' } });
console.log('CDN status:', r.status, r.headers.get('content-type'), 'range:', r.headers.get('content-range'));
const buf = await r.arrayBuffer();
console.log('bytes:', buf.byteLength);
process.exit(0);
