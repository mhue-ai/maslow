import { useRef, useState } from 'react';
import { SvgPreview2D } from '../studio/viewport/SvgPreview2D';
import { MaterialPanel } from '../studio/panels/MaterialPanel';
import { SvgImportPanel } from '../studio/panels/SvgImportPanel';
import { SvgTransformPanel } from '../studio/panels/SvgTransformPanel';
import { OutlineExportPanel } from './OutlineExportPanel';
import { OutlineToolSettings } from './OutlineToolSettings';
import { OutlineShapes } from './OutlineShapes';
import { useDesignStore } from '../store/designStore';
import { saveProject, loadProject } from '../store/projectIO';

/**
 * Outline mode — one of the three top-level design modes.
 *
 *   Full    — pocket-fill relief (full kerf clearing).  See src/studio/FullMode.tsx.
 *   Outline — relief outlines only, fill cleared by hand.   ← THIS FILE
 *   Cut     — bit follows the line, no offset.               See src/cut/CutMode.tsx.
 *
 * In Outline mode the user marks waste shapes as "Relieve" and any non-relief
 * shape geometrically inside one is auto-detected as an island. The toolpath
 * cuts the outline of each relief (bit offset INSIDE) and each island
 * (bit offset OUTSIDE) at the relief depth. Optional outer profile through-cut
 * happens last with tabs.
 */
export function OutlineMode() {
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);
  const historyIndex = useDesignStore((s) => s.historyIndex);
  const historyLength = useDesignStore((s) => s.history.length);
  const gcode = useDesignStore((s) => s.gcode);

  const loadInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSave = () => {
    const name = prompt('Project name:', 'my-project');
    if (name) saveProject(name);
  };

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    const err = await loadProject(file);
    if (err) setLoadError(err);
    e.target.value = '';
  };

  return (
    <div className="design-mode">
      <div className="panel panel-left">
        {/* Project + Undo/Redo bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <button className="btn btn-sm" onClick={handleSave} style={{ flex: 1 }}>Save</button>
          <button className="btn btn-sm" onClick={() => loadInputRef.current?.click()} style={{ flex: 1 }}>Load</button>
          <input ref={loadInputRef} type="file" accept=".json,.maslow.json" onChange={handleLoad} style={{ display: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button className="btn btn-sm" onClick={undo} disabled={historyIndex < 0} title="Undo (Ctrl+Z)" style={{ flex: 1 }}>Undo</button>
          <button className="btn btn-sm" onClick={redo} disabled={historyIndex >= historyLength - 1 || historyLength === 0} title="Redo (Ctrl+Y)" style={{ flex: 1 }}>Redo</button>
        </div>
        {loadError && <div className="warning">{loadError}</div>}

        <div style={{
          marginBottom: 10, padding: '6px 8px', background: '#1a2a4a',
          border: '1px solid #2a4a7a', borderRadius: 4, fontSize: 10, color: '#88bbff',
        }}>
          <strong>Outline mode</strong> — relief outlines only. Mark shapes as
          <strong style={{ color: '#ff6666' }}> Relieve</strong> and the toolpath cuts
          the outline of each relief plus any island inside it. Clear the waste between
          outlines by hand. For pocket-filled reliefs use <strong>Full</strong>; for
          straight bit-follows-line cuts use <strong>Cut</strong>.
        </div>

        <MaterialPanel />
        <SvgImportPanel />
        <SvgTransformPanel />
        <OutlineToolSettings />
        <OutlineExportPanel />
      </div>

      {/* Center viewport — 2D SVG preview */}
      <div className="viewport">
        <SvgPreview2D />
      </div>

      <div className="panel panel-right" style={{ display: 'flex', flexDirection: 'column' }}>
        <OutlineShapes />

        {gcode && (
          <div style={{ flexShrink: 0, borderTop: '1px solid #2a2a4a', paddingTop: 8, marginTop: 8 }}>
            <p style={{ fontSize: 10, color: '#666', margin: 0 }}>
              G-code ready. Switch to the <strong style={{ color: '#88bbff' }}>Visualizer</strong> tab to preview the toolpath.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
