import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

/**
 * YtIframePlayer - hidden YouTube IFrame Player API wrapper.
 *
 * Behaves like an <audio> element for the Room sync logic:
 *   load(videoId), play(), pause(), seek(sec), setVolume(0-100),
 *   and reports position/duration via callbacks.
 *
 * The iframe is always rendered (audio keeps playing) but is visually
 * hidden behind artwork unless showVideo is true.
 */
const YtIframePlayer = forwardRef(function YtIframePlayer(
  { videoId, startAt = 0, onReady, onEnded, onStateChange, onError },
  ref
) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [apiReady, setApiReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pendingRef = useRef(null); // { videoId, startSeconds } waiting for the player

  // Load the IFrame API script once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      setApiReady(true);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }, []);

  // Create the player once the API is ready
  useEffect(() => {
    if (!apiReady || playerRef.current || !containerRef.current) return;
    playerRef.current = new window.YT.Player(containerRef.current, {
      height: '100%',
      width: '100%',
      playerVars: {
        playsinline: 1,
        rel: 0,
        // Shared-room sync: YouTube's own controls would let one user
        // pause/seek only their own copy and desync the room. All control
        // goes through the walkman transport instead.
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        iv_load_policy: 3,
        pausesVideoInBackground: 0,
      },
      events: {
        onReady: () => {
          if (pendingRef.current) {
            const p = pendingRef.current;
            pendingRef.current = null;
            playerRef.current.loadVideoById(
              p.startSeconds > 0
                ? { videoId: p.videoId, startSeconds: p.startSeconds }
                : p.videoId
            );
          }
          onReady && onReady();
        },
        onStateChange: (e) => {
          // 0 = ended
          if (e.data === 0) onEnded && onEnded();
          onStateChange && onStateChange(e.data);
        },
        onError: (e) => {
          // 2 invalid param, 5 html5 error, 100 not found,
          // 101/150 embed-disabled
          setFailed(true);
          onError && onError(e.data);
        },
      },
    });
    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch { /* noop */ }
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady]);

  // Load new video when videoId changes (startAt lets guests join mid-song)
  useEffect(() => {
    if (!videoId) return;
    setFailed(false);
    if (playerRef.current && playerRef.current.loadVideoById) {
      playerRef.current.loadVideoById(
        startAt > 0 ? { videoId, startSeconds: startAt } : videoId
      );
    } else {
      pendingRef.current = { videoId, startSeconds: startAt || 0 };
    }
  }, [videoId, startAt]);

  // Imperative API for Room.jsx
  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    seek: (sec) => playerRef.current?.seekTo?.(sec, true),
    getPosition: () => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return 0;
      const t = p.getCurrentTime();
      return isNaN(t) ? 0 : t;
    },
    getPlayerState: () => playerRef.current?.getPlayerState?.() ?? -1,
    getDuration: () => {
      const p = playerRef.current;
      if (!p || !p.getDuration) return 0;
      const d = p.getDuration();
      return isNaN(d) ? 0 : d;
    },
  }), []);

  return (
    <div
      style={{
        // Fill the parent container (WalkmanPlayer's video section) in both
        // states - the parent decides whether it is expanded or collapsed.
        // Stays mounted either way so audio never stops.
        width: '100%',
        height: '100%',
      }}
    >
      <div ref={containerRef} />
    </div>
  );
});

export default YtIframePlayer;
