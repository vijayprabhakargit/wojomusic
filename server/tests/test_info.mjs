import { getInfo, getStreamUrl } from '../youtube.mjs';

const VIDEO_ID = process.argv[2] || 'dQw4w9WgXcQ';

(async () => {
  try {
    console.log('--- getInfo ---');
    const info = await getInfo(VIDEO_ID);
    console.log('OK:', JSON.stringify(info));
  } catch (e) {
    console.log('getInfo FAILED:', e.message);
  }
  try {
    console.log('--- getStreamUrl ---');
    const s = await getStreamUrl(VIDEO_ID);
    console.log('OK url.len=', s.url.length, 'mime=', s.mimeType);
  } catch (e) {
    console.log('getStreamUrl FAILED:', e.message);
  }
  process.exit(0);
})();
