// ============================================================
// YouTube engine built on youtubei.js — stateful session + two-token PoToken
// ============================================================
// Why "Sign in to confirm you're not a bot" happens in production (Render)
// but not locally: Render's egress IPs are datacenter IPs. YouTube demands a
// Proof-of-Origin attestation for InnerTube requests made from such IPs.
// Locally (residential IP) requests succeed even without a token, which is
// why everything appears fine in dev and breaks in prod.
//
// What we do about it (mirrors Metrolist/Echo/tombulled/innertube patterns):
//
//   1. Create a session, read its ACTUAL visitorData.
//   2. Mint a SESSION-BOUND PoToken bound to that exact visitorData.
//   3. Recreate Innertube with { visitor_data, po_token } so the whole
//      session is attested AND every deciphered googlevideo URL carries
//      `pot=` (Player.po_token).
//   4. Keep CONTENT-BOUND tokens (video id) for WEB-family clients.
//   5. Persist { visitorData, sessionToken } to disk so restarts/redeploys
//      reuse the same trusted identity instead of starting cold.
//   6. Rotate the identity (new visitorData + token, clear caches) when the
//      bot check fires, guarded by a cooldown.

import { Innertube, Platform, UniversalCache } from 'youtubei.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const poToken = require('./poToken.js');

// Optional logged-in cookie (YT_COOKIE env). A logged-in session bypasses
// the anonymous-session bot check that flags datacenter IPs. See
// YOUTUBE_INNERTUBE_RESEARCH.md (2026-09 Session). Kept module-level so
// identity rotation re-mints visitorData but PRESERVES the cookie.
const COOKIE = process.env.YT_COOKIE || '';
const { generatePoToken, mintSessionToken } = poToken;

// Provide the JS interpreter youtubei.js needs to decipher signed URLs.
Platform.shim.eval = async (data) => {
  return new Function(data.output)();
};

// Verbose diagnostics. Enable with YT_DEBUG=1 in the environment.
const DEBUG = /^(1|true|yes)$/i.test(process.env.YT_DEBUG || '');
// Ring buffer of recent debug lines so /api/yt-debug-info can return the
// exact trace of a real request (Render stdout is hard to correlate).
const debugLogBuf = [];
const DEBUG_LOG_CAP = 300;
function dbg(...args) {
  const line = new Date().toISOString() + ' ' + args.map(function (a) {
    return typeof a === 'string' ? a : JSON.stringify(a);
  }).join(' ');
  debugLogBuf.push(line);
  if (debugLogBuf.length > DEBUG_LOG_CAP) debugLogBuf.shift();
  if (DEBUG) console.log('[yt:dbg]', ...args);
}

/** Return a copy of the most recent debug lines. */
export function getDebugLog() {
  return debugLogBuf.slice();
}

/** Drop all buffered debug lines. */
export function clearDebugLog() {
  debugLogBuf.length = 0;
}

// Preferred client order. ANDROID_VR/IOS return direct (un-ciphered)
// streaming URLs; WEB clients are used as a fallback and are given a
// content-bound PoToken.
const CLIENT_ORDER = ['ANDROID_VR', 'IOS', 'WEB', 'YTMUSIC'];
const WEB_CLIENTS = new Set(['WEB', 'MWEB', 'YTMUSIC']);

// ---- Identity persistence (8.3) ----
const SESSION_FILE = process.env.YT_SESSION_FILE ||
  path.join(process.cwd(), '.yt-session.json');

function loadPersistedIdentity() {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.visitorData && data.sessionToken) {
      return data;
    }
  } catch (e) {
    /* no file / corrupt file — start cold */
  }
  return null;
}

function persistIdentity(idn) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(idn, null, 2));
    dbg('identity persisted to ' + SESSION_FILE);
  } catch (e) {
    dbg('identity persist failed: ' + e.message);
  }
}

