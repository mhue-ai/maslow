import { useState, useEffect, useCallback } from 'react';
import { useMachineStore } from '../../store/machineStore';

const UPLOAD_BASE = '/maslow';

// System files that should never be deleted
const SYSTEM_FILES = new Set([
  'index.html.gz',
  'config.yaml',
  'maslow.yaml',
  'preferences.json',
  'preferences.json.bak',
  'firmware.bin',
]);

// Files critical to machine operation
const CRITICAL_FILES = new Set([
  'config.yaml',
  'maslow.yaml',
  'firmware.bin',
  'index.html.gz',
]);

interface DeviceFile {
  name: string;
  size: string;
  sizeBytes: number;
  isSystem: boolean;
  isCritical: boolean;
}

interface StorageInfo {
  total: string;
  used: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  files: DeviceFile[];
}

function parseSize(s: string): number {
  const match = s.match(/([\d.]+)\s*(KB|MB|GB|B)/i);
  if (!match) return parseInt(s) || 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'GB') return val * 1024 * 1024 * 1024;
  if (unit === 'MB') return val * 1024 * 1024;
  if (unit === 'KB') return val * 1024;
  return val;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ESP32-S3 LittleFS partition per Maslow_4 firmware max_littlefs.csv: 0x200000 (2 MB).
// ESP3D reports the full flash chip size which is misleading.
const MAX_REALISTIC_FS = 2 * 1024 * 1024;
const SAFETY_BUFFER_RATIO = 0.10;

