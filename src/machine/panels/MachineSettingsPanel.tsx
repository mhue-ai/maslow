import { useState, useEffect, useCallback } from 'react';
import { useMachineStore } from '../../store/machineStore';
import { send } from '../../comms/maslowSocket';

const UPLOAD_BASE = '/maslow';

interface SettingsGroup {
  label: string;
  items: { key: string; value: string; unit?: string }[];
}

/** Categorize a Maslow/FluidNC setting into a group */
function categorize(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('maslow_tl') || k.includes('maslow_tr') || k.includes('maslow_bl') || k.includes('maslow_br')) return 'Anchor Points';
  if (k.includes('maslow_calibration') || k.includes('maslow_retract') || k.includes('calibration')) return 'Calibration';
  if (k.includes('maslow')) return 'Maslow Config';
  if (k.includes('axes') || k.includes('x/') || k.includes('y/') || k.includes('z/') || k.includes('a/') || k.includes('b/')) return 'Axes';
  if (k.includes('spindle') || k.includes('pwm') || k.includes('laser')) return 'Spindle';
  if (k.includes('wifi') || k.includes('sta/') || k.includes('ap/') || k.includes('hostname') || k.includes('http')) return 'Network';
  if (k.includes('stepping') || k.includes('idle') || k.includes('arc') || k.includes('junction') || k.includes('homing')) return 'Motion';
  if (k.includes('report') || k.includes('echo') || k.includes('status')) return 'Reporting';
  return 'Other';
}

