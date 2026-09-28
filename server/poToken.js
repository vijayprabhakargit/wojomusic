// ============================================================
// PoToken (Proof of Origin Token) generation via BotGuard
// ============================================================
// Two distinct kinds of token are required (see YOUTUBE_INNERTUBE_RESEARCH.md,
// "Two-token architecture"):
//
//   1. SESSION-BOUND token  -> minted with contentBinding = visitorData
//      Passed to Innertube.create({ po_token }). This attests the whole
//      session; youtubei.js also stamps it as Player.po_token, which becomes
//      the `pot=` query parameter on every deciphered googlevideo URL — and
//      GVS rejects/403s URLs lacking `pot=` when requested from datacenter
//      IPs (Render egress).
//
//   2. CONTENT-BOUND token  -> minted with contentBinding = <video id>
//      Passed per-request via getBasicInfo(id, { po_token }) for WEB clients.
//
// Pipeline (bgutils-js — the same one Metrolist/Echo/InnerTubeX follow):
//   fetch BotGuard challenge -> run interpreter -> snapshot -> exchange for
//   integrity token (WAA GenerateIT) -> WebPoMinter.mintAsWebsafeString(binding)
//
// bgutils-js is ESM-only, so we load it dynamically from CJS.

const { JSDOM } = require('jsdom');

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let bgModules = null; // { BotGuardClient, getChallenge, WebPoMinter, buildURL, getHeaders }

async function loadBgModules() {
  if (bgModules) return bgModules;
  const [botguard, webpo, utils] = await Promise.all([
    import('bgutils-js/botguard'),
    import('bgutils-js/webpo'),
    import('bgutils-js/utils'),
  ]);
  bgModules = {
    BotGuardClient: botguard.BotGuardClient,
    getChallenge: botguard.getChallenge,
    WebPoMinter: webpo.WebPoMinter,
    buildURL: utils.buildURL,
    getHeaders: utils.getHeaders,
  };
  return bgModules;
}

// jsdom provides the browser-like globals BotGuard expects.
let domReady = false;
function ensureDom() {
  if (domReady) return;
  const dom = new JSDOM('', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    userAgent: USER_AGENT,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  });
  if (!Reflect.has(globalThis, 'navigator')) {
    Object.defineProperty(globalThis, 'navigator', {
      value: dom.window.navigator,
      configurable: true,
    });
  }
  domReady = true;
}

// ---- Shared BotGuard minter (TTL-refreshed, rebuilt on failure) ----
let webPoMinter = null;
let minterExpiresAt = 0;
let mintingPromise = null;
const MINTER_SAFETY_MS = 15 * 60 * 1000;
const MINTER_MIN_TTL_MS = 60 * 1000;

function getFetch(fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') throw new Error('No fetch implementation available');
  return f;
}

// ---- Cached BotGuard resources ----
async function buildMinter(fetchImpl) {
  const { BotGuardClient, getChallenge, WebPoMinter, buildURL, getHeaders } =
    await loadBgModules();
  ensureDom();

  const challenge = await getChallenge({
    fetchFunction: fetchImpl,
    requestKey: REQUEST_KEY,
  });
  const interpreterJavascript =
    challenge.interpreterJavascript &&
    challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;

  if (!interpreterJavascript) {
    throw new Error('BotGuard interpreter javascript unavailable');
  }
  new Function(interpreterJavascript)();

  const botGuardClient = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });

  const webPoSignalOutput = [];
  const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });

  const payload = [REQUEST_KEY, botguardResponse];
  const itResp = await fetchImpl(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const itData = await itResp.json();
  const integrityToken = itData[0];
  const estimatedTtlSecs = itData[1];

  webPoMinter = await WebPoMinter.create(
    {
      integrityToken: integrityToken,
      estimatedTtlSecs: itData[1],
      mintRefreshThreshold: itData[2],
      websafeFallbackToken: itData[3],
    },
    webPoSignalOutput
  );

  const ttlMs = (estimatedTtlSecs || 3600) * 1000;
  minterExpiresAt = Date.now() + Math.max(ttlMs - MINTER_SAFETY_MS, 60 * 1000);
  return webPoMinter;
}

/**
 * Get a live minter. Concurrency-safe (single flight) and self-healing:
 * any mint failure invalidates the minter and forces a rebuild next call.
 */
async function getMinter(fetchImpl) {
  const f = getFetch(fetchImpl);
  if (webPoMinter && Date.now() < minterExpiresAt) return webPoMinter;
  if (mintingPromise) return mintingPromise;
  mintingPromise = (async () => {
    try {
      return await buildMinter(f);
    } finally {
      mintingPromise = null;
    }
  })();
  return mintingPromise;
}

function invalidateMinter() {
  webPoMinter = null;
  minterExpiresAt = 0;
  mintingPromise = null;
}

/**
 * Mint a WebPO token bound to the given binding string.
 * @param {string} contentBinding - visitorData (session-bound) or video id (content-bound)
 * @param {Function} [fetchImpl]
 * @returns {Promise<string|null>}
 */
async function generatePoToken(contentBinding, fetchImpl) {
  if (!contentBinding) return null;
  try {
    const f = getFetch(fetchImpl);
    const minter = await getMinter(f);
    const token = await minter.mintAsWebsafeString(contentBinding);
    return token || null;
  } catch (err) {
    invalidateMinter();
    console.error('[~] PoToken generation failed: ' + err.message);
    return null;
  }
}

/**
 * Mint a SESSION-BOUND token from the session's actual visitorData.
 * This is the token that must be fed to Innertube.create({ po_token }).
 */
function mintSessionToken(visitorData, fetchImpl) {
  return generatePoToken(visitorData, fetchImpl);
}

/** Mint a CONTENT-BOUND token for a specific video id (WEB-family clients). */
function mintContentToken(videoId, fetchImpl) {
  return generatePoToken(videoId, fetchImpl);
}

/** Warm up the BotGuard/minter pipeline ahead of time. */
async function warmUp(fetchImpl) {
  return generatePoToken('warmup', fetchImpl);
}

/** Force a fresh integrity token on the next mint (used after a flag/403). */
function reset() {
  invalidateMinter();
}

function status() {
  return {
    minterReady: !!webPoMinter,
    expiresAt: minterExpiresAt,
    expiresInSeconds: minterExpiresAt > 0 ? Math.round((minterExpiresAt - Date.now()) / 1000) : 0,
  };
}

module.exports = { generatePoToken, mintSessionToken, mintContentToken, warmUp, reset, status };

