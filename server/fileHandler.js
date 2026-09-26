const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdl = require('ytdl-core');

class FileHandler {
  constructor(uploadsDir, maxFileSize = 30 * 1024 * 1024) {
    this.uploadsDir = uploadsDir;
    this.maxFileSize = maxFileSize;
    this.fileRegistry = new Map(); // roomId -> [{ id, fileName, filePath, size, addedAt }]
  }

  /**
   * Save an uploaded file buffer to disk
   */
  saveUploadedFile(roomId, fileBuffer, fileName, fileType) {
    // Check size
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

    const fileRecord = {
      id: fileId,
      fileName: sanitizedName,
      filePath,
      publicUrl,
      fileType: fileType || 'audio/mpeg',
      size: fileBuffer.length,
      addedAt: Date.now()
    };

    this._registerFile(roomId, fileRecord);
    return fileRecord;
  }

  /**
   * Download a file from a URL (including Google Drive public links)
   */
  async downloadFromGDrive(url, roomId, songId) {
    const directUrl = this._resolveDownloadUrl(url);
    const roomDir = path.join(this.uploadsDir, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });

    const storedName = `${songId}.mp3`;
    const filePath = path.join(roomDir, storedName);
    const publicUrl = `/uploads/${roomId}/${storedName}`;

    // If already exists, return it
    if (fs.existsSync(filePath)) return { filePath, publicUrl };

    const response = await axios({
      method: 'GET',
      url: directUrl,
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const writer = fs.createWriteStream(filePath);
    let downloadedSize = 0;

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (downloadedSize > this.maxFileSize) {
          writer.destroy();
          fs.unlinkSync(filePath);
          reject(new Error(`File too large (max ${this.formatBytes(this.maxFileSize)})`));
        }
      });

      writer.on('finish', () => resolve({ filePath, publicUrl }));
      writer.on('error', reject);

      response.data.pipe(writer);
    });
  }

  /**
   * Clean up a specific file
   */
  cleanupFile(roomId, fileId) {
    const registry = this.fileRegistry.get(roomId) || [];
    const fileRecord = registry.find(f => f.id === fileId);
    if (fileRecord && fs.existsSync(fileRecord.filePath)) {
      try {
        fs.unlinkSync(fileRecord.filePath);
        const idx = registry.indexOf(fileRecord);
        if (idx !== -1) registry.splice(idx, 1);
      } catch (err) {
        console.error(`Failed to cleanup file ${fileId}: ${err.message}`);
      }
    }
  }

  /**
   * Clean up all files for a room
   */
  cleanupRoomFiles(roomId) {
    const roomDir = path.join(this.uploadsDir, roomId);
    if (fs.existsSync(roomDir)) {
      try {
        fs.rmSync(roomDir, { recursive: true, force: true });
        this.fileRegistry.delete(roomId);
        console.log(`[~] Cleaned up files for room ${roomId}`);
      } catch (err) {
        console.error(`Failed to cleanup room ${roomId}: ${err.message}`);
      }
    }
  }

  /**
   * Parse a Google Drive URL to get a direct download link
   */
  _resolveDownloadUrl(url) {
    // Handle various Google Drive URL formats
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,    // /file/d/FILE_ID/view
      /id=([a-zA-Z0-9_-]+)/,             // ?id=FILE_ID
      /drive\/folders\/([a-zA-Z0-9_-]+)/ // For folders (not directly supported)
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const fileId = match[1];
        return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      }
    }

    // If it's already a direct link, return as-is
    if (url.startsWith('http')) return url;

    throw new Error('Invalid Google Drive URL format');
  }

  /**
   * Download audio from a YouTube video using ytdl-core
   */
  async downloadFromYoutube(url, roomId, songId) {
    const roomDir = path.join(this.uploadsDir, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });

    const storedName = `${songId}.mp3`;
    const filePath = path.join(roomDir, storedName);
    const publicUrl = `/uploads/${roomId}/${storedName}`;

    // If already exists, return it
    if (fs.existsSync(filePath)) return { filePath, publicUrl };

    return new Promise((resolve, reject) => {
      const stream = ytdl(url, {
        filter: 'audioonly',
        quality: 'highestaudio',
      });

      const writer = fs.createWriteStream(filePath);
      let downloadedSize = 0;

      stream.on('error', (err) => {
        writer.destroy();
        // Clean up partial file
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
        reject(new Error(`YouTube download failed: ${err.message}`));
      });

      stream.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (downloadedSize > this.maxFileSize) {
          stream.destroy();
          writer.destroy();
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (_) {}
          }
          reject(new Error(`YouTube audio too large (max ${this.formatBytes(this.maxFileSize)})`));
        }
      });

      writer.on('finish', () => resolve({ filePath, publicUrl }));
      writer.on('error', (err) => {
        reject(new Error(`File write error: ${err.message}`));
      });

      stream.pipe(writer);
    });
  }

  /**
   * Fetch YouTube video metadata (title, duration) using ytdl-core
   */
  async getYoutubeInfo(url) {
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    return {
      title: videoDetails.title,
      duration: parseInt(videoDetails.lengthSeconds, 10) || 0,
      thumbnail: videoDetails.thumbnails?.[0]?.url || '',
    };
  }

  _registerFile(roomId, fileRecord) {
    if (!this.fileRegistry.has(roomId)) {
      this.fileRegistry.set(roomId, []);
    }
    this.fileRegistry.get(roomId).push(fileRecord);
  }

  sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = FileHandler;