const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ============================================================
// YouTube InnerTube API — IOS client works without bot detection
// ============================================================
const API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3';
const YT_BASE = 'https://www.youtube.com/youtubei/v1/';

const IOS_CLIENT = {
  clientName: 'IOS',
  clientVersion: '21.03.1',
  clientId: '5',
  userAgent: 'com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)',
  deviceMake: 'Apple',
  deviceModel: 'iPhone16,2',
  osName: 'iPhone',
  osVersion: '18.2.22C152',
};

async function innerTubePlayer(videoId) {
  const payload = {
    context: {
      client: {
        clientName: IOS_CLIENT.clientName,
        clientVersion: IOS_CLIENT.clientVersion,
        hl: 'en', gl: 'US',
        deviceMake: IOS_CLIENT.deviceMake,
        deviceModel: IOS_CLIENT.deviceModel,
        osName: IOS_CLIENT.osName,
        osVersion: IOS_CLIENT.osVersion,
      },
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: { signatureTimestamp: 19400 },
    },
  };

  const resp = await axios.post(
    `${YT_BASE}player?key=${API_KEY}&prettyPrint=false`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Format-Version': '1',
        'X-YouTube-Client-Name': IOS_CLIENT.clientId,
        'X-YouTube-Client-Version': IOS_CLIENT.clientVersion,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'User-Agent': IOS_CLIENT.userAgent,
      },
      timeout: 15000,
    }
  );
  return resp.data;
}

function extractVideoMeta(data) {
  const details = data.videoDetails || {};
  const thumbs = details.thumbnail?.thumbnails || [];
  const status = data.playabilityStatus?.status || 'UNKNOWN';
  return {
    title: details.title || 'Unknown Title',
    duration: parseInt(details.lengthSeconds, 10) || 0,
    thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
    videoId: details.videoId || '',
    playabilityStatus: status,
    playabilityReason: data.playabilityStatus?.reason || '',
  };
}

function extractBestAudioUrl(data) {
  const formats = data.streamingData?.adaptiveFormats || [];
  const audioFormats = formats
    .filter(f => f.mimeType?.includes('audio'))
    .sort((a, b) => {
      const aScore = a.mimeType?.includes('opus') ? 2 : a.mimeType?.includes('mp4a') ? 1 : 0;
      const bScore = b.mimeType?.includes('opus') ? 2 : b.mimeType?.includes('mp4a') ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });
  if (audioFormats.length === 0) return null;
  const best = audioFormats[0];
  return {
    url: best.url,
    mimeType: best.mimeType,
    bitrate: best.bitrate,
    contentLength: best.contentLength,
    ext: best.mimeType?.includes('opus') ? 'webm' : 'm4a',
  };
}

// Cache YouTube stream URLs (1 hour TTL)
const streamUrlCache = new Map();
const STREAM_CACHE_TTL = 60 * 60 * 1000;

class FileHandler {
  constructor(uploadsDir, maxFileSize = 30 * 1024 * 1024) {
    this.uploadsDir = uploadsDir;
    this.maxFileSize = maxFileSize;
    this.fileRegistry = new Map();
  }

  saveUploadedFile(roomId, fileBuffer, fileName, fileType) {
    if (fileBuffer.length > this.maxFileSize) {
      throw new Error(`File too large. Maximum size is ${this.formatBytes(this.maxFileSize)}`);
    }
    const roomDir = path.join(this.uploadsDir, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    const sanitizedName = this.sanitizeFileName(fileName);
    const fileId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const ext = path.extname(sanitizedName) || '.mp3';
    const storedName = `${fileId}${ext}`;
    const filePath = path.join(roomDir, storedName);
    fs.writeFileSync(filePath, fileBuffer);
    const publicUrl = `/uploads/${roomId}/${storedName}`;
    const fileRecord = { id: fileId, fileName: sanitizedName, filePath, publicUrl, fileType: fileType || 'audio/mpeg', size: fileBuffer.length, addedAt: Date.now() };
    this._registerFile(roomId, fileRecord);
    return fileRecord;
  }

  async downloadFromGDrive(url, roomId, songId) {
    const directUrl = this._resolveDownloadUrl(url);
    const roomDir = path.join(this.uploadsDir, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    const storedName = `${songId}.mp3`;
    const filePath = path.join(roomDir, storedName);
    const publicUrl = `/uploads/${roomId}/${storedName}`;
    if (fs.existsSync(filePath)) return { filePath, publicUrl };
    const response = await axios({ method: 'GET', url: directUrl, responseType: 'stream', timeout: 30000, maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const writer = fs.createWriteStream(filePath);
    let downloadedSize = 0;
    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (downloadedSize > this.maxFileSize) { writer.destroy(); fs.unlinkSync(filePath); reject(new Error(`File too large (max ${this.formatBytes(this.maxFileSize)})`)); }
      });
      writer.on('finish', () => resolve({ filePath, publicUrl }));
      writer.on('error', reject);
      response.data.pipe(writer);
    });
  }