// ---- Session state ----
let innertube = null;
let innertubePromise = null;
let identity = null; // { visitorData, sessionToken, createdAt }

// Circuit breaker: when YouTube bot-checks us, STOP hammering. A single
// failed walk fires 8-16 player calls; repeated storms deepen the IP flag.
const BOTCHECK_BREAKER_MS = 5 * 60 * 1000;
let botCheckUntil = 0;

// Cooldown so we do not rotation-storm when YouTube keeps flagging us.
const ROTATE_COOLDOWN_MS = 10 * 60 * 1000;
let lastRotationAt = 0;

/**
 * Create an Innertube instance for the given identity.
 * Passing `po_token` here is what sets Player.po_token (the `pot=` parameter
 * on deciphered CDN URLs) and attests the session itself.
 */
async function createInnertube(idn) {
  const opts = {
    cache: new UniversalCache(true),
    retrieve_player: true,
    generate_session_locally: false,
  };
  if (idn && idn.visitorData) opts.visitor_data = idn.visitorData;
  if (idn && idn.sessionToken) opts.po_token = idn.sessionToken;
  if (COOKIE) opts.cookie = COOKIE;
  return Innertube.create(opts);
}

/**
 * Build a fully attested identity:
 *   session -> actual visitorData -> session-bound token -> attested session.
 * Reuses the persisted identity when valid; otherwise bootstraps one.
 */
async function buildAttestedSession(saved) {
  if (saved && saved.visitorData && saved.sessionToken) {
    const yt = await createInnertube(saved);
    identity = saved;
    dbg('reused persisted identity (age ' +
      Math.round((Date.now() - (saved.createdAt || 0)) / 60000) + ' min)');
    return yt;
  }

  // Step 1: bootstrap session to obtain its ACTUAL visitorData.
  const bootstrap = await Innertube.create({
    cache: new UniversalCache(true),
    retrieve_player: false, // faster; this session is replaced below
    generate_session_locally: false,
  });
  const visitorData = bootstrap.session.context.client.visitorData;
  if (!visitorData) throw new Error('Session did not return visitorData');
  dbg('bootstrap visitorData: ' + visitorData.slice(0, 24) + '...');

  // Step 2: mint a session-bound token from that EXACT visitorData.
  const sessionToken = await mintSessionToken(visitorData, fetch);
  if (!sessionToken) {
    dbg('session-bound token mint FAILED — proceeding unattested');
    const yt = await createInnertube({ visitorData });
    identity = { visitorData, sessionToken: null, createdAt: Date.now() };
    return yt;
  }

  // Step 3: recreate the session, attested.
  const attested = { visitorData, sessionToken, createdAt: Date.now() };
  const yt = await createInnertube(attested);
  identity = attested;
  persistIdentity(attested);
  dbg('attested session created (token len=' + sessionToken.length + ')');
  return yt;
}

async function getInnertube() {
  if (innertube) return innertube;
  if (innertubePromise) return innertubePromise;
  innertubePromise = (async () => {
    const saved = loadPersistedIdentity();
    innertube = await buildAttestedSession(saved);
    return innertube;
  })().catch((e) => {
    innertubePromise = null; // allow retry on next call
    throw e;
  });
  return innertubePromise;
}

// ---- Identity rotation (8.4) ----
const rotationListeners = [];
export function onIdentityRotation(fn) {
  rotationListeners.push(fn);
}

export async function rotateIdentity(reason) {
  const now = Date.now();
  if (now - lastRotationAt < ROTATE_COOLDOWN_MS) {
    dbg('rotation skipped (cooldown): ' + reason);
    return false;
  }
  lastRotationAt = now;
  console.warn('[~] Rotating YouTube identity: ' + reason);

  innertube = null;
  identity = null;
  innertubePromise = null;
  poToken.reset(); // force a fresh BotGuard integrity token
  try { fs.unlinkSync(SESSION_FILE); } catch (e) { /* no file yet */ }

  try {
    innertube = await buildAttestedSession(null);
    for (const fn of rotationListeners) {
      try { fn(); } catch (e) { /* listener error is non-fatal */ }
    }
    return true;
  } catch (e) {
    console.error('[~] Identity rotation failed: ' + e.message);
    return false;
  }
}

