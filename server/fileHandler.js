const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { URLSearchParams } = require('url');

// YouTube InnerTube API - Multi-client with signature support
const YT_BASE = 'https://www.youtube.com/youtubei/v1/';

// API Keys
const API_KEYS = {
  IOS: 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3',
  ANDROID: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
};

// Client configurations based on InnerTubeX research
const CLIENTS = {
  ANDROID_VR: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.65.10',
    clientId: '28',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    origin: 'https://www.youtube.com',
    apiKey: API_KEYS.ANDROID,
    payload: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.65.10',
        hl: 'en',
        gl: 'US',
        osName: 'Android',
        osVersion: '12L',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: '32',
        platform: 'MOBILE',
        clientFormFactor: 'UNKNOWN_FORM_FACTOR',
      },
    },
  },
  ANDROID_VR_OLD: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.43.32',
    clientId: '28',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)',
    origin: 'https://www.youtube.com',
    apiKey: API_KEYS.ANDROID,
    payload: {
      client: {
        clientName: 'ANDROID_VR', clientVersion: '1.43.32',
        hl: 'en', gl: 'US',
        osName: 'Android', osVersion: '12',
        deviceMake: 'Oculus', deviceModel: 'Quest 3',
        androidSdkVersion: '32',
        platform: 'MOBILE',
        clientFormFactor: 'UNKNOWN_FORM_FACTOR',
      },
    },
  },
  VISIONOS: {
    clientName: 'VISIONOS',
    clientVersion: '1.02',
    clientId: '101',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    origin: 'https://music.youtube.com',
    apiKey: API_KEYS.IOS,
    payload: {
      client: {
        clientName: 'VISIONOS', clientVersion: '1.02',
        hl: 'en', gl: 'US',
        osName: 'visionOS', osVersion: '26.5.23O471',
        deviceMake: 'Apple', deviceModel: 'RealityDevice17,1',
        platform: 'MOBILE',
        clientFormFactor: 'UNKNOWN_FORM_FACTOR',
      },
      thirdParty: {},
    },
  },
  IOS: {
    clientName: 'IOS',
    clientVersion: '21.26.4',
    clientId: '5',
    userAgent: 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    origin: 'https://www.youtube.com',
    apiKey: API_KEYS.IOS,
    payload: {
      client: {
        clientName: 'IOS', clientVersion: '21.26.4',
        hl: 'en', gl: 'US',
        osName: 'iPhone', osVersion: '18.3.2.22D82',
        deviceMake: 'Apple', deviceModel: 'iPhone16,2',
        platform: 'MOBILE',
        clientFormFactor: 'UNKNOWN_FORM_FACTOR',
      },
    },
  },
  ANDROID: {
    clientName: 'ANDROID',
    clientVersion: '21.26.364',
    clientId: '3',
    userAgent: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
    origin: 'https://www.youtube.com',
    apiKey: API_KEYS.ANDROID,
    payload: {
      client: {
        clientName: 'ANDROID', clientVersion: '21.26.364',
        hl: 'en', gl: 'US',
        osName: 'Android', osVersion: '11',
        androidSdkVersion: '30',
        platform: 'MOBILE',
        clientFormFactor: 'UNKNOWN_FORM_FACTOR',
      },
    },
  },
};

const CLIENT_ORDER = ['ANDROID_VR', 'ANDROID_VR_OLD', 'VISIONOS', 'IOS', 'ANDROID'];

// Visitor Data Cache
let cachedVisitorData = null;
let visitorDataExpires = 0;
const VISITOR_DATA_TTL = 30 * 60 * 1000;

async function fetchVisitorData() {
  if (cachedVisitorData && Date.now() < visitorDataExpires) {
    return cachedVisitorData;
  }
  try {
    const resp = await axios.get('https://www.youtube.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 10000,
      maxRedirects: 5,
    });
    const html = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    const match = html.match(/"(?:VISITOR_DATA|visitorData)"\s*:\s*"([^"]+)"/);
    if (match) {
      cachedVisitorData = match[1];
      visitorDataExpires = Date.now() + VISITOR_DATA_TTL;
      return cachedVisitorData;
    }
    const altMatch = html.match(/ytcfg\.set\s*\(\s*{[^}]*"VISITOR_DATA"\s*:\s*"([^"]+)"/);
    if (altMatch) {
      cachedVisitorData = altMatch[1];
      visitorDataExpires = Date.now() + VISITOR_DATA_TTL;
      return cachedVisitorData;
    }
  } catch (e) {
    // Silently fail
  }
  return null;
}

