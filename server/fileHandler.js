const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ------------------------------------------------------------------
// YouTube engine (ESM). It wraps youtubei.js, which keeps client
// configs current, maintains a proper visitor-data session, handles
// PoTokens, and deciphers signed streaming URLs. Loaded dynamically
// because youtubei.js is ESM-only.
// ------------------------------------------------------------------
let youtubePromise = null;
function loadYoutube() {
  if (!youtubePromise) youtubePromise = import('./youtube.mjs');
  return youtubePromise;
}

// Stream URL Cache (YouTube CDN links live ~6h; cache well under that)
const streamUrlCache = new Map();
const STREAM_CACHE_TTL = 60 * 60 * 1000;
// Register a hook that wipes the stream-URL cache whenever the YouTube
// identity rotates � CDN URLs are bound to the (visitorData, poToken)
// pair they were minted under, so post-rotation they are poison.
loadYoutube().then((youtube) => {
  if (youtube.onIdentityRotation) {
    youtube.onIdentityRotation(() => {
      const n = streamUrlCache.size;
      streamUrlCache.clear();
      console.log(`[~] Stream URL cache cleared on identity rotation (${n} entries)`);
    });
  }
}).catch((err) => {
  console.warn('[~] Could not register rotation hook:', err.message);
});

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
    const youtube = await loadYoutube();
    const info = await youtube.getInfo(videoId);
    return { title: info.title, duration: info.duration, thumbnail: info.thumbnail };
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
    const youtube = await loadYoutube();
    const stream = await youtube.getStreamUrl(videoId);
    streamUrlCache.set(videoId, {
      url: stream.url,
      mimeType: stream.mimeType,
      contentLength: stream.contentLength,
      expiresAt: Date.now() + STREAM_CACHE_TTL,
    });
    return {
      url: stream.url,
      mimeType: stream.mimeType,
      contentLength: stream.contentLength,
      videoId: videoId,
    };
  }

  createYouTubeProxy() {
    const self = this;
    return async function(req, res) {
      const videoId = req.params.videoId;
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
      }
      const rangeHeader = req.headers.range || 'bytes=0-';
      const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';

      const fetchCdn = (stream) => axios({
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

      const pipe = (cdnResp) => {
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
      };

      // One retry with a freshly minted URL: a 403/expiry means the cached
      // googlevideo URL (bound to the old identity/token) is stale.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const stream = await self.getYouTubeStreamUrl(videoId);
          const cdnResp = await fetchCdn(stream);
          if (cdnResp.status === 403) {
            streamUrlCache.delete(videoId);
            if (attempt === 0) continue;
            return res.status(502).json({ error: 'Stream unavailable' });
          }
          pipe(cdnResp);
          return;
        } catch (err) {
          if (res.headersSent) return;
          streamUrlCache.delete(videoId);
          if (attempt === 0) continue;
          console.error('[~] YouTube proxy error for ' + videoId + ': ' + err.message);
          return res.status(502).json({ error: 'Stream unavailable' });
        }
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