function pickThumbnail(basic) {
  const thumb = basic.thumbnail || [];
  if (!thumb.length) return '';
  let best = thumb[0];
  for (const t of thumb) {
    if ((t.width || 0) > (best.width || 0)) best = t;
  }
  return best.url || '';
}

async function buildOptions(client, videoId) {
  const opts = { client };
  if (WEB_CLIENTS.has(client)) {
    try {
      const token = await generatePoToken(videoId, fetch);
      if (token) {
        opts.po_token = token;
        dbg(`${client}: content PoToken attached (len=${token.length})`);
      } else {
        dbg(`${client}: content PoToken UNAVAILABLE`);
      }
    } catch (e) {
      dbg(`${client}: PoToken error: ${e.message}`);
    }
  }
  return opts;
}

function statusOf(info) {
  const ps = info && info.playability_status;
  return { status: ps && ps.status, reason: ps && ps.reason };
}

// Statuses that retrying the same client will not fix.
const HARD_BLOCK = new Set(['LOGIN_REQUIRED', 'UNPLAYABLE', 'ERROR']);

/**
 * Walk CLIENT_ORDER, calling handler(info, client) on the first client that
 * returns status OK. On a bot check (LOGIN_REQUIRED), rotates the identity
 * once and retries the whole walk. handler throws to signal "try the next
 * client", or returns a value to stop with success.
 */
async function forEachClient(videoId, handler, { allowRotate = true } = {}) {
  if (Date.now() < botCheckUntil) {
    throw new Error('YouTube bot-check breaker active: retry in ' +
      Math.ceil((botCheckUntil - Date.now()) / 60000) + ' min' +
      (COOKIE ? '' : ' (or set YT_COOKIE to use a logged-in session)'));
  }
  const yt = await getInnertube();
  let lastError = null;
  const seen = [];
  let sawBotCheck = false;

  for (const client of CLIENT_ORDER) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const info = await yt.getBasicInfo(videoId, await buildOptions(client, videoId));
        const { status, reason } = statusOf(info);
        seen.push(`${client}=${status}`);
        dbg(`${client} attempt ${attempt + 1}: ${status}${reason ? ' :: ' + reason : ''}`);
        if (status !== 'OK') {
          if (status === 'LOGIN_REQUIRED') sawBotCheck = true;
          lastError = new Error(reason || 'Status: ' + status);
          if (HARD_BLOCK.has(status)) break; // retrying won't help
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }

        const result = await handler(info, client);
        if (result !== undefined) return result;
        lastError = new Error('No usable result from client ' + client);
      } catch (e) {
        dbg(`${client} attempt ${attempt + 1}: threw ${e.message}`);
        lastError = e;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  dbg('all clients failed ->', seen.join(', '));

  if (sawBotCheck) {
    botCheckUntil = Date.now() + BOTCHECK_BREAKER_MS;
    console.warn('[~] YouTube bot check: breaker engaged for ' +
      (BOTCHECK_BREAKER_MS / 60000) + ' min' + (COOKIE ? '' : ' (no YT_COOKIE set)'));
  }

  // Bot check fired: rotate identity once and retry the whole walk.
  if (sawBotCheck && allowRotate) {
    const rotated = await rotateIdentity('bot check (LOGIN_REQUIRED) for ' + videoId);
    if (rotated) {
      return forEachClient(videoId, handler, { allowRotate: false });
    }
  }

  throw lastError || new Error('YouTube request failed');
}

/**
 * Fetch video metadata.
 * @returns {Promise<{title:string,duration:number,thumbnail:string,videoId:string}>}
 */
