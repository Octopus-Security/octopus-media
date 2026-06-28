'use client';

import { useState } from 'react';
import { MediaEntry } from '@/app/page';

interface Props {
  entry: MediaEntry;
  onFinish: () => void;
  onUpdateProgress: (id: string, season: number, episode: number) => void;
  onDelete: () => void;
}

function musicLabel(e: MediaEntry) {
  return [e.artist, e.album, e.song].filter(Boolean).join(' · ');
}

export default function EntryCard({ entry: e, onFinish, onUpdateProgress, onDelete }: Props) {
  const [season,      setSeason]      = useState(e.current_season  ?? 1);
  const [episode,     setEpisode]     = useState(e.current_episode ?? 1);
  const [seasonEdit,  setSeasonEdit]  = useState(String(e.current_season  ?? 1));
  const [episodeEdit, setEpisodeEdit] = useState(String(e.current_episode ?? 1));
  const [saving,      setSaving]      = useState(false);

  const isEpisodic = e.type === 'anime' || e.type === 'tv';
  const title = e.type === 'music' ? musicLabel(e) : (e.title ?? '—');

  async function saveProgress(newSeason: number, newEpisode: number) {
    setSaving(true);
    await onUpdateProgress(e.id, newSeason, newEpisode);
    setSaving(false);
  }

  function adjustEpisode(delta: number) {
    const ep = Math.max(1, episode + delta);
    setSeason(season); setEpisode(ep);
    setSeasonEdit(String(season)); setEpisodeEdit(String(ep));
    saveProgress(season, ep);
  }

  function adjustSeason(delta: number) {
    const se = Math.max(1, season + delta);
    setSeason(se); setEpisode(1);
    setSeasonEdit(String(se)); setEpisodeEdit('1');
    saveProgress(se, 1);
  }

  function commitSeason() {
    const se = Math.max(1, parseInt(seasonEdit) || season);
    setSeason(se); setSeasonEdit(String(se));
    setEpisode(1); setEpisodeEdit('1');
    saveProgress(se, 1);
  }

  function commitEpisode() {
    const ep = Math.max(1, parseInt(episodeEdit) || episode);
    setEpisode(ep); setEpisodeEdit(String(ep));
    saveProgress(season, ep);
  }

  const inputCls = 'text-text text-sm w-10 text-center font-mono bg-transparent border border-transparent hover:border-border/50 focus:border-accent focus:outline-none rounded px-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

  const TYPE_BADGE: Record<string, string> = {
    anime: 'bg-purple-900/50 text-purple-300',
    movie: 'bg-blue-900/50 text-blue-300',
    tv:    'bg-yellow-900/50 text-yellow-300',
    music: 'bg-pink-900/50 text-pink-300',
  };

  return (
    <div className="bg-surface border border-border rounded-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-text font-medium text-sm leading-snug truncate" title={title}>{title}</p>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${TYPE_BADGE[e.type]}`}>
          {e.type}
        </span>
      </div>

      {e.notes && (
        <p className="text-muted text-xs leading-relaxed line-clamp-2">{e.notes}</p>
      )}

      {/* Episode controls */}
      {isEpisodic && (
        <div className="flex items-center gap-3">
          {/* Season */}
          <div className="flex items-center gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider mr-0.5">S</span>
            <button onClick={() => adjustSeason(-1)} className="w-5 h-5 rounded bg-surface-2 hover:bg-surface-3 text-muted hover:text-text text-xs flex items-center justify-center">−</button>
            <input
              type="number"
              min={1}
              value={seasonEdit}
              onChange={ev => setSeasonEdit(ev.target.value)}
              onBlur={commitSeason}
              onKeyDown={ev => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
              className={inputCls}
            />
            <button onClick={() => adjustSeason(1)} className="w-5 h-5 rounded bg-surface-2 hover:bg-surface-3 text-muted hover:text-text text-xs flex items-center justify-center">+</button>
          </div>
          {/* Episode */}
          <div className="flex items-center gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider mr-0.5">E</span>
            <button onClick={() => adjustEpisode(-1)} className="w-5 h-5 rounded bg-surface-2 hover:bg-surface-3 text-muted hover:text-text text-xs flex items-center justify-center">−</button>
            <input
              type="number"
              min={1}
              value={episodeEdit}
              onChange={ev => setEpisodeEdit(ev.target.value)}
              onBlur={commitEpisode}
              onKeyDown={ev => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
              className={inputCls}
            />
            <button onClick={() => adjustEpisode(1)} className="w-5 h-5 rounded bg-surface-2 hover:bg-surface-3 text-muted hover:text-text text-xs flex items-center justify-center">+</button>
          </div>
          {saving && <span className="text-muted text-[10px]">saving…</span>}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-border">
        <button
          onClick={onFinish}
          className="flex-1 py-1.5 rounded text-xs bg-accent/10 hover:bg-accent/20 text-accent font-medium transition-colors"
        >
          {e.type === 'music' ? '✓ Listened' : '✓ Finished'}
        </button>
        <button
          onClick={onDelete}
          className="px-2 py-1.5 rounded text-xs text-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
          title="Remove"
        >✕</button>
      </div>
    </div>
  );
}