// InnerTube Player Request with Multi-Client Fallback
async function innerTubePlayer(videoId, retries = 2) {
  let lastError = null;

  for (const clientName of CLIENT_ORDER) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const client = CLIENTS[clientName];
        const visitorData = await fetchVisitorData();

        const payload = {
          context: {
            client: Object.assign({}, client.payload.client, {
              visitorData: visitorData || undefined,
            }),
            user: { lockedSafetyMode: false },
            request: {
              useSsl: true,
              internalExperimentFlags: [],
              consistencyTokenJars: [],
            },
          },
          videoId,
          playbackContext: {
            contentPlaybackContext: {
              signatureTimestamp: 19400,
            },
          },
        };

        if (client.payload.thirdParty) {
          payload.context.thirdParty = client.payload.thirdParty;
        }

        const headers = {
          'Content-Type': 'application/json',
          'X-Goog-Api-Format-Version': '1',
          'X-YouTube-Client-Name': client.clientId,
          'X-YouTube-Client-Version': client.clientVersion,
          'Origin': client.origin,
          'Referer': client.origin + '/',
          'User-Agent': client.userAgent,
        };
        if (visitorData) {
          headers['X-Goog-Visitor-Id'] = visitorData;
        }

        const resp = await axios.post(
          YT_BASE + 'player?key=' + client.apiKey + '&prettyPrint=false',
          payload,
          { headers, timeout: 15000 }
        );

        const playabilityStatus = resp.data && resp.data.playabilityStatus;
        const status = playabilityStatus && playabilityStatus.status;

        if (status === 'OK') {
          return { data: resp.data, clientUsed: clientName };
        }

        if (status === 'UNPLAYABLE' || status === 'LOGIN_REQUIRED') {
          lastError = new Error((playabilityStatus && playabilityStatus.reason) || status + ' for ' + clientName);
          break;
        }

        lastError = new Error((playabilityStatus && playabilityStatus.reason) || 'Status: ' + status);
        if (attempt < retries) {
          await new Promise(function(r) { setTimeout(r, 500 * (attempt + 1)); });
        }
      } catch (e) {
        if (e.response && e.response.status === 400) {
          lastError = new Error('Bad request for ' + clientName + ': ' + e.message);
          break;
        }
        lastError = e;
        if (attempt < retries) {
          await new Promise(function(r) { setTimeout(r, 500 * (attempt + 1)); });
        }
      }
    }
  }

  throw lastError || new Error('Could not fetch video info with any client');
}

// Response Parsing
function extractVideoMeta(data) {
  const details = data.videoDetails || {};
  const thumbs = (details.thumbnail && details.thumbnail.thumbnails) || [];
  return {
    title: details.title || 'Unknown Title',
    duration: parseInt(details.lengthSeconds, 10) || 0,
    thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
    videoId: details.videoId || '',
    playabilityStatus: (data.playabilityStatus && data.playabilityStatus.status) || 'UNKNOWN',
    playabilityReason: (data.playabilityStatus && data.playabilityStatus.reason) || '',
  };
}