export async function getInfo(videoId) {
  return forEachClient(videoId, (info) => {
    const b = info.basic_info || {};
    return {
      title: b.title || 'Unknown Title',
      duration: b.duration || 0,
      thumbnail: pickThumbnail(b),
      videoId: videoId,
    };
  });
}

/**
 * Resolve a playable audio stream URL.
 * @returns {Promise<{url:string,mimeType:string,contentLength:number|null,videoId:string}>}
 */
export async function getStreamUrl(videoId) {
  const yt = await getInnertube();
  return forEachClient(videoId, async (info, client) => {
    let format;
    try {
      format = info.chooseFormat({ type: 'audio', quality: 'best' });
    } catch (e) {
      throw new Error('No audio format for ' + client + ': ' + e.message);
    }
    if (!format) throw new Error('No audio format available for ' + client);

    const url = await format.decipher(yt.session.player);
    if (!url) throw new Error('Could not decipher stream URL for ' + client);

    return {
      url: url,
      mimeType: format.mime_type || 'audio/webm',
      contentLength: format.content_length || null,
      videoId: videoId,
    };
  });
}

/** Current session identity info (for diagnostics; token redacted). */
export function identityInfo() {
  if (!identity) return null;
  return {
    cookieAuth: !!COOKIE,
    visitorDataPreview: identity.visitorData.slice(0, 24) + '...',
    hasSessionToken: !!identity.sessionToken,
    sessionTokenLength: identity.sessionToken ? identity.sessionToken.length : 0,
    createdAt: identity.createdAt || null,
    ageMinutes: identity.createdAt
      ? Math.round((Date.now() - identity.createdAt) / 60000)
      : null,
    sessionFile: SESSION_FILE,
  };
}

/** Warm up the session (and PoToken pipeline) ahead of time. */
export async function warmUp() {
  try {
    await getInnertube();
    await generatePoToken('warmup', fetch);
    return true;
  } catch (e) {
    dbg('warm-up failed: ' + e.message);
    return false;
  }
}

/**
 * Diagnostic matrix (8.6): probes clients with/without tokens, reports
 * egress IP plus identity state. Used by /api/yt-debug.
 */
export async function diagnose(videoId, opts) {
  const yt = await getInnertube();
  const DEFAULT_CLIENTS = ['WEB', 'YTMUSIC', 'TV', 'ANDROID', 'ANDROID_VR', 'IOS', 'WEB_EMBEDDED', 'TV_EMBEDDED'];
  const CLIENTS = opts && Array.isArray(opts.clients) && opts.clients.length
    ? opts.clients
    : DEFAULT_CLIENTS;

  let egressIp = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    egressIp = (await r.json()).ip;
  } catch (e) {
    /* non-fatal */
  }

  let tokenTest = null;
  try {
    const t = await generatePoToken(videoId, fetch);
    tokenTest = t ? { ok: true, length: t.length } : { ok: false, error: 'returned null' };
  } catch (e) {
    tokenTest = { ok: false, error: e.message };
  }

  const results = [];
  for (const client of CLIENTS) {
    for (const mode of ['no-token', 'with-token']) {
      try {
        const opts = { client };
        if (mode === 'with-token') {
          const tok = await generatePoToken(videoId, fetch);
          if (!tok) {
            results.push({ client, mode, status: 'TOKEN_NULL' });
            continue;
          }
          opts.po_token = tok;
        }
        const info = await yt.getBasicInfo(videoId, opts);
        const { status, reason } = statusOf(info);
        results.push({ client, mode, status, reason: reason || null });
      } catch (e) {
        results.push({ client, mode, status: 'THREW', reason: e.message });
      }
    }
  }

  return {
    videoId,
    egressIp,
    identity: identityInfo(),
    poTokenMinter: poToken.status(),
    poToken: tokenTest,
    results,
  };
}

export default { getInfo, getStreamUrl, warmUp, diagnose, rotateIdentity, identityInfo, getDebugLog, clearDebugLog };
