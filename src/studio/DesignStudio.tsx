import { useRef, useState } from 'react';
import { DesignViewport } from './viewport/DesignViewport';
import { MaterialPanel } from './panels/MaterialPanel';
import { SvgImportPanel } from './panels/SvgImportPanel';
import { SvgTransformPanel } from './panels/SvgTransformPanel';
import { DepthPanel } from './panels/DepthPanel';
import { ToolSettingsPanel } from './panels/ToolSettingsPanel';
import { GcodeExportPanel } from './panels/GcodeExportPanel';
import { useDesignStore } from '../store/designStore';
import { saveProject, loadProject } from '../store/projectIO';

export function DesignStudio() {
  const showCutPreview = useDesignStore((s) => s.showCutPreview);
  const toggleCutPreview = useDesignStore((s) => s.toggleCutPreview);
  const showToolpaths = useDesignStore((s) => s.showToolpaths);
  const toggleToolpaths = useDesignStore((s) => s.toggleToolpaths);
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
          <button
            className="btn btn-sm"
            onClick={undo}
            disabled={historyIndex < 0}
            title="Undo (Ctrl+Z)"
            style={{ flex: 1 }}
          >
            Undo
          </button>
          <button
            className="btn btn-sm"
            onClick={redo}
            disabled={historyIndex >= historyLength - 1 || historyLength === 0}
            title="Redo (Ctrl+Y)"
            style={{ flex: 1 }}
          >
            Redo
          </button>
        </div>
        {loadError && <div className="warning">{loadError}</div>}

        <MaterialPanel />
        <SvgImportPanel />
        <SvgTransformPanel />
        <ToolSettingsPanel />
        <GcodeExportPanel />
      </div>

      <DesignViewport />

      <div className="panel panel-right">
        <DepthPanel />
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          <button className="btn btn-sm" onClick={toggleCutPreview} style={{ flex: 1 }}>
            {showCutPreview ? 'Flat View' : '3D Preview'}
          </button>
          {gcode && (
            <button className="btn btn-sm" onClick={toggleToolpaths} style={{ flex: 1 }}>
              {showToolpaths ? 'Hide Paths' : 'Toolpaths'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