function extractBestAudioUrl(data) {
  const streamingData = data.streamingData;
  if (!streamingData) return null;

  const formats = streamingData.adaptiveFormats || [];

  const audioFormats = formats
    .filter(function(f) { return f.mimeType && f.mimeType.indexOf('audio') !== -1; })
    .map(function(f) {
      if (!f.url && f.signatureCipher) {
        const params = new URLSearchParams(f.signatureCipher);
        f.parsedUrl = params.get('url');
        f.signature = params.get('s');
        f.signatureParam = params.get('sp');
      } else {
        f.parsedUrl = f.url;
      }
      return f;
    })
    .filter(function(f) { return f.parsedUrl; })
    .sort(function(a, b) {
      const aCodec = a.mimeType.indexOf('opus') !== -1 ? 2 : a.mimeType.indexOf('mp4a') !== -1 ? 1 : 0;
      const bCodec = b.mimeType.indexOf('opus') !== -1 ? 2 : b.mimeType.indexOf('mp4a') !== -1 ? 1 : 0;
      if (aCodec !== bCodec) return bCodec - aCodec;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });

  if (audioFormats.length === 0) return null;

  const best = audioFormats[0];
  const result = {
    url: best.parsedUrl,
    mimeType: best.mimeType,
    bitrate: best.bitrate,
    contentLength: best.contentLength,
    ext: best.mimeType && best.mimeType.indexOf('opus') !== -1 ? 'webm' : 'm4a',
  };

  if (best.signature) {
    result.hasSignature = true;
    result.signature = best.signature;
    result.signatureParam = best.signatureParam || 'sig';
  }

  return result;
}

// Stream URL Cache
const streamUrlCache = new Map();
const STREAM_CACHE_TTL = 60 * 60 * 1000;

// FileHandler Class
class FileHandler {
  constructor(uploadsDir, maxFileSize) {
    this.uploadsDir = uploadsDir;
    this.maxFileSize = maxFileSize || 30 * 1024 * 1024;
    this.fileRegistry = new Map();
  }

  saveUploadedFile(roomId, fileBuffer, fileName, fileType) {
    if (fileBuffer.length > this.maxFileSize) {
      throw new Error('File too large. Maximum size is ' + this.formatBytes(this.maxFileSize));
    }
    const roomDir = path.join(this.uploadsDir, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    const sanitizedName = this.sanitizeFileName(fileName);
    const fileId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const ext = path.extname(sanitizedName) || '.mp3';
    const storedName = fileId + ext;
    const filePath = path.join(roomDir, storedName);
    fs.writeFileSync(filePath, fileBuffer);
    const publicUrl = '/uploads/' + roomId + '/' + storedName;
    const fileRecord = { id: fileId, fileName: sanitizedName, filePath: filePath, publicUrl: publicUrl, fileType: fileType || 'audio/mpeg', size: fileBuffer.length, addedAt: Date.now() };
    this._registerFile(roomId, fileRecord);
    return fileRecord;
  }

  async downloadFromGDrive(url, roomId, songId) {
    const directUrl = this._resolveDownloadUrl(url);
    const roomDir = path.join(this.uploadsDir, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    const storedName = songId + '.mp3';
    const filePath = path.join(roomDir, storedName);
    const publicUrl = '/uploads/' + roomId + '/' + storedName;
    if (fs.existsSync(filePath)) return { filePath: filePath, publicUrl: publicUrl };
    const response = await axios({ method: 'GET', url: directUrl, responseType: 'stream', timeout: 30000, maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const writer = fs.createWriteStream(filePath);
    let downloadedSize = 0;
    const self = this;
    return new Promise(function(resolve, reject) {
      response.data.on('data', function(chunk) {
        downloadedSize += chunk.length;
        if (downloadedSize > self.maxFileSize) {
          writer.destroy();
          try { fs.unlinkSync(filePath); } catch(e) {}
          reject(new Error('File too large'));
        }
      });
      writer.on('finish', function() { resolve({ filePath: filePath, publicUrl: publicUrl }); });
      writer.on('error', reject);
      response.data.pipe(writer);
    });
  }

  async getYoutubeInfo(url) {
    const videoId = this._extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const result = await innerTubePlayer(videoId);
    const meta = extractVideoMeta(result.data);
    if (meta.playabilityStatus !== 'OK') {
      throw new Error(meta.playabilityReason || 'Video unavailable');
    }
    return { title: meta.title, duration: meta.duration, thumbnail: meta.thumbnail };
  }

  async getYouTubeStreamUrl(videoId) {
    const cached = streamUrlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        url: cached.url,
        mimeType: cached.mimeType,
        contentLength: cached.contentLength,
        videoId: videoId,
      };
    }
    const result = await innerTubePlayer(videoId);
    const meta = extractVideoMeta(result.data);
    if (meta.playabilityStatus !== 'OK') {
      throw new Error(meta.playabilityReason || 'Video unavailable');
    }
    const audio = extractBestAudioUrl(result.data);
    if (!audio || !audio.url) {
      throw new Error('Could not get audio stream URL');
    }
    streamUrlCache.set(videoId, {
      url: audio.url,
      mimeType: audio.mimeType,
      contentLength: audio.contentLength,
      expiresAt: Date.now() + STREAM_CACHE_TTL,
    });
    return {
      url: audio.url,
      mimeType: audio.mimeType,
      contentLength: audio.contentLength,
      videoId: videoId,
    };
  }

  createYouTubeProxy() {
    return async function(req, res) {
      const videoId = req.params.videoId;
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
      }
      try {
        const stream = await this.getYouTubeStreamUrl(videoId);
        const rangeHeader = req.headers.range || 'bytes=0-';
        const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';
        const cdnResp = await axios({
          method: 'GET',
          url: stream.url,
          responseType: 'stream',
          timeout: 120000,
          headers: {
            'Range': rangeHeader,
            'User-Agent': userAgent,
            'Referer': 'https://www.youtube.com/',
          },
        });
        res.status(cdnResp.status);
        const contentHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        for (let i = 0; i < contentHeaders.length; i++) {
          const h = contentHeaders[i];
          if (cdnResp.headers[h]) res.setHeader(h, cdnResp.headers[h]);
        }
        cdnResp.data.pipe(res);
        cdnResp.data.on('error', function() {
          if (!res.headersSent) res.status(502).end();
          else res.end();
        });
      } catch (err) {
        console.error('[~] YouTube proxy error for ' + videoId + ': ' + err.message);
        if (!res.headersSent) res.status(502).json({ error: 'Stream unavailable' });
      }
    }.bind(this);
  }

  async downloadFromYoutube(url, roomId, songId) {
    const videoId = this._extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const streamInfo = await this.getYouTubeStreamUrl(videoId);
    return {
      filePath: null,
      publicUrl: '/api/youtube-audio/' + videoId,
      isYouTubeStream: true,
      videoId: videoId,
      mimeType: streamInfo.mimeType,
      contentLength: streamInfo.contentLength,
    };
  }

  _extractVideoId(url) {
    if (!url) return null;
    var patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = url.match(patterns[i]);
      if (match) return match[1];
    }
    return null;
  }