function parseStorageResponse(data: Record<string, unknown>): StorageInfo {
  const total = String(data.total ?? '0');
  const used = String(data.used ?? '0');
  let totalBytes = parseSize(total);
  const usedBytes = parseSize(used);

  // Cap unrealistic totals
  if (totalBytes > MAX_REALISTIC_FS) totalBytes = MAX_REALISTIC_FS;
  const rawFiles = Array.isArray(data.files) ? data.files as { name: string; size: string }[] : [];

  const files: DeviceFile[] = rawFiles.map((f) => {
    const name = f.name.replace(/^\//, '');
    const sizeBytes = parseInt(f.size) || 0;
    return {
      name,
      size: f.size,
      sizeBytes,
      isSystem: SYSTEM_FILES.has(name) || name.startsWith('.'),
      isCritical: CRITICAL_FILES.has(name),
    };
  });

  // Sort: user files first, then system files, alphabetical within each group
  files.sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  // 10% safety buffer — never let user fill the FS
  const safetyBuffer = Math.ceil(totalBytes * SAFETY_BUFFER_RATIO);
  const freeBytes = Math.max(0, totalBytes - usedBytes - safetyBuffer);
  return { total, used, totalBytes, usedBytes, freeBytes, files };
}

export function FileManagerPanel() {
  const connection = useMachineStore((s) => s.connection);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const disabled = connection !== 'connected';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use /files (LocalFS) — the filesystem where $LocalFS/Run reads from
      // and where web UI + config + uploaded G-code all live.
      // /upload is a different, separate FS we do NOT want to touch.
      const resp = await fetch(`${UPLOAD_BASE}/files?path=/`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setStorage(parseStorageResponse(data));
    } catch {
      try {
        // One retry on same endpoint with longer timeout
        const resp = await fetch(`${UPLOAD_BASE}/files?path=/`, { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
          const data = await resp.json();
          setStorage(parseStorageResponse(data));
        } else {
          setError('Could not read file list');
        }
      } catch {
        setError('Machine not reachable');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connection === 'connected') refresh();
  }, [connection, refresh]);

  const handleDelete = async (filename: string) => {
    setDeleting(filename);
    setError(null);
    try {
      const resp = await fetch(`${UPLOAD_BASE}/files?path=/&action=delete&filename=${encodeURIComponent(filename)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setError(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (filename: string) => {
    window.open(`${UPLOAD_BASE}/${encodeURIComponent(filename)}`, '_blank');
  };

  const usedPct = storage ? Math.round((storage.usedBytes / storage.totalBytes) * 100) : 0;

  return (
    <div>
      <h3>Flash Storage</h3>

      {disabled && (
        <p style={{ fontSize: 11, color: '#555' }}>Connect to the machine to manage files.</p>
      )}

      {error && <div className="warning" style={{ marginBottom: 8 }}>{error}</div>}

      {/* Storage gauge */}
      {storage && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            height: 8,
            background: '#1a1a2e',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 4,
          }}>
            <div style={{
              height: '100%',
              width: `${usedPct}%`,
              background: usedPct > 90 ? '#ff4444' : usedPct > 70 ? '#ffaa44' : '#4488ff',
              borderRadius: 4,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
            <span>{formatBytes(storage.usedBytes)} used</span>
            <span>{formatBytes(storage.freeBytes)} usable / {formatBytes(storage.totalBytes)}</span>
          </div>
          <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
            10% safety buffer reserved ({formatBytes(Math.ceil(storage.totalBytes * SAFETY_BUFFER_RATIO))})
          </div>
        </div>
      )}

      {/* File list */}
      {storage && storage.files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {storage.files.map((file) => (
            <div
              key={file.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                background: confirmDelete === file.name ? 'rgba(255,68,68,0.1)' : '#0d0d1a',
                border: confirmDelete === file.name ? '1px solid rgba(255,68,68,0.3)' : '1px solid transparent',
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              {/* File icon / badge */}
              <div style={{
                fontSize: 8,
                padding: '1px 4px',
                borderRadius: 2,
                background: file.isCritical ? '#4a1a1a' : file.isSystem ? '#1a1a3a' : '#1a2a1a',
                color: file.isCritical ? '#ff6666' : file.isSystem ? '#6688cc' : '#66aa66',
                border: `1px solid ${file.isCritical ? '#662222' : file.isSystem ? '#334466' : '#335533'}`,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {file.isCritical ? 'SYS' : file.isSystem ? 'CFG' : 'USR'}
              </div>

              {/* Filename */}
              <div style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: file.isSystem ? '#888' : '#ccc',
                fontFamily: 'monospace',
              }}>
                {file.name}
              </div>

              {/* Size */}
              <div style={{ fontSize: 9, color: '#555', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {formatBytes(file.sizeBytes)}
              </div>

              {/* Actions */}
              {confirmDelete === file.name ? (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleDelete(file.name)}
                    disabled={deleting !== null}
                    style={{ padding: '1px 6px', fontSize: 9, background: '#4a1a1a', borderColor: '#8a2a2a', color: '#ff6666' }}
                  >
                    {deleting === file.name ? '...' : 'Yes'}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => setConfirmDelete(null)}
                    style={{ padding: '1px 6px', fontSize: 9 }}
                  >
                    No
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleDownload(file.name)}
                    style={{ padding: '1px 6px', fontSize: 9, minWidth: 0 }}
                    title="Download"
                  >
                    ↓
                  </button>
                  {!file.isCritical && (
                    <button
                      className="btn btn-sm"
                      onClick={() => setConfirmDelete(file.name)}
                      disabled={deleting !== null}
                      style={{ padding: '1px 6px', fontSize: 9, minWidth: 0, color: '#ff6666' }}
                      title={file.isSystem ? 'System file — delete with caution' : 'Delete file'}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {storage && storage.files.length === 0 && (
        <p style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 16 }}>No files on device</p>
      )}

      {loading && !storage && (
        <p style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 16 }}>Loading...</p>
      )}

      {/* Legend + refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8, fontSize: 9, color: '#555' }}>
          <span><span style={{ color: '#ff6666' }}>SYS</span> = critical</span>
          <span><span style={{ color: '#6688cc' }}>CFG</span> = config</span>
          <span><span style={{ color: '#66aa66' }}>USR</span> = user file</span>
        </div>
        <button
          className="btn btn-sm"
          onClick={refresh}
          disabled={disabled || loading}
          style={{ padding: '2px 8px', fontSize: 10 }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
