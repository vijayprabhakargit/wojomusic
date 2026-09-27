// ============================================================
// PoToken (Proof of Origin Token) generation via BotGuard
// ============================================================
// YouTube requires a PO token for most clients now. Without it,
// requests are flagged with "Sign in to confirm you're not a bot".
// This mirrors how Metrolist / Echo Music / InnerTubeX generate tokens:
//
//   1. Fetch the BotGuard challenge (interpreter + program)
//   2. Execute the interpreter JS to expose the BotGuard VM
//   3. Load the program and take a "snapshot" -> botguardResponse
//   4. Exchange botguardResponse for an integrity token (WAA API)
//   5. Mint a WebPO token bound to the visitor/video id
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

// ---- Cached BotGuard resources ----
let webPoMinter = null;
let minterExpiresAt = 0;
const MINTER_SAFETY_MS = 15 * 60 * 1000;

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

async function getMinter(fetchImpl) {
  if (webPoMinter && Date.now() < minterExpiresAt) return webPoMinter;
  return buildMinter(fetchImpl);
}

/**
 * Mint a content-bound WebPO token for the given content binding.
 * @param {string} contentBinding - usually visitor data or video id
 * @param {Function} [fetchImpl]
 * @returns {Promise<string|null>}
 */
async function generatePoToken(contentBinding, fetchImpl) {
  if (!contentBinding) return null;
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') throw new Error('No fetch implementation available');
  try {
    const minter = await getMinter(f);
    const token = await minter.mintAsWebsafeString(contentBinding);
    return token || null;
  } catch (err) {
    webPoMinter = null;
    minterExpiresAt = 0;
    console.error('[~] PoToken generation failed: ' + err.message);
    return null;
  }
}

/** Warm up the BotGuard/minter pipeline ahead of time. */
async function warmUp(fetchImpl) {
  return generatePoToken('warmup', fetchImpl);
}

module.exports = { generatePoToken, warmUp };
