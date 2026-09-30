import React, { useState, useRef, useCallback, useEffect } from 'react';

const SEARCH_DEBOUNCE = 300;

export default function SearchPanel({ socket }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [continuation, setContinuation] = useState(null);
  const debounceRef = useRef(null);
  const [addedIds, setAddedIds] = useState(new Set());
  const sentinelRef = useRef(null); // IntersectionObserver target

  // ---- Initial search ----
  const doSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setContinuation(null);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setContinuation(null);
    try {
      const res = await fetch(`/api/music-search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      setResults(data.results || []);
      setContinuation(data.continuation || null);
      setSearched(true);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- Lazy-load (infinite scroll) ----
  const loadMore = useCallback(async () => {
    if (loadingMore || !continuation) return;
    setLoadingMore(true);
    try {
      const res = await fetch('/api/music-search/more', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ continuation }),
      });
      if (!res.ok) throw new Error(`Load more failed (${res.status})`);
      const data = await res.json();
      setResults((prev) => [...prev, ...(data.results || [])]);
      setContinuation(data.continuation || null);
    } catch (err) {
      console.error('Load more failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [continuation, loadingMore]);

  // IntersectionObserver: detect when user scrolls near the bottom
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, results.length]); // re-attach when results change (new sentinel)

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), SEARCH_DEBOUNCE);
  };

  // ---- Add to queue ----
  const handleAdd = async (item) => {
    try {
      const result = await socket.addToQueue({
        title: item.title,
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        source: 'youtube',
        videoId: item.videoId,
        duration: item.duration || 0,
      });
      if (result?.success) {
        setAddedIds((prev) => new Set(prev).add(item.videoId));
        setTimeout(() => {
          setAddedIds((prev) => {
            const next = new Set(prev);
            next.delete(item.videoId);
            return next;
          });
        }, 2000);
      }
    } catch (err) {
      console.error('Add failed:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const formatDuration = (dur) => {
    if (!dur && dur !== 0) return '';
    // Already formatted "3:51"
    if (typeof dur === 'string' && dur.includes(':')) return dur;
    const s = parseInt(dur, 10);
    if (isNaN(s)) return String(dur);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {/* Search input with clear button */}
      <div style={{ position: 'relative' }}>
        <input
          className="walkman-input"
          placeholder="Search YouTube Music..."
          value={query}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              doSearch(query);
            }
          }}
          style={{ fontSize: '14px', paddingRight: query ? '30px' : '12px' }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setContinuation(null);
              setSearched(false);
              setError('');
            }}
            style={{
              position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', padding: '4px', fontSize: '14px', lineHeight: 1,
            }}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results area */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            🔍 Searching...
          </div>
        )}

        {error && (
          <div style={{ padding: '10px', color: '#ff8a80', fontSize: '13px', textAlign: 'center' }}>
            ✕ {error}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No results found for "{query}"
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {results.map((item) => (
                <div
                  key={item.videoId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.03)',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(192,160,96,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0,
                    background: '#333',
                  }}>
                    {item.thumbnail && (
                      <img
                        src={item.thumbnail}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.title}
                    </div>
                    <div style={{
                      fontSize: '11px', color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.artist || 'YouTube'}
                    </div>
                  </div>

                  {/* Duration */}
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0, textAlign: 'right', minWidth: '35px' }}>
                    {formatDuration(item.duration)}
                  </div>

                  {/* Add button */}
                  <button
                    className="walkman-btn"
                    onClick={() => handleAdd(item)}
                    disabled={addedIds.has(item.videoId)}
                    style={{ padding: '4px 10px', fontSize: '12px', flexShrink: 0 }}
                    title="Add to queue"
                  >
                    {addedIds.has(item.videoId) ? '✓ Added' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} style={{ height: '1px' }}>
              {loadingMore && (
                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  🔍 Loading more...
                </div>
              )}
              {!continuation && results.length > 0 && !loadingMore && (
                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px', opacity: 0.6 }}>
                  — end of results —
                </div>
              )}
            </div>
          </>
        )}

        {!loading && !searched && query === '' && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6' }}>
            🔎 Search for any song or artist<br />to add it to the queue
          </div>
        )}
      </div>
    </div>
  );
}