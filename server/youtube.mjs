// ============================================================
// YouTube engine built on youtubei.js
// ============================================================
// youtubei.js handles the things our hand-rolled InnerTube code
// got wrong: keeping client configs current, maintaining a proper
// visitor-data session, retries, and PoTokens.
//
// We provide a JS interpreter (Platform.shim.eval) so clients whose
// streaming URLs are signature-ciphered (WEB/YTMUSIC) can be
// deciphered. Clients like ANDROID_VR and IOS return direct URLs and
// need no interpreter at all.

import { Innertube, Platform, UniversalCache } from 'youtubei.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generatePoToken } = require('./poToken.js');

// Provide the JS interpreter youtubei.js needs to decipher signed URLs.
Platform.shim.eval = async (data) => {
  return new Function(data.output)();
};

// Preferred client order. ANDROID_VR/IOS return direct (un-ciphered)
// streaming URLs and rarely demand a PoToken, so they go first. WEB
// clients are used as a fallback and are given a content-bound PoToken.
const CLIENT_ORDER = ['ANDROID_VR', 'IOS', 'WEB_REMIX', 'WEB', 'TV'];
const WEB_CLIENTS = new Set(['WEB', 'WEB_REMIX', 'YTMUSIC', 'TV']);

const UA_WEB =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let innertube = null;
let innertubePromise = null;

// ---- Visitor data (shared, cached) ----
let cachedVisitorData = null;
let visitorDataExpires = 0;
const VISITOR_DATA_TTL = 30 * 60 * 1000;

async function fetchVisitorData() {
  if (cachedVisitorData && Date.now() < visitorDataExpires) return cachedVisitorData;
  try {
    const resp = await fetch('https://www.youtube.com', {
      headers: { 'User-Agent': UA_WEB, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const html = await resp.text();
    const m = html.match(/"(?:VISITOR_DATA|visitorData)"\s*:\s*"([^"]+)"/);
    if (m) {
      cachedVisitorData = m[1];
      visitorDataExpires = Date.now() + VISITOR_DATA_TTL;
      return cachedVisitorData;
    }
  } catch (e) {
    /* non-fatal */
  }
  return null;
}

async function getInnertube() {
  if (innertube) return innertube;
  if (innertubePromise) return innertubePromise;
  innertubePromise = (async () => {
    const visitorData = await fetchVisitorData();
    innertube = await Innertube.create({
      cache: new UniversalCache(true),
      retrieve_player: true,
      generate_session_locally: false,
      visitor_data: visitorData || undefined,
    });
    return innertube;
  })();
  return innertubePromise;
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
      if (token) opts.po_token = token;
    } catch (e) {
      /* non-fatal */
    }
  }
  return opts;
}

/**
 * Fetch video metadata.
 * @returns {Promise<{title:string,duration:number,thumbnail:string,videoId:string}>}
 */
export async function getInfo(videoId) {
  const yt = await getInnertube();
  let lastError = null;

  for (const client of CLIENT_ORDER) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const info = await yt.getBasicInfo(videoId, await buildOptions(client, videoId));
        const status = info.playability_status && info.playability_status.status;
        if (status === 'OK' && info.basic_info) {
          const b = info.basic_info;
          return {
            title: b.title || 'Unknown Title',
            duration: b.duration || 0,
            thumbnail: pickThumbnail(b),
            videoId: videoId,
          };
        }
        lastError = new Error(
          (info.playability_status && info.playability_status.reason) || 'Status: ' + status
        );
        if (status === 'LOGIN_REQUIRED' || status === 'UNPLAYABLE' || status === 'ERROR') break;
      } catch (e) {
        lastError = e;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  throw lastError || new Error('Could not fetch video info');
}

/**
 * Resolve a playable audio stream URL.
 * @returns {Promise<{url:string,mimeType:string,contentLength:number|null,videoId:string}>}
 */
export async function getStreamUrl(videoId) {
  const yt = await getInnertube();
  let lastError = null;

  for (const client of CLIENT_ORDER) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const info = await yt.getBasicInfo(videoId, await buildOptions(client, videoId));
        const status = info.playability_status && info.playability_status.status;
        if (status !== 'OK') {
          lastError = new Error(
            (info.playability_status && info.playability_status.reason) || 'Status: ' + status
          );
          if (status === 'LOGIN_REQUIRED' || status === 'UNPLAYABLE' || status === 'ERROR') break;
          continue;
        }
        const format = info.chooseFormat({ type: 'audio', quality: 'best' });
        if (!format) {
          lastError = new Error('No audio format available');
          break;
        }
        const url = await format.decipher(yt.session.player);
        if (!url) {
          lastError = new Error('Could not decipher stream URL');
          continue;
        }
        return {
          url: url,
          mimeType: format.mime_type || 'audio/webm',
          contentLength: format.content_length || null,
          videoId: videoId,
        };
      } catch (e) {
        lastError = e;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  throw lastError || new Error('Could not resolve stream URL');
}

/** Warm up the session (and PoToken pipeline) ahead of time. */
export async function warmUp() {
  try {
    await getInnertube();
    await generatePoToken('warmup', fetch);
    return true;
  } catch (e) {
    return false;
  }
}

export default { getInfo, getStreamUrl, warmUp };
