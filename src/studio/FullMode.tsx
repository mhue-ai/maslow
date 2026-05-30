import { useRef, useState } from 'react';
import { DesignViewport } from './viewport/DesignViewport';
import { SvgPreview2D } from './viewport/SvgPreview2D';
import { MaterialPanel } from './panels/MaterialPanel';
import { SvgImportPanel } from './panels/SvgImportPanel';
import { SvgTransformPanel } from './panels/SvgTransformPanel';
import { DepthPanel } from './panels/DepthPanel';
import { ToolSettingsPanel } from './panels/ToolSettingsPanel';
import { GcodeExportPanel } from './panels/GcodeExportPanel';
import { useDesignStore } from '../store/designStore';
import { saveProject, loadProject } from '../store/projectIO';

type ViewMode = 'design' | '3d';

/**
 * Full mode — one of the three top-level design modes.
 *
 *   Full    — pocket-fill relief (full kerf clearing).   ← THIS FILE
 *   Outline — relief outlines only, fill cleared by hand. See src/outline/OutlineMode.tsx.
 *   Cut     — bit follows the line, no offset.            See src/cut/CutMode.tsx.
 *
 * The `src/studio/` directory holds shared design-surface infrastructure
 * (MaterialPanel, SvgImportPanel, SvgPreview2D, etc.) used by ALL three
 * modes — the "studio" name is legacy and no longer corresponds to a single
 * mode.
 */
export function FullMode() {
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);
  const historyIndex = useDesignStore((s) => s.historyIndex);
  const historyLength = useDesignStore((s) => s.history.length);
  const gcode = useDesignStore((s) => s.gcode);

  const [viewMode, setViewMode] = useState<ViewMode>('design');
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

  const handleViewMode = (mode: ViewMode) => {
    if (mode === '3d') {
      useDesignStore.setState({ showCutPreview: true, showToolpaths: false });
    } else {
      useDesignStore.setState({ showCutPreview: false, showToolpaths: false });
    }
    setViewMode(mode);
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

        <MaterialPanel />
        <SvgImportPanel />
        <SvgTransformPanel />
        <ToolSettingsPanel />
        <GcodeExportPanel />
      </div>

      {/* Center viewport — switches between 2D design view and 3D preview */}
      <div className="viewport">
        {viewMode === 'design' ? <SvgPreview2D /> : <DesignViewport />}
      </div>

      <div className="panel panel-right" style={{ display: 'flex', flexDirection: 'column' }}>
        <DepthPanel />

        {/* View mode switcher — FIXED at bottom */}
        <div style={{ flexShrink: 0, borderTop: '1px solid #2a2a4a', paddingTop: 8, marginTop: 8 }}>
          <h3 style={{ margin: '0 0 6px' }}>View</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`btn btn-sm ${viewMode === 'design' ? 'depth-btn active' : ''}`}
              onClick={() => handleViewMode('design')}
              style={{ flex: 1 }}
            >
              Design
            </button>
            <button
              className={`btn btn-sm ${viewMode === '3d' ? 'depth-btn active' : ''}`}
              onClick={() => handleViewMode('3d')}
              style={{ flex: 1 }}
            >
              3D
            </button>
          </div>
          {gcode && (
            <p style={{ fontSize: 10, color: '#666', marginTop: 6, marginBottom: 0 }}>
              Cut ready. Open the <strong style={{ color: '#88bbff' }}>Preview</strong> step to see exactly what the machine will do.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
