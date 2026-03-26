'use client';

import { useState } from 'react';
import { EntryType } from '@/app/page';

interface Props {
  type: EntryType;
  onClose: () => void;
  onCreated: () => void;
}

const TYPE_LABELS: Record<EntryType, string> = {
  anime: 'Anime',
  movie: 'Movie',
  tv: 'TV Show',
  music: 'Music',
};

export default function AddEntryModal({ type, onClose, onCreated }: Props) {
  const [title,     setTitle]     = useState('');
  const [recSource, setRecSource] = useState('');
  const [notes,     setNotes]     = useState('');
  const [season,    setSeason]    = useState(1);
  const [episode,   setEpisode]   = useState(1);
  const [artist,    setArtist]    = useState('');
  const [album,     setAlbum]     = useState('');
  const [song,      setSong]      = useState('');
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(false);

  const isEpisodic = type === 'anime' || type === 'tv';
  const isMusic    = type === 'music';

  async function submit() {
    setError('');
    if (!isMusic && !title.trim()) { setError('Title is required.'); return; }
    if (isMusic && !artist.trim() && !album.trim() && !song.trim()) {
      setError('Provide at least one of: artist, album, song.');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim() || undefined,
          rec_source: recSource.trim() || undefined,
          notes: notes.trim() || undefined,
          starting_season: isEpisodic ? season : undefined,
          starting_episode: isEpisodic ? episode : undefined,
          artist: isMusic ? artist.trim() || undefined : undefined,
          album:  isMusic ? album.trim()  || undefined : undefined,
          song:   isMusic ? song.trim()   || undefined : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Failed to create entry.'); setSaving(false); return; }
      onCreated();
    } catch {
      setError('Network error.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-card w-[440px] max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-text font-semibold text-sm">Add {TYPE_LABELS[type]}</span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Title (not music) */}
          {!isMusic && (
            <div>
              <label className="block text-xs text-muted mb-1.5">Title <span className="text-red-400">*</span></label>
              <input
                autoFocus
                value={title} onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-muted"
                placeholder={`${TYPE_LABELS[type]} title`}
              />
            </div>
          )}

          {/* Music fields */}
          {isMusic && (
            <div className="flex flex-col gap-3">
              <p className="text-muted text-xs">At least one field required.</p>
              {[
                { label: 'Artist', val: artist, set: setArtist },
                { label: 'Album',  val: album,  set: setAlbum  },
                { label: 'Song',   val: song,   set: setSong   },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs text-muted mb-1.5">{f.label}</label>
                  <input
                    value={f.val} onChange={e => f.set(e.target.value)}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-muted"
                    placeholder={f.label}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Episode start (anime/tv) */}
          {isEpisodic && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-muted mb-1.5">Starting Season</label>
                <input
                  type="number" min={1} value={season}
                  onChange={e => setSeason(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-muted mb-1.5">Starting Episode</label>
                <input
                  type="number" min={1} value={episode}
                  onChange={e => setEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {/* Recommended by */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Recommended by</label>
            <input
              value={recSource} onChange={e => setRecSource(e.target.value)}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-muted"
              placeholder="Who recommended it?"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent placeholder:text-muted resize-none"
              placeholder="Optional notes…"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded text-xs text-muted hover:text-text transition-colors">
              Cancel
            </button>
            <button
              onClick={submit} disabled={saving}
              className="px-4 py-2 rounded text-xs bg-accent hover:bg-accent-h text-bg font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
