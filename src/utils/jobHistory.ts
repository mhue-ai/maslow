/**
 * Job history — tracks past cut jobs in localStorage.
 * Records start time, duration, filename, line count, outcome.
 */

const HISTORY_KEY = 'maslow_job_history';
const MAX_HISTORY = 50;

export type JobOutcome = 'completed' | 'aborted' | 'error' | 'running';

export interface JobRecord {
  id: string;
  filename: string;
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  lineCount: number;
  sizeBytes: number;
  outcome: JobOutcome;
  errorMessage?: string;
  dryRun?: boolean;
}

function load(): JobRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(records: JobRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
  } catch {
    /* localStorage full or unavailable */
  }
}

export function getJobHistory(): JobRecord[] {
  return load();
}

export function startJobRecord(data: Omit<JobRecord, 'id' | 'startTime' | 'endTime' | 'durationMs' | 'outcome'>): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: JobRecord = {
    ...data,
    id,
    startTime: Date.now(),
    endTime: null,
    durationMs: null,
    outcome: 'running',
  };
  const history = load();
  history.unshift(record);
  save(history);
  return id;
}

export function completeJobRecord(id: string, outcome: JobOutcome, errorMessage?: string): void {
  const history = load();
  const idx = history.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const now = Date.now();
  history[idx] = {
    ...history[idx],
    endTime: now,
    durationMs: now - history[idx].startTime,
    outcome,
    errorMessage,
  };
  save(history);
}

export function deleteJobRecord(id: string): void {
  const history = load().filter((r) => r.id !== id);
  save(history);
}

export function clearJobHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min}m`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  const days = Math.round(diff / 86400000);
  return `${days}d ago`;
}