  /** Fetch YouTube video metadata via InnerTube API */
  async getYoutubeInfo(url) {
    const videoId = this._extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const data = await innerTubePlayer(videoId);
    const meta = extractVideoMeta(data);
    if (meta.playabilityStatus !== 'OK') throw new Error(meta.playabilityReason || 'Video unavailable');
    return { title: meta.title, duration: meta.duration, thumbnail: meta.thumbnail };
  }

  /** Get a fresh streaming URL from YouTube CDN (cached for 1hr) */
  async getYouTubeStreamUrl(videoId) {
    const cached = streamUrlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return { url: cached.url, mimeType: cached.mimeType, contentLength: cached.contentLength, videoId };
    }
    const data = await innerTubePlayer(videoId);
    const meta = extractVideoMeta(data);
    if (meta.playabilityStatus !== 'OK') throw new Error(meta.playabilityReason || 'Video unavailable');
    const audio = extractBestAudioUrl(data);
    if (!audio || !audio.url) throw new Error('Could not get audio stream URL');
    streamUrlCache.set(videoId, { url: audio.url, mimeType: audio.mimeType, contentLength: audio.contentLength, expiresAt: Date.now() + STREAM_CACHE_TTL });
    return { url: audio.url, mimeType: audio.mimeType, contentLength: audio.contentLength, videoId };
  }

  /** Express middleware: proxy YouTube audio from googlevideo.com → client */
  createYouTubeProxy() {
    return async (req, res) => {
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
          headers: { 'Range': rangeHeader, 'User-Agent': userAgent, 'Referer': 'https://www.youtube.com/' },
        });
        res.status(cdnResp.status);
        for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          if (cdnResp.headers[h]) res.setHeader(h, cdnResp.headers[h]);
        }
        cdnResp.data.pipe(res);
        cdnResp.data.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.end(); });
      } catch (err) {
        console.error(`[~] YouTube proxy error for ${videoId}: ${err.message}`);
        if (!res.headersSent) res.status(502).json({ error: 'Stream unavailable' });
      }
    };
  }

  /** Return stream proxy info (no disk download needed) */
  async downloadFromYoutube(url, roomId, songId) {
    const videoId = this._extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const streamInfo = await this.getYouTubeStreamUrl(videoId);
    return {
      filePath: null,
      publicUrl: `/api/youtube-audio/${videoId}`,
      isYouTubeStream: true,
      videoId,
      mimeType: streamInfo.mimeType,
      contentLength: streamInfo.contentLength,
    };
  }

  _extractVideoId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  _resolveDownloadUrl(url) {
    const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /drive\/folders\/([a-zA-Z0-9_-]+)/];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}&confirm=t`;
    }
    if (url.startsWith('http')) return url;
    throw new Error('Invalid Google Drive URL format');
  }

  cleanupFile(roomId, fileId) {
    const registry = this.fileRegistry.get(roomId) || [];
    const rec = registry.find(f => f.id === fileId);
    if (rec && fs.existsSync(rec.filePath)) {
      try { fs.unlinkSync(rec.filePath); registry.splice(registry.indexOf(rec), 1); }
      catch (err) { console.error(`Failed to cleanup file ${fileId}: ${err.message}`); }
    }
  }

  cleanupRoomFiles(roomId) {
    const roomDir = path.join(this.uploadsDir, roomId);
    if (fs.existsSync(roomDir)) {
      try { fs.rmSync(roomDir, { recursive: true, force: true }); this.fileRegistry.delete(roomId); console.log(`[~] Cleaned up files for room ${roomId}`); }
      catch (err) { console.error(`Failed to cleanup room ${roomId}: ${err.message}`); }
    }
  }

  _registerFile(roomId, fileRecord) {
    if (!this.fileRegistry.has(roomId)) this.fileRegistry.set(roomId, []);
    this.fileRegistry.get(roomId).push(fileRecord);
  }

  sanitizeFileName(name) { return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100); }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = FileHandler;