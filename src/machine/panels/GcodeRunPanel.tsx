import { useState, useEffect, useCallback, useRef } from 'react';
import { useDesignStore } from '../../store/designStore';
import { useMachineStore } from '../../store/machineStore';
import { send } from '../../comms/maslowSocket';
import { checkBounds } from '../../gcode/boundsCheck';
import { startJobRecord, completeJobRecord } from '../../utils/jobHistory';

/**
 * Transform G-code into a dry-run variant: all cutting Z moves forced to safe height.
 * Keeps rapid XY moves and structure so the user sees the exact toolpath without cutting.
 */
function makeDryRun(gcode: string, safeHeight: number = 5): string {
  const safeZ = `Z${safeHeight.toFixed(3)}`;
  return gcode.split('\n').map((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(';')) return line;

    // Strip spindle on (M3/M03/M4/M04) — don't spin up for dry run
    if (/^M0?[34]\b/.test(line)) return '; ' + line + ' (suppressed for dry run)';

    // For any G0/G1 line with a Z value that's below safe height, force to safe
    if (/^G[01]\b/.test(line) && /Z(-?[\d.]+)/.test(line)) {
      const zMatch = line.match(/Z(-?[\d.]+)/);
      if (zMatch) {
        const z = parseFloat(zMatch[1]);
        if (z < safeHeight) {
          return line.replace(/Z-?[\d.]+/, safeZ) + ' ; dry-run: Z forced safe';
        }
      }
    }
    return line;
  }).join('\n');
}

type JobPhase = 'idle' | 'uploading' | 'preflight' | 'ready' | 'running' | 'done';

const JOB_FILENAME = 'job.nc';
const UPLOAD_BASE = '/maslow';

interface FlashInfo {
  total: string;
  used: string;
  freeBytes: number;
  files: { name: string; size: string }[];
}

interface PreflightCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

// ESP32-S3 LittleFS partition per MaslowCNC/Maslow_4 firmware: max_littlefs.csv = 0x200000 (2 MB).
// ESP3D misleadingly reports the full flash chip size (e.g., "120 MB") as "total".
// We cap at the real partition size to prevent filling the filesystem.
const MAX_REALISTIC_FS_SIZE = 2 * 1024 * 1024;
// 10% safety buffer — never write into the last 10% of available space
const SAFETY_BUFFER_RATIO = 0.10;

function parseFlashInfo(data: Record<string, unknown>): FlashInfo {
  const total = String(data.total ?? '0');
  const used = String(data.used ?? '0');
  const files = Array.isArray(data.files) ? (data.files as { name: string; size: string }[]) : [];
  const parseSize = (s: string): number => {
    const m = s.match(/([\d.]+)\s*(KB|MB|GB|B)/i);
    if (!m) return parseInt(s) || 0;
    const v = parseFloat(m[1]);
    const u = m[2].toUpperCase();
    if (u === 'GB') return v * 1024 * 1024 * 1024;
    if (u === 'MB') return v * 1024 * 1024;
    if (u === 'KB') return v * 1024;
    return v;
  };

  let totalBytes = parseSize(total);
  const usedBytes = parseSize(used);

  // If reported total is unrealistically large (ESP3D bug), cap it
  if (totalBytes > MAX_REALISTIC_FS_SIZE) {
    totalBytes = MAX_REALISTIC_FS_SIZE;
  }

  // Reserve 10% of total capacity as safety buffer — never let user fill the FS
  const safetyBuffer = Math.ceil(totalBytes * SAFETY_BUFFER_RATIO);
  const freeBytes = Math.max(0, totalBytes - usedBytes - safetyBuffer);

  return { total: formatBytes(totalBytes), used, freeBytes, files };
}

/** Fetch current flash info directly from the device (not cached).
 *  Uses /files (LocalFS/LittleFS) — the same filesystem $LocalFS/Run reads from.
 *  Do NOT use /upload endpoint for listing — it's a different, larger virtual FS
 *  whose files cannot be executed by $LocalFS/Run. */
