# YouTube InnerTube API Research for Wojo Music

## Overview

This document consolidates research from multiple open-source YouTube streaming projects to build a robust InnerTube-based audio streamer for Wojo Music. The 400 Bad Request error occurs when the InnerTube API rejects the request payload — typically due to outdated client versions, missing required fields, or lack of PoToken (Proof of Origin Token).

---

## Implementation Update (RESOLVED)

The hand-rolled InnerTube client was replaced with the maintained
[`youtubei.js`](https://github.com/LuanRT/YouTube.js) library (`server/youtube.mjs`).
Key findings that drove the change:

1. **Hand-rolled WEB client requests were rejected** with
   `playabilityStatus.status = UNPLAYABLE / reason = "Video unavailable"` — regardless of
   PoToken, visitor data, API key, base URL, or `signatureTimestamp`. The same request via
   `youtubei.js` succeeds, because the library sends additional session/context fields the
   minimal request omitted.
2. **`ANDROID_VR` and `IOS` return direct (un-ciphered) streaming URLs** and need no PoToken
   and no JS interpreter. They are used first.
3. **`WEB`/`YTMUSIC` return `signatureCipher` URLs** and require a JS interpreter
   (`Platform.shim.eval`) to decipher. They are used as a fallback, with a content-bound
   (videoId) WebPO token attached.
   **Client-name caveat (youtubei.js 18.x):** `Constants.SUPPORTED_CLIENTS` uses the short
   client names (`YTMUSIC`, `TV`, ...). The InnerTube *protocol* name `WEB_REMIX` is NOT
   accepted by `getBasicInfo({ client })` — it throws `Invalid client: WEB_REMIX`. Use
   `client: 'YTMUSIC'`. `TV` (TVHTML5) is excluded from the fallback chain: it returns
   `UNPLAYABLE :: The page needs to be reloaded.`
4. **Streaming works** through the existing `/api/youtube-audio/:videoId` proxy — YouTube's
   CDN honours HTTP Range requests and returns `206 Partial Content` (`audio/mp4` / DASH).
5. **Routing bug fixed:** the SPA catch-all `app.get('*')` in `server/index.js` was
   registered *before* `/api/youtube-audio/:videoId`, so the proxy was never reached (it
   served `index.html`). The API route is now registered first, and the catch-all skips
   `/api/`.

### Architecture
```
browser <audio src=/api/youtube-audio/:id>
   -> Express proxy (server/index.js)
      -> FileHandler.getYouTubeStreamUrl(id)   [server/fileHandler.js, caches 1h]
         -> youtube.mjs getStreamUrl(id)        [youtubei.js; ANDROID_VR -> IOS -> WEB -> YTMUSIC]
            -> Playable CDN URL (Range request relayed back to browser)
```

---

## Additional Reference Projects

### InnerTube-API (MohammadKobirShah) — Python/FastAPI wrapper
- Powering engine: [`tombulled/innertube`](https://github.com/tombulled/innertube)
- Notable pattern: captures `responseContext.visitorData` from a response and reuses it as
  the `X-Goog-Visitor-Id` header on subsequent requests (a stateful session), rather than
  re-scraping the homepage each time.

### JMusicBot (jagrosh) — Java Discord bot
- Delegates all YouTube work to [lavaplayer](https://github.com/sedmelluq/lavaplayer),
  which keeps its own client configs and handles cipher/signature transforms.

---

## Reference Projects

### 1. InnerTubeX (MetrolistGroup)
- **Repo**: https://github.com/MetrolistGroup/innertubex
- **Language**: Kotlin Multiplatform (KMP)
- **Key Features**:
  - Full InnerTube API client for browse, search, player, account operations
  - Multi-client fallback strategy (ANDROID_VR, WEB_REMIX, TVHTML5, IOS, ANDROID)
  - PoToken generation via WebView-based attestation challenge
  - Cipher deobfuscation (sig/n parameter transforms) via Zemer/Faraday/EJS/QuickJS
  - SABR/UMP streaming formats

### 2. Metrolist
- **Repo**: https://github.com/MetrolistGroup/Metrolist
- **Language**: Kotlin (Jetpack Compose)
- **Key Features**:
  - YouTube Music client for Android
  - Uses InnerTubeX for API communication
  - Background playback, offline downloads, lyrics

### 3. Echo Music
- **Repo**: https://github.com/EchoMusicApp/Echo-Music
- **Language**: Kotlin (Jetpack Compose)
- Based on Metrolist architecture, adds lyrics, offline mode, music recognition

### 4. BgUtils (LuanRT)
- **Repo**: https://github.com/LuanRT/BgUtils
- **Language**: TypeScript
- **Key Features**:
  - Complete PoToken minting pipeline research
  - BotGuard/WAA (Web Anti-Abuse) API documentation
  - Integrity token generation and WebPO token minting

### 5. Zemer Cipher
- **Repo**: https://github.com/ZemerTeam/zemer-cipher
- YouTube cipher deobfuscation and PoToken generation
- Remote-updatable player configs for self-healing

### 6. Faraday
- **Repo**: https://github.com/MetrolistGroup/faraday
- Watches YouTube player.js rotations and auto-derives cipher configs

---

## InnerTube API Architecture

### Endpoint
```
POST https://www.youtube.com/youtubei/v1/player?key={API_KEY}&prettyPrint=false
```

Alternative origins:
| Origin | Base URL |
|--------|----------|
| www.youtube.com | `https://www.youtube.com/youtubei/v1` |
| music.youtube.com | `https://music.youtube.com/youtubei/v1` |
| m.youtube.com | `https://m.youtube.com/youtubei/v1` |

### Known API Keys
| Key | Client | Notes |
|-----|--------|-------|
| `AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3` | iOS | Primary iOS key, widely used |
| `AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w` | Android | Android native key |
| `AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8` | Android (alt) | May not work for player |

### Request Payload Structure
```json
{
  "context": {
    "client": {
      "clientName": "ANDROID_VR",
      "clientVersion": "1.65.10",
      "hl": "en", "gl": "US",
      "osName": "Android", "osVersion": "12L",
      "deviceMake": "Oculus", "deviceModel": "Quest 3",
      "androidSdkVersion": "32", "platform": "MOBILE",
      "visitorData": "Cgt...",
      "clientFormFactor": "UNKNOWN_FORM_FACTOR"
    },
    "user": { "lockedSafetyMode": false },
    "request": {
      "useSsl": true,
      "internalExperimentFlags": [],
      "consistencyTokenJars": []
    }
  },
  "videoId": "dQw4w9WgXcQ",
  "playbackContext": {
    "contentPlaybackContext": { "signatureTimestamp": 19400 }
  }
}
```

### Required Headers
| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Goog-Api-Format-Version` | `1` |
| `X-YouTube-Client-Name` | Client ID (e.g., `28` for ANDROID_VR) |
| `X-YouTube-Client-Version` | Client version |
| `Origin` | `https://www.youtube.com` |
| `User-Agent` | Matching UA for the client |
| `X-Goog-Visitor-Id` | Visitor data token |


---

## Client Configurations

### ANDROID_VR 1.65.10 (Best for audio, no PoToken needed)
| Field | Value |
|-------|-------|
| clientName | `ANDROID_VR` |
| clientVersion | `1.65.10` |
| clientId | `28` |
| userAgent | `com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip` |
| osName | `Android` |
| osVersion | `12L` |
| deviceMake | `Oculus` |
| deviceModel | `Quest 3` |
| androidSdkVersion | `32` |
| signatureTimestamp | Not needed |

### VISIONOS 1.02 (New, no PoToken, direct URLs)
| Field | Value |
|-------|-------|
| clientName | `VISIONOS` |
| clientVersion | `1.02` |
| clientId | `101` |
| userAgent | `Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15` |
| osName | `visionOS` |
| osVersion | `26.5.23O471` |
| deviceMake | `Apple` |
| deviceModel | `RealityDevice17,1` |
| useMusicPlayerEndpoint | true |

### IOS 21.26.4
| Field | Value |
|-------|-------|
| clientName | `IOS` |
| clientVersion | `21.26.4` |
| clientId | `5` |
| userAgent | `com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)` |
| osName | `iPhone` |
| osVersion | `18.3.2.22D82` |
| deviceMake | `Apple` |
| deviceModel | `iPhone16,2` |
| signatureTimestamp | May be needed |

### ANDROID 21.26.364
| Field | Value |
|-------|-------|
| clientName | `ANDROID` |
| clientVersion | `21.26.364` |
| clientId | `3` |
| userAgent | `com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip` |
| osName | `Android` |
| osVersion | `11` |
| androidSdkVersion | `30` |

### WEB 2.20260708.00.00 (Requires PoToken)
| Field | Value |
|-------|-------|
| clientName | `WEB` |
| clientVersion | `2.20260708.00.00` |
| clientId | `1` |
| userAgent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0` |

---

## PoToken (Proof of Origin Token) Flow

Required for WEB-family clients (WEB, YTMUSIC, TVHTML5_SIMPLY). ANDROID_VR/IOS/ANDROID do not require it. The flow:

```
1. Fetch BotGuard interpreter script from YouTube page data
2. Load/interpreter JavaScript VM
3. Call asyncSnapshotFunction() to get BotGuard response
4. POST to WAA API for integrity token
5. Use webPoSignalOutput to mint PoToken with contentBinding
6. Include PoToken in InnerTube request
```

### Where PoToken Goes in Payload
```json
{
  "context": {
    "serviceIntegrityDimensions": {
      "poToken": "BASE64_ENCODED_PO_TOKEN"
    },
    "client": {
      "poToken": "BASE64_ENCODED_PO_TOKEN"
    }
  }
}
```

---

## Streaming URL Handling

### Direct vs Signed URLs
YouTube streaming data returns either:
- **url**: Direct CDN URL (no deobfuscation needed)
- **signatureCipher**: URL with `s` (signature) parameter that needs deobfuscation

### Signature Cipher Deobfuscation
When `signatureCipher` is present instead of `url`:
```
signatureCipher: "url=https://...&s=ECgAEAE&sp=sig"
```
Steps:
1. Parse `signatureCipher` into key=value pairs
2. The `s` value is the encrypted signature
3. Deobfuscate `s` using YouTube's player.js cipher functions
4. Append deobfuscated `s` as the query parameter named by `sp`
5. Use the resulting URL

### CDN Token Expiry
- YouTube CDN URLs expire ~6 hours
- Server-side caching should have TTL of ~1 hour max
- Stream URLs are session-specific, not reusable across different IPs

---

## Key Insights for Fixing the 400 Error

1. **ANDROID_VR 1.65.10** is the most reliable unauthenticated client
2. **VISIONOS** is new and may return direct URLs without cipher
3. **IOS client version must be updated** (21.03.1 ? 21.26.4+)
4. **API key matters** - different clients use different keys
5. **Visitor data alone may not be sufficient** - PoToken needed for WEB clients
6. **Signature timestamp in contentPlaybackContext** must match current player.js
7. **Handle signatureCipher** when streaming URLs come with `s` parameter instead of direct `url`
8. **Multiple fallback clients** are essential for reliability
9. **Retry with exponential backoff** across client fallbacks
