import { useRef, useState } from 'react';
import { SvgPreview2D } from '../studio/viewport/SvgPreview2D';
import { MaterialPanel } from '../studio/panels/MaterialPanel';
import { SvgImportPanel } from '../studio/panels/SvgImportPanel';
import { SvgTransformPanel } from '../studio/panels/SvgTransformPanel';
import { LiteGcodeExportPanel } from './LiteGcodeExportPanel';
import { ToolSettingsLight } from './ToolSettingsLight';
import { ShapesLight } from './ShapesLight';
import { useDesignStore } from '../store/designStore';
import { saveProject, loadProject } from '../store/projectIO';

/**
 * Design Light — simplified cut-only mode.
 *
 * Every shape is either CUT (full-thickness through the material) or SKIP.
 * No pockets, no reliefs, no depth-per-shape. One shape is the PROFILE
 * (outer release cut, last in the job, cut with tabs); the rest are
 * internal through-cuts. The full Design Studio is still available for
 * users who need relief / pocket work.
 */
export function DesignLight() {
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
    <div className="design-studio">
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
          <strong>Design Light</strong> — outline-only relief mode. Mark shapes as
          <strong style={{ color: '#ff6666' }}> Relieve</strong> and the toolpath cuts
          the outline of each relief plus any island inside it. Clear the waste between
          outlines by hand. For pocket-filled reliefs, use <strong>Design Studio</strong>.
        </div>

        <MaterialPanel />
        <SvgImportPanel />
        <SvgTransformPanel />
        <ToolSettingsLight />
        <LiteGcodeExportPanel />
      </div>

      {/* Center viewport — 2D SVG preview */}
      <div className="viewport">
        <SvgPreview2D />
      </div>

      <div className="panel panel-right" style={{ display: 'flex', flexDirection: 'column' }}>
        <ShapesLight />

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