async function fetchFreshFlashInfo(): Promise<FlashInfo | null> {
  try {
    const resp = await fetch(`${UPLOAD_BASE}/files?path=/`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) return parseFlashInfo(await resp.json());
  } catch { /* ignore */ }
  return null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function GcodeRunPanel() {
  const gcode = useDesignStore((s) => s.gcode);
  const material = useDesignStore((s) => s.material);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const connection = useMachineStore((s) => s.connection);
  const status = useMachineStore((s) => s.status);
  const minfo = useMachineStore((s) => s.minfo);

  const [phase, setPhase] = useState<JobPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flashInfo, setFlashInfo] = useState<FlashInfo | null>(null);
  const [flashLoading, setFlashLoading] = useState(false);
  const [checks, setChecks] = useState<PreflightCheck[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const jobRecordIdRef = useRef<string | null>(null);

  const disabled = connection !== 'connected';

  const pollFlashInfo = useCallback(async () => {
    setFlashLoading(true);
    try {
      // Always /files — the LocalFS partition. /upload is a different FS.
      const resp = await fetch(`${UPLOAD_BASE}/files?path=/`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setFlashInfo(parseFlashInfo(await resp.json()));
      setError(null);
    } catch {
      setFlashInfo(null);
    } finally {
      setFlashLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connection === 'connected') pollFlashInfo();
  }, [connection, pollFlashInfo]);

  useEffect(() => {
    if (phase === 'preflight') pollFlashInfo();
  }, [phase, pollFlashInfo]);

  const gcodeSize = gcode ? new Blob([gcode]).size : 0;
  const gcodeLines = gcode ? gcode.split('\n').filter((l) => l.trim() && !l.startsWith(';')).length : 0;
  const hasSpace = !flashInfo || flashInfo.freeBytes >= gcodeSize;

  /** Run all pre-flight checks */
  const runPreflight = useCallback(() => {
    const results: PreflightCheck[] = [];
    const machineState = status?.state ?? 'Unknown';

    // 1. Connection
    results.push({
      id: 'connection',
      label: 'Connected',
      pass: connection === 'connected',
      detail: connection === 'connected' ? 'WebSocket connected' : 'Not connected to machine',
    });

    // 2. Machine state
    results.push({
      id: 'state',
      label: 'Machine Idle',
      pass: machineState === 'Idle',
      detail: machineState === 'Idle' ? 'Machine is idle and ready' :
              machineState === 'Alarm' ? 'Machine in alarm — send $X to clear' :
              `Machine is ${machineState} — wait for idle`,
    });

    // 3. Homed / calibrated
    results.push({
      id: 'homed',
      label: 'Calibrated & Homed',
      pass: minfo?.homed === true,
      detail: minfo?.homed ? 'Machine position is known' : 'Not homed — run calibration or $H first',
    });

    // 4. Belt tension (check that belts are extended / have length)
    const beltsOk = minfo ? (minfo.tl > 0 || minfo.tr > 0 || minfo.bl > 0 || minfo.br > 0) : false;
    results.push({
      id: 'belts',
      label: 'Belts Tensioned',
      pass: beltsOk,
      detail: beltsOk ? `Belt lengths: TL=${minfo!.tl.toFixed(0)} TR=${minfo!.tr.toFixed(0)} BL=${minfo!.bl.toFixed(0)} BR=${minfo!.br.toFixed(0)}` :
              'Belt lengths are zero — retract, extend, attach, and tension belts',
    });

    // 5. Z position (should be near 0 or above — not buried in material)
    const zPos = status?.position.z ?? -999;
    results.push({
      id: 'zpos',
      label: 'Z Position Safe',
      pass: zPos >= -2,
      detail: zPos >= -2 ? `Z = ${zPos.toFixed(1)}mm (safe)` :
              `Z = ${zPos.toFixed(1)}mm — retract Z above material before starting`,
    });

    // 6. Bounds check
    if (gcode) {
      const lines = gcode.split('\n');
      const bounds = checkBounds(lines, material, toolConfig.workOrigin, toolConfig.edgeClearance);
      results.push({
        id: 'bounds',
        label: 'Within Cutting Area',
        pass: bounds.inBounds,
        detail: bounds.inBounds
          ? `Toolpath: ${(bounds.maxX - bounds.minX).toFixed(0)}×${(bounds.maxY - bounds.minY).toFixed(0)}mm`
          : bounds.warnings.join('; '),
      });
    }

    // 7. Storage space
    results.push({
      id: 'storage',
      label: 'Storage Space',
      pass: hasSpace,
      detail: hasSpace
        ? `Need ${formatBytes(gcodeSize)}, ${flashInfo ? formatBytes(flashInfo.freeBytes) + ' free' : 'space available'}`
        : `Need ${formatBytes(gcodeSize)} but only ${formatBytes(flashInfo?.freeBytes ?? 0)} free`,
    });

    setChecks(results);
    return results;
  }, [connection, status, minfo, gcode, material, toolConfig, hasSpace, gcodeSize, flashInfo]);

  // Re-run checks when machine state changes during preflight
  useEffect(() => {
    if (phase === 'preflight') runPreflight();
  }, [phase, runPreflight]);

  /** Step 1: Upload */
  const handleUpload = async () => {
    if (!gcode) return;
    // Use dry-run G-code if enabled
    const payloadGcode = dryRun ? makeDryRun(gcode, 5) : gcode;
    const payloadSize = new Blob([payloadGcode]).size;

    // ALWAYS re-check free space immediately before upload (fresh, not cached).
    // The cached flashInfo might be stale, and space can change between renders.
    setError(null);
    setPhase('uploading');
    setUploadProgress(0);
    const fresh = await fetchFreshFlashInfo();
    if (fresh) setFlashInfo(fresh);

    // Treat the existing file we're about to overwrite as reclaimable space
    const existingFile = fresh?.files.find((f) => f.name === JOB_FILENAME || f.name === `/${JOB_FILENAME}`);
    const reclaimable = existingFile ? (parseInt(existingFile.size) || 0) : 0;
    const effectiveFree = fresh ? fresh.freeBytes + reclaimable : 0;

    if (fresh && payloadSize > effectiveFree) {
      const safetyPct = Math.round(SAFETY_BUFFER_RATIO * 100);
      setError(
        `Not enough space for ${formatBytes(payloadSize)} ` +
        `(${formatBytes(effectiveFree)} free after ${safetyPct}% safety buffer). ` +
        `Delete old files in the Files tab.`
      );
      setPhase('idle');
      return;
    }

    if (!fresh) {
      setError('Could not verify free space — aborting for safety. Check connection.');
      setPhase('idle');
      return;
    }

    try {
      const blob = new Blob([payloadGcode], { type: 'text/plain' });
      const formData = new FormData();
      // ESP3D-compatible upload format:
      //   path=<target directory>
      //   <filename>S=<size in bytes>   <- REQUIRED size hint, else firmware silently discards
      //   file=<blob with filename>
      formData.append('path', '/');
      formData.append(`${JOB_FILENAME}S`, String(payloadSize));
      formData.append('file', blob, JOB_FILENAME);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { setFlashInfo(parseFlashInfo(JSON.parse(xhr.responseText))); } catch { /* ok */ }
            resolve();
          } else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
        xhr.timeout = 60000;
        // Upload to /files (LocalFS) — NOT /upload which targets a different FS
        // that $LocalFS/Run cannot read from.
        xhr.open('POST', `${UPLOAD_BASE}/files`);
        xhr.send(formData);
      });

      setUploadProgress(100);

      // VERIFY the file actually landed — the firmware sometimes returns 200
      // without persisting. Re-read the file list and confirm our file is there.
      const verified = await fetchFreshFlashInfo();
      if (verified) setFlashInfo(verified);
      const savedFile = verified?.files.find(
        (f) => f.name === JOB_FILENAME || f.name === `/${JOB_FILENAME}`,
      );
      const savedSize = savedFile ? parseInt(savedFile.size) || 0 : 0;

      if (!savedFile) {
        setError(
          'Upload reported success but the file did not appear on the device. ' +
          'Possible firmware quirk — try again or upload a smaller file.',
        );
        setPhase('idle');
        return;
      }

      // Check the file size matches (tolerate small variation in reporting units)
      if (Math.abs(savedSize - payloadSize) > 256) {
        setError(
          `File on device is ${formatBytes(savedSize)} but we sent ${formatBytes(payloadSize)}. ` +
          'Upload may have been truncated. Retry.',
        );
        setPhase('idle');
        return;
      }

      // Move to preflight — run checks before allowing execution
      setPhase('preflight');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPhase('idle');
    }
  };

  /** Step 2: Pre-flight passed, move to ready */
  const handlePreflightPass = () => {
    setPhase('ready');
  };

  /** Step 3: Run */
  const handleRun = () => {
    // A real cut spins the router and begins motion on a single click. Require
    // an explicit confirmation so an accidental click can't start a job.
    // Dry runs keep Z at safe height, so they're allowed to start directly.
    if (!dryRun) {
      const ok = window.confirm(
        'Start cutting?\n\nThe router will spin up and begin the program. Make sure the work is clamped, the bit is set, and the area is clear.'
      );
      if (!ok) return;
    }
    send(`$LocalFS/Run=${JOB_FILENAME}`);
    // Start job history record
    jobRecordIdRef.current = startJobRecord({
      filename: JOB_FILENAME,
      lineCount: gcodeLines,
      sizeBytes: gcodeSize,
      dryRun,
    });
    setPhase('running');
  };

  const handleReset = () => {
    setPhase('idle');
    setUploadProgress(0);
    setError(null);
    setChecks([]);
  };

  const machineState = status?.state ?? 'Unknown';
  const isRunning = machineState === 'Run' || machineState === 'Hold';

  // Job completion detection.
  //
  // Previously this ran in the render body and fired setTimeout(setPhase) on
  // every render where state===Idle — scheduling overlapping timers and, worse,
  // treating a single transient Idle report as "done". The Maslow can report
  // Idle briefly between issuing $LocalFS/Run and the first motion, which would
  // tear down the running controls mid-job.
  //
  // Now: require Idle to PERSIST for a confirmation window before declaring the
  // job done. Any non-Idle status within the window cancels the pending
  // completion. The effect owns the timer and clears it on cleanup.
  useEffect(() => {
    if (phase !== 'running') return;
    if (machineState !== 'Idle') return; // Run/Hold/etc. — not done

    const t = setTimeout(() => {
      if (jobRecordIdRef.current) {
        completeJobRecord(jobRecordIdRef.current, 'completed');
        jobRecordIdRef.current = null;
      }
      setPhase('done');
    }, 1500); // sustained-idle confirmation window

    return () => clearTimeout(t);
  }, [phase, machineState]);

  // Track alarm state as error outcome
  useEffect(() => {
    if (phase === 'running' && machineState === 'Alarm' && jobRecordIdRef.current) {
      completeJobRecord(jobRecordIdRef.current, 'error', 'Machine entered Alarm state');
      jobRecordIdRef.current = null;
    }
  }, [machineState, phase]);

  const allChecksPassed = checks.length > 0 && checks.every((c) => c.pass);
  const criticalFails = checks.filter((c) => !c.pass && ['connection', 'state'].includes(c.id));

  return (
    <div>
      <h3>G-Code Control</h3>

      {/* Flash storage info */}
      {connection === 'connected' && (
        <div style={{
          fontSize: 10, color: '#888', marginBottom: 8, padding: '6px 8px',
          background: '#0d0d1a', borderRadius: 4,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            {flashLoading ? <span style={{ color: '#555' }}>Checking storage...</span> :
              flashInfo ? (
                <>
                  <span style={{ color: flashInfo.freeBytes < 10000 ? '#ff6666' : '#888' }}>
                    {formatBytes(flashInfo.freeBytes)} free
                  </span>
                  <span style={{ color: '#555' }}> / {flashInfo.total}</span>
                </>
              ) : <span style={{ color: '#555' }}>Storage info unavailable</span>
            }
          </div>
          <button className="btn btn-sm" onClick={pollFlashInfo} disabled={flashLoading}
            style={{ padding: '1px 6px', fontSize: 9, minWidth: 0 }}>↻</button>
        </div>
      )}

      {!gcode ? (
        <p style={{ fontSize: 12, color: '#555' }}>Generate G-code in the Full, Outline, or Cut tab first.</p>
      ) : (
        <>
          {/* File info */}
          <div style={{
            fontSize: 11, color: '#aaa', marginBottom: 8, padding: '6px 8px',
            background: '#0d0d1a', borderRadius: 4, fontFamily: 'monospace',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{gcodeLines} commands</span>
            <span style={{ color: !hasSpace ? '#ff6666' : '#888' }}>{formatBytes(gcodeSize)}</span>
          </div>

          {error && <div className="warning" style={{ marginBottom: 8 }}>{error}</div>}

          {/* ── Step 1: Upload ── */}
          {(phase === 'idle' || phase === 'uploading') && (
            <>
              {/* Dry-run toggle */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 6,
                padding: '6px 8px',
                background: dryRun ? 'rgba(255,170,68,0.08)' : '#0d0d1a',
                border: `1px solid ${dryRun ? 'rgba(255,170,68,0.3)' : '#1a1a2a'}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  style={{ margin: 0, cursor: 'pointer' }}
                />
                <span style={{ color: dryRun ? '#ffaa44' : '#aaa', fontWeight: dryRun ? 600 : 400 }}>
                  Dry Run {dryRun && '(Z stays safe, no cutting)'}
                </span>
              </label>

              <button className="btn btn-primary" disabled={disabled || phase === 'uploading' || !hasSpace}
                onClick={handleUpload} style={{
                  width: '100%',
                  marginBottom: 4,
                  background: dryRun ? '#332200' : undefined,
                  borderColor: dryRun ? '#664400' : undefined,
                  color: dryRun ? '#ffaa44' : undefined,
                }}>
                {phase === 'uploading' ? `Uploading... ${uploadProgress}%` : dryRun ? '1. Upload Dry-Run' : '1. Upload to Machine'}
              </button>
              {!hasSpace && (
                <div style={{ fontSize: 10, color: '#ff6666', marginBottom: 4 }}>
                  Not enough space. Need {formatBytes(gcodeSize)}, only {formatBytes(flashInfo?.freeBytes ?? 0)} free.
                </div>
              )}
              {phase === 'uploading' && (
                <div style={{ height: 4, background: '#1a1a2e', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#4488ff', borderRadius: 2, transition: 'width 0.2s' }} />
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Pre-flight checks ── */}
          {phase === 'preflight' && (
            <div>
              <div style={{
                fontSize: 11, color: '#44cc44', marginBottom: 8, padding: '4px 8px',
                background: 'rgba(68,204,68,0.1)', border: '1px solid rgba(68,204,68,0.3)', borderRadius: 4,
              }}>
                ✓ Uploaded {JOB_FILENAME} ({formatBytes(gcodeSize)}){dryRun && ' · DRY RUN'}
              </div>

              <h3 style={{ margin: '8px 0 6px' }}>2. Pre-Flight Check</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                {checks.map((c) => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 4,
                    background: c.pass ? 'rgba(68,204,68,0.05)' : 'rgba(255,68,68,0.05)',
                    border: `1px solid ${c.pass ? 'rgba(68,204,68,0.15)' : 'rgba(255,68,68,0.15)'}`,
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      background: c.pass ? '#1a3a1a' : '#3a1a1a',
                      color: c.pass ? '#44cc44' : '#ff4444',
                      fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {c.pass ? '✓' : '✗'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: c.pass ? '#aaa' : '#ddd', fontWeight: c.pass ? 400 : 600 }}>
                        {c.label}
                      </div>
                      <div style={{ fontSize: 9, color: c.pass ? '#555' : '#aa6666' }}>
                        {c.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-primary"
                  disabled={criticalFails.length > 0}
                  onClick={handlePreflightPass}
                  style={{
                    flex: 1,
                    background: allChecksPassed ? '#1a4a1a' : '#3a3a1a',
                    border: `1px solid ${allChecksPassed ? '#2a6a2a' : '#5a5a2a'}`,
                    color: allChecksPassed ? '#44cc44' : '#ccaa44',
                  }}
                >
                  {allChecksPassed ? '3. Proceed to Run' :
                   criticalFails.length > 0 ? 'Fix Critical Issues First' :
                   '3. Proceed (with warnings)'}
                </button>
                <button className="btn btn-sm" onClick={() => runPreflight()}
                  style={{ padding: '4px 8px', fontSize: 10 }}>↻</button>
              </div>

              <button className="btn btn-sm" onClick={handleReset}
                style={{ width: '100%', marginTop: 4, fontSize: 10, color: '#666' }}>Cancel</button>
            </div>
          )}

          {/* ── Step 3: Ready to run ── */}
          {phase === 'ready' && (
            <div>
              <div style={{
                fontSize: 11, color: '#44cc44', marginBottom: 8, padding: '4px 8px',
                background: 'rgba(68,204,68,0.1)', border: '1px solid rgba(68,204,68,0.3)', borderRadius: 4,
              }}>
                ✓ Pre-flight passed — ready to cut
              </div>
              <button className="btn btn-primary" disabled={disabled} onClick={handleRun}
                style={{ width: '100%', marginBottom: 4, background: '#1a4a1a', border: '1px solid #2a6a2a', fontSize: 14 }}>
                ▶ Start Cutting
              </button>
              <button className="btn btn-sm" onClick={() => setPhase('preflight')}
                style={{ width: '100%', fontSize: 10, color: '#666' }}>Back to Pre-Flight</button>
            </div>
          )}

          {/* ── Running ── */}
          {phase === 'running' && (
            <div>
              <div style={{
                fontSize: 12, textAlign: 'center', marginBottom: 8, padding: '6px 8px', borderRadius: 4,
                color: machineState === 'Hold' ? '#ffaa44' : '#4488ff',
                background: machineState === 'Hold' ? 'rgba(255,170,68,0.1)' : 'rgba(68,136,255,0.1)',
                border: `1px solid ${machineState === 'Hold' ? 'rgba(255,170,68,0.3)' : 'rgba(68,136,255,0.3)'}`,
              }}>
                {machineState === 'Hold' ? '⏸ Paused' : '▶ Running'} — {JOB_FILENAME}
              </div>
              {status && (
                <div style={{ fontSize: 10, color: '#888', fontFamily: 'monospace', marginBottom: 8 }}>
                  X: {status.position.x.toFixed(1)}  Y: {status.position.y.toFixed(1)}  Z: {status.position.z.toFixed(1)} mm
                </div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {phase === 'done' && (
            <div>
              <div style={{
                fontSize: 12, color: '#44cc44', textAlign: 'center', marginBottom: 8, padding: '6px 8px',
                background: 'rgba(68,204,68,0.1)', border: '1px solid rgba(68,204,68,0.3)', borderRadius: 4,
              }}>
                ✓ Job Complete
              </div>
              <button className="btn btn-sm" onClick={handleReset} style={{ width: '100%' }}>New Job</button>
            </div>
          )}
        </>
      )}

      {/* Machine controls during run */}
      {connection === 'connected' && (phase === 'running' || isRunning) && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <button className="btn btn-sm" disabled={machineState !== 'Run'} onClick={() => send('!')} style={{ flex: 1 }}>Pause</button>
          <button className="btn btn-sm" disabled={machineState !== 'Hold'} onClick={() => send('~')} style={{ flex: 1 }}>Resume</button>
          <button className="btn btn-sm" onClick={() => {
            send('\x18');
            if (jobRecordIdRef.current) {
              completeJobRecord(jobRecordIdRef.current, 'aborted', 'User pressed Stop');
              jobRecordIdRef.current = null;
            }
            setPhase('idle');
          }} style={{ flex: 1, background: '#4a1a1a', borderColor: '#8a2a2a' }}>Stop</button>
        </div>
      )}

      {/* Set Zero */}
      <div style={{ marginTop: 12 }}>
        <h3>Set Zero</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('G10 L20 P1 Z0')}>Zero Z</button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('G10 L20 P1 X0 Y0')}>Zero XY</button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('G10 L20 P1 X0 Y0 Z0')}>Zero All</button>
        </div>
      </div>
    </div>
  );
}
