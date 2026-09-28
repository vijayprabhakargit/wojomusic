// Diagnostic: test each client with/without PoToken for a known video.
import { Innertube, Platform, UniversalCache } from 'youtubei.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generatePoToken } = require('../poToken.js');

Platform.shim.eval = async (data) => new Function(data.output)();

const VIDEO_ID = process.argv[2] || 'dQw4w9WgXcQ';
const CLIENTS = ['WEB', 'YTMUSIC', 'TV', 'TV_SIMPLY', 'ANDROID', 'ANDROID_VR', 'IOS', 'MWEB'];

async function makeSession(visitorData) {
  return Innertube.create({
    cache: new UniversalCache(true),
    retrieve_player: true,
    generate_session_locally: false,
    visitor_data: visitorData || undefined,
  });
}

(async () => {
  console.log('youtubei.js session creating...');
  let yt;
  try {
    yt = await makeSession();
    console.log('session OK; visitor_data =', (yt.session.context.client.visitorData || '').slice(0, 20));
  } catch (e) {
    console.error('session FAILED:', e.message);
    process.exit(1);
  }

  for (const client of CLIENTS) {
    for (const mode of ['no-token', 'with-token']) {
      try {
        const opts = { client };
        if (mode === 'with-token') {
          const tok = await generatePoToken(VIDEO_ID, fetch);
          if (!tok) { console.log(`${client} [${mode}] token=null (skip)`); continue; }
          opts.po_token = tok;
        }
        const info = await yt.getBasicInfo(VIDEO_ID, opts);
        const st = info.playability_status?.status;
        const reason = info.playability_status?.reason;
        console.log(`${client} [${mode}] -> ${st}${reason ? ' :: ' + reason : ''}`);
      } catch (e) {
        console.log(`${client} [${mode}] -> ERROR: ${e.message}`);
      }
    }
  }
  process.exit(0);
})();