  _resolveDownloadUrl(url) {
    var patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /drive\/folders\/([a-zA-Z0-9_-]+)/];
    for (var i = 0; i < patterns.length; i++) {
      var m = url.match(patterns[i]);
      if (m) return 'https://drive.google.com/uc?export=download&id=' + m[1] + '&confirm=t';
    }
    if (url.indexOf('http') === 0) return url;
    throw new Error('Invalid Google Drive URL format');
  }

  cleanupFile(roomId, fileId) {
    var registry = this.fileRegistry.get(roomId) || [];
    var rec = registry.find(function(f) { return f.id === fileId; });
    if (rec && fs.existsSync(rec.filePath)) {
      try { fs.unlinkSync(rec.filePath); registry.splice(registry.indexOf(rec), 1); }
      catch (err) { console.error('Failed to cleanup file ' + fileId + ': ' + err.message); }
    }
  }

  cleanupRoomFiles(roomId) {
    var roomDir = path.join(this.uploadsDir, roomId);
    if (fs.existsSync(roomDir)) {
      try {
        fs.rmSync(roomDir, { recursive: true, force: true });
        this.fileRegistry.delete(roomId);
        console.log('[~] Cleaned up files for room ' + roomId);
      } catch (err) {
        console.error('Failed to cleanup room ' + roomId + ': ' + err.message);
      }
    }
  }

  _registerFile(roomId, fileRecord) {
    if (!this.fileRegistry.has(roomId)) this.fileRegistry.set(roomId, []);
    this.fileRegistry.get(roomId).push(fileRecord);
  }

  sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = FileHandler;