export function MachineSettingsPanel() {
  const connection = useMachineStore((s) => s.connection);
  const status = useMachineStore((s) => s.status);
  const minfo = useMachineStore((s) => s.minfo);

  const [settings, setSettings] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firmware, setFirmware] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Anchor Points', 'Maslow Config', 'Calibration']));
  const [filter, setFilter] = useState('');

  const disabled = connection !== 'connected';

  /** Fetch settings via HTTP command endpoint */
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSettings([]);

    try {
      // Fetch GRBL-style settings ($$ output)
      const [settingsResp, infoResp] = await Promise.allSettled([
        fetch(`${UPLOAD_BASE}/command?commandText=%24S`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${UPLOAD_BASE}/command?commandText=%24Build%2FInfo`, { signal: AbortSignal.timeout(5000) }),
      ]);

      // Parse settings response
      if (settingsResp.status === 'fulfilled' && settingsResp.value.ok) {
        const text = await settingsResp.value.text();
        const parsed = parseSettings(text);
        setSettings(parsed);
      }

      // Parse firmware info
      if (infoResp.status === 'fulfilled' && infoResp.value.ok) {
        const text = await infoResp.value.text();
        const verMatch = text.match(/\[VER:([^\]]+)\]/);
        const optMatch = text.match(/\[OPT:([^\]]+)\]/);
        setFirmware([verMatch?.[1], optMatch?.[1]].filter(Boolean).join(' | ') || text.trim());
      }

      if (settingsResp.status === 'rejected') {
        throw new Error('Could not reach machine');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
      // Fallback: request settings via WebSocket (responses go to console)
      send('$S');
    } finally {
      setLoading(false);
    }
  }, []);

  // Also try fetching the YAML config directly
  const [yamlConfig, setYamlConfig] = useState<string | null>(null);
  const fetchYaml = useCallback(async () => {
    try {
      const resp = await fetch(`${UPLOAD_BASE}/maslow.yaml`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) setYamlConfig(await resp.text());
    } catch { /* ok */ }
  }, []);

  useEffect(() => {
    if (connection === 'connected') {
      fetchSettings();
      fetchYaml();
    }
  }, [connection, fetchSettings, fetchYaml]);

  /** Parse FluidNC $S output into key/value pairs */
  function parseSettings(text: string): { key: string; value: string }[] {
    const results: { key: string; value: string }[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Format: "$key=value" or "key=value" or "$key = value"
      const match = trimmed.match(/^\$?([^=]+)=(.*)$/);
      if (match) {
        results.push({ key: match[1].trim(), value: match[2].trim() });
      }
    }
    return results;
  }

  // Group and filter settings
  const grouped: SettingsGroup[] = [];
  const groupMap = new Map<string, { key: string; value: string }[]>();

  const lowerFilter = filter.toLowerCase();
  for (const s of settings) {
    if (lowerFilter && !s.key.toLowerCase().includes(lowerFilter) && !s.value.toLowerCase().includes(lowerFilter)) continue;
    const group = categorize(s.key);
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group)!.push(s);
  }

  // Sort groups: Maslow-related first, then alphabetical
  const groupOrder = ['Anchor Points', 'Calibration', 'Maslow Config', 'Axes', 'Motion', 'Spindle', 'Network', 'Reporting', 'Other'];
  for (const g of groupOrder) {
    const items = groupMap.get(g);
    if (items && items.length > 0) {
      grouped.push({ label: g, items: items.map((i) => ({ ...i })) });
    }
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <div>
      <h3>Machine Settings</h3>

      {/* Machine status summary */}
      <div style={{
        padding: 8, marginBottom: 10, background: '#0d0d1a', borderRadius: 4,
        display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>State</span>
          <span style={{ color: status?.state === 'Idle' ? '#44cc44' : status?.state === 'Alarm' ? '#ff4444' : '#ffaa44' }}>
            {status?.state ?? 'Unknown'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>Calibrated</span>
          <span style={{ color: minfo?.homed ? '#44cc44' : '#ff6666' }}>
            {minfo?.homed ? 'Yes' : 'No'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>Position</span>
          <span style={{ color: '#aaa', fontFamily: 'monospace' }}>
            X:{status?.position.x.toFixed(1) ?? '?'} Y:{status?.position.y.toFixed(1) ?? '?'} Z:{status?.position.z.toFixed(1) ?? '?'}
          </span>
        </div>
        {minfo && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#666' }}>Belts</span>
            <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 9 }}>
              TL:{minfo.tl.toFixed(0)} TR:{minfo.tr.toFixed(0)} BL:{minfo.bl.toFixed(0)} BR:{minfo.br.toFixed(0)}
            </span>
          </div>
        )}
        {firmware && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#666' }}>Firmware</span>
            <span style={{ color: '#888', fontSize: 9, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {firmware}
            </span>
          </div>
        )}
      </div>

      {error && <div className="warning" style={{ marginBottom: 8 }}>{error}</div>}

      {/* Filter + refresh */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter settings..."
          style={{
            flex: 1, padding: '4px 8px', border: '1px solid #333',
            borderRadius: 4, background: '#0d0d1a', color: '#ddd', fontSize: 11,
          }}
        />
        <button className="btn btn-sm" onClick={fetchSettings} disabled={disabled || loading}
          style={{ padding: '4px 8px', fontSize: 10 }}>
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* Settings groups */}
      {grouped.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {grouped.map((group) => {
            const expanded = expandedGroups.has(group.label);
            return (
              <div key={group.label} style={{
                border: '1px solid #2a2a4a', borderRadius: 4, overflow: 'hidden',
              }}>
                {/* Group header */}
                <div
                  onClick={() => toggleGroup(group.label)}
                  style={{
                    padding: '6px 8px', background: '#12122a', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#aaa' }}>
                    {expanded ? '▾' : '▸'} {group.label}
                  </span>
                  <span style={{ fontSize: 9, color: '#555' }}>{group.items.length}</span>
                </div>

                {/* Settings rows */}
                {expanded && (
                  <div style={{ background: '#0a0a14' }}>
                    {group.items.map((item, i) => (
                      <div key={item.key} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '3px 8px', fontSize: 10, fontFamily: 'monospace',
                        borderTop: i > 0 ? '1px solid #1a1a2a' : undefined,
                      }}>
                        <span style={{ color: '#888', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.key}
                        </span>
                        <span style={{
                          color: isNumeric(item.value) ? '#88ccff' : '#cc88ff',
                          marginLeft: 8, flexShrink: 0, textAlign: 'right', maxWidth: '50%',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !loading ? (
        <p style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 16 }}>
          {disabled ? 'Connect to the machine to view settings' : 'No settings loaded — click ↻ to refresh'}
        </p>
      ) : (
        <p style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 16 }}>Loading settings...</p>
      )}

      {/* YAML config viewer */}
      {yamlConfig && (
        <div style={{ marginTop: 12 }}>
          <h3
            onClick={() => toggleGroup('_yaml')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {expandedGroups.has('_yaml') ? '▾' : '▸'} maslow.yaml
          </h3>
          {expandedGroups.has('_yaml') && (
            <pre style={{
              background: '#0a0a14', border: '1px solid #2a2a4a', borderRadius: 4,
              padding: 8, fontSize: 9, color: '#888', fontFamily: 'monospace',
              maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              lineHeight: 1.5,
            }}>
              {yamlConfig}
            </pre>
          )}
        </div>
      )}

      {/* Quick commands */}
      <div style={{ marginTop: 12 }}>
        <h3>Query Commands</h3>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('$S')} title="All settings">$S</button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('$G')} title="Parser state">$G</button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('$I')} title="Build info">$I</button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('$#')} title="Coordinate offsets">$#</button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('MINFO')} title="Maslow info">MINFO</button>
          <button className="btn btn-sm" disabled={disabled} onClick={() => send('$CD')} title="Config dump">$CD</button>
        </div>
        <p style={{ fontSize: 9, color: '#444', marginTop: 4 }}>Responses appear in the Console tab</p>
      </div>
    </div>
  );
}

function isNumeric(s: string): boolean {
  return /^-?[\d.]+$/.test(s.trim());
}
