'use client';

import { useState } from 'react';
import { MediaEntry, Rating, EntryType } from '@/app/page';

interface Props {
  entries: MediaEntry[];
  onRate: (id: string, rating: Rating | null) => void;
  onDelete: (id: string) => void;
}

type SortKey = 'date' | 'liked' | 'disliked';

const TYPE_LABELS: Record<EntryType, string> = { anime: 'Anime', movie: 'Movie', tv: 'TV', music: 'Music' };
const TYPE_BADGE: Record<string, string> = {
  anime: 'bg-purple-900/50 text-purple-300',
  movie: 'bg-blue-900/50 text-blue-300',
  tv:    'bg-yellow-900/50 text-yellow-300',
  music: 'bg-pink-900/50 text-pink-300',
};

function entryLabel(e: MediaEntry) {
  if (e.type === 'music') return [e.artist, e.album, e.song].filter(Boolean).join(' · ');
  return e.title ?? '—';
}

function formatDate(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FinishedTab({ entries, onRate, onDelete }: Props) {
  const [sort,      setSort]      = useState<SortKey>('date');
  const [typeFilter, setTypeFilter] = useState<EntryType | 'all'>('all');
  const [ratingFilter, setRatingFilter] = useState<Rating | 'all'>('all');

  let filtered = entries.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (ratingFilter === 'thumbs_up'   && e.rating !== 'thumbs_up')   return false;
    if (ratingFilter === 'thumbs_down' && e.rating !== 'thumbs_down') return false;
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    if (sort === 'liked')    return (a.rating === 'thumbs_up' ? -1 : 1) - (b.rating === 'thumbs_up' ? -1 : 1);
    if (sort === 'disliked') return (a.rating === 'thumbs_down' ? -1 : 1) - (b.rating === 'thumbs_down' ? -1 : 1);
    return new Date(b.finished_at || b.updated_at).getTime() - new Date(a.finished_at || a.updated_at).getTime();
  });

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Sort */}
        <div className="flex items-center gap-1">
          <span className="text-muted text-xs">Sort:</span>
          {([['date','Date'], ['liked','👍 First'], ['disliked','👎 First']] as [SortKey, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-2 py-1 rounded text-xs transition-colors ${sort === k ? 'bg-accent text-bg font-semibold' : 'bg-surface-2 text-muted hover:text-text'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1">
          <span className="text-muted text-xs">Type:</span>
          {(['all', 'anime', 'movie', 'tv', 'music'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-2 py-1 rounded text-xs capitalize transition-colors ${typeFilter === t ? 'bg-accent text-bg font-semibold' : 'bg-surface-2 text-muted hover:text-text'}`}>
              {t === 'all' ? 'All' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Rating filter */}
        <div className="flex items-center gap-1">
          <span className="text-muted text-xs">Rating:</span>
          {([['all','All'], ['thumbs_up','👍'], ['thumbs_down','👎']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setRatingFilter(k)}
              className={`px-2 py-1 rounded text-xs transition-colors ${ratingFilter === k ? 'bg-accent text-bg font-semibold' : 'bg-surface-2 text-muted hover:text-text'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-muted text-sm py-12 text-center">No finished entries match your filters.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(e => (
            <div key={e.id} className="bg-surface border border-border rounded-card p-4 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-text font-medium text-sm truncate" title={entryLabel(e)}>{entryLabel(e)}</p>
                  <p className="text-muted text-[11px] mt-0.5">{formatDate(e.finished_at)}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${TYPE_BADGE[e.type]}`}>
                  {TYPE_LABELS[e.type]}
                </span>
              </div>

              {e.notes && <p className="text-muted text-xs leading-relaxed line-clamp-2">{e.notes}</p>}

              {/* Rating + delete */}
              <div className="flex items-center gap-2 pt-1 border-t border-border mt-auto">
                <button
                  onClick={() => onRate(e.id, e.rating === 'thumbs_up' ? null : 'thumbs_up')}
                  className={`flex-1 py-1.5 rounded text-sm transition-colors ${
                    e.rating === 'thumbs_up'
                      ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                      : 'bg-surface-2 text-muted hover:text-text'
                  }`}
                >👍</button>
                <button
                  onClick={() => onRate(e.id, e.rating === 'thumbs_down' ? null : 'thumbs_down')}
                  className={`flex-1 py-1.5 rounded text-sm transition-colors ${
                    e.rating === 'thumbs_down'
                      ? 'bg-red-900/50 text-red-300 border border-red-700/50'
                      : 'bg-surface-2 text-muted hover:text-text'
                  }`}
                >👎</button>
                <button
                  onClick={() => onDelete(e.id)}
                  className="px-2 py-1.5 rounded text-xs text-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
                  title="Remove"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
