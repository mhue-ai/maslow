import { useEffect, useRef, useState } from 'react';
import { VisualizerViewport, type VisualizerMode } from './VisualizerViewport';
import { SimulationPanel } from '../studio/panels/SimulationPanel';
import { useDesignStore } from '../store/designStore';
import { gcodeToSegments } from '../gcode/gcodeToPoints';

/**
 * Full-screen G-code visualizer — top-level view alongside Design Studio and
 * Machine Control. Shows the generated toolpath on a neutral 3D material plate
 * with animated playback controls. Also supports loading G-code from a file
 * independently of the Design Studio.
 */
export function Visualizer() {
  const gcode = useDesignStore((s) => s.gcode);
  const setGcode = useDesignStore((s) => s.setGcode);
  const material = useDesignStore((s) => s.material);

  const [loadedFilename, setLoadedFilename] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<VisualizerMode>('toolpath');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Force toolpaths on and cut preview off while this view is mounted.
  // The Visualizer is the ONLY place showing toolpaths now.
  useEffect(() => {
    useDesignStore.setState({ showToolpaths: true, showCutPreview: false });
    return () => {
      useDesignStore.getState().simReset();
      useDesignStore.setState({ showToolpaths: false });
    };
  }, []);

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadError(null);
    const name = file.name.toLowerCase();
    if (!name.endsWith('.nc') && !name.endsWith('.gcode') && !name.endsWith('.ngc') && !name.endsWith('.tap')) {
      setLoadError('Expected a G-code file (.nc, .gcode, .ngc, .tap)');
      return;
    }

    try {
      const text = await file.text();
      // Basic sanity check — must contain at least one G0/G1 move
      if (!/\bG0*[01]\b/.test(text)) {
        setLoadError('File does not appear to contain G-code moves (no G0/G1 found)');
        return;
      }
      setGcode(text);
      setLoadedFilename(file.name);
      useDesignStore.getState().simReset();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearLoaded = () => {
    setGcode(null);
    setLoadedFilename(null);
    setLoadError(null);
    useDesignStore.getState().simReset();
  };

  // Quick stats derived from gcode
  const stats = (() => {
    if (!gcode) return null;
    const lines = gcode.split('\n');
    const segments = gcodeToSegments(lines);
    const cuts = segments.filter((s) => s.type === 'cut');
    const rapids = segments.filter((s) => s.type === 'rapid');
    const dist = (list: typeof segments) =>
      list.reduce((sum, s) => {
        const dx = s.to.x - s.from.x;
        const dy = s.to.y - s.from.y;
        const dz = s.to.z - s.from.z;
        return sum + Math.sqrt(dx * dx + dy * dy + dz * dz);
      }, 0);
    return {
      segments: segments.length,
      cuts: cuts.length,
      rapids: rapids.length,
      cutDistM: dist(cuts) / 1000,
      rapidDistM: dist(rapids) / 1000,
    };
  })();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    }}>
      {/* Top bar with stats + mode toggle + load button */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px',
        background: '#0d0d1a', borderBottom: '1px solid #2a2a4a',
        fontSize: 11, color: '#888', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Mode toggle — shown whether or not gcode is loaded so it's discoverable */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid #2a2a4a', borderRadius: 4, overflow: 'hidden' }}>
          {(['toolpath', 'rendered'] as VisualizerMode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  background: active ? '#1a2a4a' : 'transparent',
                  color: active ? '#88bbff' : '#888',
                  border: 'none',
                  padding: '4px 12px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: active ? 600 : 400,
                }}
                title={
                  m === 'toolpath'
                    ? 'Show G-code lines and tool head'
                    : 'Show simulated workpiece as material is removed'
                }
              >
                {m === 'toolpath' ? 'Toolpath' : 'Rendered'}
              </button>
            );
          })}
        </div>

        {stats ? (
          <>
            <div>
              <span style={{ color: '#555' }}>Material: </span>
              <span style={{ color: '#ccc', fontFamily: 'monospace' }}>
                {material.width} × {material.height} × {material.thickness} mm
              </span>
            </div>
            <div>
              <span style={{ color: '#555' }}>Segments: </span>
              <span style={{ color: '#ccc' }}>{stats.segments.toLocaleString()}</span>
            </div>
            <div>
              <span style={{ color: '#555' }}>Cuts: </span>
              <span style={{ color: '#44cc44' }}>{stats.cuts.toLocaleString()}</span>
              <span style={{ color: '#444' }}> ({stats.cutDistM.toFixed(1)} m)</span>
            </div>
            <div>
              <span style={{ color: '#555' }}>Rapids: </span>
              <span style={{ color: '#88aacc' }}>{stats.rapids.toLocaleString()}</span>
              <span style={{ color: '#444' }}> ({stats.rapidDistM.toFixed(1)} m)</span>
            </div>
            {loadedFilename && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#555' }}>Loaded:</span>
                <span style={{ color: '#88bbff', fontFamily: 'monospace' }}>{loadedFilename}</span>
                <button
                  onClick={handleClearLoaded}
                  style={{
                    background: 'none', border: '1px solid #444', color: '#aaa',
                    padding: '2px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            {!loadedFilename && (
              <div style={{ marginLeft: 'auto' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: '#1a2a4a', border: '1px solid #2a4a7a', color: '#88bbff',
                    padding: '4px 12px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Load G-Code File
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#666' }}>No G-code loaded</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: '#1a2a4a', border: '1px solid #2a4a7a', color: '#88bbff',
                padding: '4px 12px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
              }}
            >
              Load G-Code File
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".nc,.gcode,.ngc,.tap"
          onChange={handleFileLoad}
          style={{ display: 'none' }}
        />
      </div>

      {loadError && (
        <div style={{
          padding: '6px 16px', background: '#3a1a1a', color: '#ff8888',
          borderBottom: '1px solid #5a2a2a', fontSize: 11,
        }}>
          {loadError}
        </div>
      )}

      {/* 3D viewport — fills remaining space */}
      <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative' }}>
        {!gcode ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#666', gap: 16, padding: 32, background: '#0a0a14',
          }}>
            <div style={{ fontSize: 48, opacity: 0.15 }}>▶</div>
            <div style={{ fontSize: 18, color: '#aaa', fontWeight: 500 }}>No G-Code to Visualize</div>
            <div style={{ fontSize: 13, color: '#666', maxWidth: 460, textAlign: 'center', lineHeight: 1.6 }}>
              Generate G-Code in the <strong style={{ color: '#aaa' }}>Design Studio</strong> tab,
              or load an existing <code style={{ color: '#88bbff' }}>.nc</code> /{' '}
              <code style={{ color: '#88bbff' }}>.gcode</code> file using the button above.
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                marginTop: 8,
                background: '#1a2a4a', border: '1px solid #2a4a7a', color: '#88bbff',
                padding: '8px 20px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
              }}
            >
              Load G-Code File
            </button>
          </div>
        ) : (
          <>
            <VisualizerViewport mode={mode} />

            {/* Legend overlay — mode-specific */}
            <div style={{
              position: 'absolute', top: 12, left: 12, padding: '8px 12px',
              background: 'rgba(13, 13, 26, 0.85)', border: '1px solid #2a2a4a',
              borderRadius: 4, fontSize: 10, color: '#888',
              display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none',
            }}>
              <div style={{ color: '#aaa', fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
                {mode === 'toolpath' ? 'Toolpath' : 'Rendered Workpiece'}
              </div>
              {mode === 'toolpath' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 2, background: '#44cc44' }} />
                    <span>Completed cut</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 2, background: '#444' }} />
                    <span>Upcoming cut</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 2, background: '#335588' }} />
                    <span>Rapid move</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffcc00' }} />
                    <span>Tool head</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 16, height: 10, background: 'linear-gradient(to right, #d1a66e, #8a5a32, #3a2414)', borderRadius: 2 }} />
                    <span>Uncut → full-depth</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 10, background: '#d1a66e' }} />
                    <span>Raised feature</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 10, background: '#8a5a32' }} />
                    <span>Pocket floor</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 10, background: '#3a2414' }} />
                    <span>Through-cut</span>
                  </div>
                  <div style={{ color: '#666', fontSize: 9, marginTop: 4, maxWidth: 180 }}>
                    Surface drops as the bit removes material. Use the play
                    controls to watch the workpiece take shape.
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Simulation controls — only when G-code exists */}
      {gcode && (
        <div style={{
          flexShrink: 0, padding: 12, background: '#0a0a14',
          borderTop: '1px solid #2a2a4a',
        }}>
          <SimulationPanel />
        </div>
      )}
    </div>
  );
}
