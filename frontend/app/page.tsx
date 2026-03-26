'use client';

import { useEffect, useState, useCallback } from 'react';
import AddEntryModal from '@/components/AddEntryModal';
import EntryCard from '@/components/EntryCard';
import FinishedTab from '@/components/FinishedTab';

export type EntryType   = 'anime' | 'movie' | 'tv' | 'music';
export type EntryStatus = 'active' | 'finished';
export type Rating      = 'thumbs_up' | 'thumbs_down';

export interface MediaEntry {
  id: string;
  type: EntryType;
  title: string | null;
  status: EntryStatus;
  rec_source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  current_season:  number | null;
  current_episode: number | null;
  artist: string | null;
  album:  string | null;
  song:   string | null;
  rating:      Rating | null;
  finished_at: string | null;
}

const TABS: { key: EntryType | 'finished'; label: string }[] = [
  { key: 'anime',    label: 'Anime'    },
  { key: 'movie',    label: 'Movies'   },
  { key: 'tv',       label: 'TV'       },
  { key: 'music',    label: 'Music'    },
  { key: 'finished', label: 'Finished' },
];

export default function HomePage() {
  const [tab, setTab]           = useState<EntryType | 'finished'>('anime');
  const [entries, setEntries]   = useState<MediaEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);

  const activeType = tab !== 'finished' ? tab : null;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = tab === 'finished'
        ? 'status=finished'
        : `type=${tab}&status=active`;
      const r = await fetch(`/api/entries?${params}`);
      const d = await r.json();
      setEntries(d.entries || []);
    } catch { setEntries([]); }
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function finish(id: string) {
    await fetch(`/api/entries/${id}/finish`, { method: 'PATCH' });
    fetchEntries();
  }

  async function rate(id: string, rating: Rating | null) {
    await fetch(`/api/entries/${id}/rate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    fetchEntries();
  }

  async function updateProgress(id: string, season: number, episode: number) {
    await fetch(`/api/entries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_season: season, current_episode: episode }),
    });
    fetchEntries();
  }

  async function remove(id: string) {
    await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    fetchEntries();
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border pb-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}

        <div className="flex-1" />

        {tab !== 'finished' && (
          <button
            onClick={() => setShowAdd(true)}
            className="mb-1 px-3 py-1 rounded text-xs bg-accent hover:bg-accent-h text-bg font-semibold transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-muted text-sm py-12 text-center">Loading…</div>
      ) : tab === 'finished' ? (
        <FinishedTab entries={entries} onRate={rate} onDelete={remove} />
      ) : entries.length === 0 ? (
        <div className="text-muted text-sm py-12 text-center">
          Nothing here yet.{' '}
          <button onClick={() => setShowAdd(true)} className="text-accent hover:underline">Add one?</button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(e => (
            <EntryCard
              key={e.id}
              entry={e}
              onFinish={() => finish(e.id)}
              onUpdateProgress={updateProgress}
              onDelete={() => remove(e.id)}
            />
          ))}
        </div>
      )}

      {showAdd && activeType && (
        <AddEntryModal
          type={activeType}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); fetchEntries(); }}
        />
      )}
    </div>
  );
}
