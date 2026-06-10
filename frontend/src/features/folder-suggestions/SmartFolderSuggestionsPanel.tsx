import React, { useEffect, useMemo, useState } from 'react';
import { Check, FolderKanban, RefreshCw, Sparkles, X } from 'lucide-react';
import {
  applyFolderSuggestions,
  dismissFolderSuggestions,
  FolderSuggestionGroup,
  generateFolderSuggestions,
  listFolderSuggestions,
} from './folderSuggestionsApi';
import { Button } from '../../components/Button';

type Props = {
  unsortedCount: number;
  onApplied?: () => void;
};

function confidenceLabel(value: number) {
  if (value >= 75) return 'High';
  if (value >= 55) return 'Medium';
  return 'Low';
}

function groupIds(group: FolderSuggestionGroup) {
  return group.suggestions.map((suggestion) => suggestion.suggestion_id);
}

function PreviewPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center text-gray-300">
      <FolderKanban size={18} aria-hidden="true" />
    </div>
  );
}

function cleanThumbnailUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return '';
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return '';
  return trimmed;
}

function getSuggestionThumbnailUrl(item: any): string {
  return (
    cleanThumbnailUrl(item?.thumbnailUrl) ||
    cleanThumbnailUrl(item?.thumbnail_url)
  );
}

function PreviewThumbnail({ item }: { item: any }) {
  const thumbnailUrl = getSuggestionThumbnailUrl(item);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(thumbnailUrl ? 'loading' : 'failed');

  useEffect(() => {
    // TODO: Repair old reels whose stored GCS thumbnail paths now 404.
    if (!thumbnailUrl) {
      setStatus('failed');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setStatus('loaded');
    };
    image.onerror = () => {
      if (!cancelled) setStatus('failed');
    };
    image.src = thumbnailUrl;

    return () => {
      cancelled = true;
    };
  }, [thumbnailUrl]);

  if (status !== 'loaded') {
    return <PreviewPlaceholder />;
  }

  return (
    <div
      className="h-full w-full bg-gray-100 bg-cover bg-center"
      style={{ backgroundImage: `url("${thumbnailUrl}")` }}
    />
  );
}

export const SmartFolderSuggestionsPanel: React.FC<Props> = ({ unsortedCount }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workingGroup, setWorkingGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<FolderSuggestionGroup[]>([]);
  const [serverUnsortedCount, setServerUnsortedCount] = useState<number | null>(null);

  const totalSuggestions = useMemo(
    () => groups.reduce((sum, group) => sum + group.suggestions.length, 0),
    [groups],
  );
  const visibleUnsortedCount = serverUnsortedCount ?? unsortedCount;

  const loadSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFolderSuggestions();
      setGroups(data.groups || []);
      setServerUnsortedCount(data.unsorted_count ?? null);
    } catch (err: any) {
      setError(err?.message || 'Could not load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const data = await generateFolderSuggestions(100);
      setGroups(data.groups || []);
      setServerUnsortedCount(data.unsorted_count ?? null);
    } catch (err: any) {
      setError(err?.message || 'Could not generate suggestions');
    } finally {
      setLoading(false);
    }
  };

  const applyGroup = async (group: FolderSuggestionGroup) => {
    const ids = groupIds(group);
    setWorkingGroup(`${group.suggested_folder_id || group.suggested_folder_name}:apply`);
    setError(null);
    try {
      await applyFolderSuggestions(ids);
      setGroups((prev) => prev.filter((item) => item !== group));
      setServerUnsortedCount((count) => (count == null ? count : Math.max(0, count - ids.length)));
    } catch (err: any) {
      setError(err?.message || 'Could not move videos');
    } finally {
      setWorkingGroup(null);
    }
  };

  const dismissGroup = async (group: FolderSuggestionGroup) => {
    const ids = groupIds(group);
    setWorkingGroup(`${group.suggested_folder_id || group.suggested_folder_name}:dismiss`);
    setError(null);
    try {
      await dismissFolderSuggestions(ids);
      setGroups((prev) => prev.filter((item) => item !== group));
    } catch (err: any) {
      setError(err?.message || 'Could not dismiss suggestions');
    } finally {
      setWorkingGroup(null);
    }
  };

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Sparkles size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-950">Smart Organize</h2>
            <p className="mt-0.5 text-sm text-gray-600">
              Smart Organize found videos that may belong in your folders. Review before moving anything.
            </p>
            <p className="mt-1 text-xs font-bold text-emerald-800">
              {visibleUnsortedCount} unsorted {visibleUnsortedCount === 1 ? 'video' : 'videos'}
              {totalSuggestions > 0 ? ` · ${totalSuggestions} pending suggestions` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {open && (
            <button
              type="button"
              onClick={loadSuggestions}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm transition-colors hover:bg-emerald-100"
              title="Refresh suggestions"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          )}
          <Button variant="primary" size="sm" className="h-10 gap-2 whitespace-nowrap" onClick={generate} disabled={loading}>
            <FolderKanban size={16} aria-hidden="true" />
            {loading ? 'Checking...' : 'Organize videos'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {open && !loading && groups.length === 0 && (
        <div className="mt-4 rounded-xl border border-white/70 bg-white/70 px-3 py-3 text-sm text-gray-600">
          No strong folder suggestions yet. Suggestions get better once folders have a few saved examples.
        </div>
      )}

      {open && groups.length > 0 && (
        <div className="mt-4 space-y-3">
          {groups.map((group) => {
            const key = `${group.suggested_folder_id || group.suggested_folder_name}:${group.count}`;
            const workingApply = workingGroup === `${group.suggested_folder_id || group.suggested_folder_name}:apply`;
            const workingDismiss = workingGroup === `${group.suggested_folder_id || group.suggested_folder_name}:dismiss`;
            return (
              <div key={key} className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-950">{group.suggested_folder_name}</h3>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        {group.count} videos
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                        {confidenceLabel(group.avg_confidence)} confidence
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{group.suggestions[0]?.reason}</p>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {group.suggestions.slice(0, 8).map((suggestion) => (
                        <div key={suggestion.suggestion_id} className="w-16 shrink-0">
                          <div className="aspect-[9/12] overflow-hidden rounded-lg bg-gray-100">
                            <PreviewThumbnail item={suggestion} />
                          </div>
                          <p className="mt-1 truncate text-[10px] font-bold text-gray-500">{suggestion.title}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <button
                      type="button"
                      disabled={Boolean(workingGroup)}
                      onClick={() => applyGroup(group)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <Check size={14} aria-hidden="true" />
                      {workingApply ? 'Moving...' : 'Move all'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(workingGroup)}
                      onClick={() => dismissGroup(group)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-gray-100 px-3 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-60"
                    >
                      <X size={14} aria-hidden="true" />
                      {workingDismiss ? 'Dismissing...' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
