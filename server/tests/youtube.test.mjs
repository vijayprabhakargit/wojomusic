#!/usr/bin/env node
// ============================================================
// Reusable YouTube engine test suite
// ============================================================
// Run with:  npm test                (all sections)
//            npm test -- --clients   (per-client playability matrix)
//            npm test -- --info      (getInfo across sample videos)
//            npm test -- --stream    (getStreamUrl + CDN range check)
//            npm test -- --proxy     (end-to-end against a running server)
//
// Options:
//   --video <id>     video id to use (default dQw4w9WgXcQ)
//   --base <url>     server base url for --proxy (default http://localhost:3001)
//
// These tests exercise the real engine (server/youtube.mjs), so they are
// the fastest way to confirm YouTube is not bot-blocking us.

import { Innertube, Platform, UniversalCache } from 'youtubei.js';
import { createRequire } from 'module';
import { getInfo, getStreamUrl } from '../youtube.mjs';

const require = createRequire(import.meta.url);
const { generatePoToken } = require('../poToken.js');

// youtubei.js needs this to decipher signature-ciphered URLs (WEB/YTMUSIC).
Platform.shim.eval = async (data) => new Function(data.output)();

// ---- args ----
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const VIDEO = opt('video', 'dQw4w9WgXcQ');
const BASE = opt('base', 'http://localhost:3001');
const runAll = !flag('clients') && !flag('info') && !flag('stream') && !flag('proxy');

// ---- tiny harness ----
let pass = 0;
let fail = 0;
const failures = [];

function log(msg) {
  console.log(msg);
}
function ok(name, extra) {
  pass++;
  console.log(`  \x1b[32mPASS\x1b[0m  ${name}${extra ? '  (' + extra + ')' : ''}`);
}
function bad(name, err) {
  fail++;
  failures.push(name + ': ' + (err && err.message ? err.message : err));
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name}  -> ${err && err.message ? err.message : err}`);
}
async function test(name, fn) {
  try {
    const extra = await fn();
    ok(name, typeof extra === 'string' ? extra : undefined);
  } catch (e) {
    bad(name, e);
  }
}
function section(title) {
  console.log(`\n\x1b[36m== ${title} ==\x1b[0m`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || 'not equal'} (got ${actual}, want ${expected})`);
}

const SAMPLE_VIDEOS = [
  'dQw4w9WgXcQ', // Rick Astley
  '9bZkp7q19f0', // Gangnam Style
  'kJQP7kiw5Fk', // Despacito
  'JGwWNGJdvx8', // Shape of You
  'fJ9rUzIMcZQ', // Bohemian Rhapsody
];

const CLIENTS = ['WEB', 'YTMUSIC', 'TV_SIMPLY', 'ANDROID', 'ANDROID_VR', 'IOS', 'MWEB'];

// ------------------------------------------------------------
// Section: session
// ------------------------------------------------------------
async function sectionSession() {
  section('Session');
  let yt;
  await test('Innertube.create()', async () => {
    yt = await Innertube.create({
      cache: new UniversalCache(true),
      retrieve_player: true,
      generate_session_locally: false,
    });
    assert(yt, 'no instance');
    return 'visitor=' + (yt.session.context.client.visitorData || '').slice(0, 18);
  });
  return yt;
}

// ------------------------------------------------------------
// Section: per-client playability matrix
// ------------------------------------------------------------
async function sectionClients(yt) {
  section('Client playability matrix (video ' + VIDEO + ')');
  for (const client of CLIENTS) {
    for (const mode of ['no-token', 'with-token']) {
      await test(`${client} [${mode}]`, async () => {
        const opts = { client };
        if (mode === 'with-token') {
          const tok = await generatePoToken(VIDEO, fetch);
          assert(tok, 'PoToken generation returned null');
          opts.po_token = tok;
        }
        const info = await yt.getBasicInfo(VIDEO, opts);
        const status = info.playability_status && info.playability_status.status;
        const reason = info.playability_status && info.playability_status.reason;
        assertEqual(status, 'OK', 'status ' + (reason ? reason : status));
        return 'OK';
      });
    }
  }
}

// ------------------------------------------------------------
// Section: getInfo
// ------------------------------------------------------------
async function sectionInfo() {
  section('getInfo (engine)');
  await test('single video metadata', async () => {
    const info = await getInfo(VIDEO);
    assert(info.title && info.title.length > 0, 'empty title');
    assert(info.videoId === VIDEO, 'videoId mismatch');
    return `"${info.title.slice(0, 34)}" ${info.duration}s`;
  });

  for (const id of SAMPLE_VIDEOS) {
    await test('getInfo ' + id, async () => {
      const info = await getInfo(id);
      assert(info.title, 'no title');
      return info.title.slice(0, 34);
    });
  }
}

// ------------------------------------------------------------
// Section: getStreamUrl + range download
// ------------------------------------------------------------
async function sectionStream() {
  section('getStreamUrl (engine)');
  let url = null;
  await test('resolve stream url', async () => {
    const s = await getStreamUrl(VIDEO);
    assert(s.url && s.url.startsWith('http'), 'bad url');
    assert(/^audio\//.test(s.mimeType || ''), 'not audio mime: ' + s.mimeType);
    url = s.url;
    return `mime=${s.mimeType} len=${s.url.length}`;
  });

  await test('CDN honours Range request', async () => {
    assert(url, 'no url from previous test');
    const resp = await fetch(url, {
      headers: { Range: 'bytes=0-4095', 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.youtube.com/' },
    });
    assertEqual(resp.status, 206, 'expected 206 Partial Content');
    const buf = Buffer.from(await resp.arrayBuffer());
    assertEqual(buf.length, 4096, 'byte count');
    const ct = resp.headers.get('content-type') || '';
    assert(/audio\//.test(ct), 'unexpected content-type: ' + ct);
    return `${buf.length} bytes, ${ct.split(';')[0]}`;
  });
}

// ------------------------------------------------------------
// Section: proxy (end-to-end, needs running server)
// ------------------------------------------------------------
async function sectionProxy() {
  section('Proxy (server ' + BASE + ')');
  await test('GET /api/youtube-audio/' + VIDEO, async () => {
    const resp = await fetch(`${BASE}/api/youtube-audio/${VIDEO}`, {
      headers: { Range: 'bytes=0-4095' },
    });
    assertEqual(resp.status, 206, 'expected 206');
    const ct = resp.headers.get('content-type') || '';
    assert(/audio\//.test(ct), 'proxy returned ' + ct + ' (is the server running new code?)');
    return ct.split(';')[0];
  });

  await test('invalid id rejected', async () => {
    const resp = await fetch(`${BASE}/api/youtube-audio/not-a-valid-id`);
    assertEqual(resp.status, 400, 'expected 400');
    return '400';
  });
}

// ------------------------------------------------------------
(async () => {
  console.log('\x1b[1mWojo Music - YouTube engine test suite\x1b[0m');
  console.log('node ' + process.version + ' | youtubei.js | video=' + VIDEO);

  try {
    if (runAll || flag('clients') || flag('info') || flag('stream')) {
      const yt = await sectionSession();
      if (runAll || flag('clients')) await sectionClients(yt);
      if (runAll || flag('info')) await sectionInfo();
      if (runAll || flag('stream')) await sectionStream();
    }
    if (runAll || flag('proxy')) await sectionProxy();
  } catch (e) {
    bad('suite crashed', e);
  }

  console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(fail ? 1 : 0);
})();
