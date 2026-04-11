import { useRef, useState } from 'react';
import { DesignViewport } from './viewport/DesignViewport';
import { MaterialPanel } from './panels/MaterialPanel';
import { SvgImportPanel } from './panels/SvgImportPanel';
import { DepthPanel } from './panels/DepthPanel';
import { ToolSettingsPanel } from './panels/ToolSettingsPanel';
import { GcodeExportPanel } from './panels/GcodeExportPanel';
import { useDesignStore } from '../store/designStore';
import { saveProject, loadProject } from '../store/projectIO';

export function DesignStudio() {
  const showCutPreview = useDesignStore((s) => s.showCutPreview);
  const toggleCutPreview = useDesignStore((s) => s.toggleCutPreview);
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
    // Reset input so same file can be loaded again
    e.target.value = '';
  };

  return (
    <div className="design-studio">
      <div className="panel panel-left">
        {/* Project save/load */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button className="btn btn-sm" onClick={handleSave} style={{ flex: 1 }}>
            Save Project
          </button>
          <button
            className="btn btn-sm"
            onClick={() => loadInputRef.current?.click()}
            style={{ flex: 1 }}
          >
            Load Project
          </button>
          <input
            ref={loadInputRef}
            type="file"
            accept=".json,.maslow.json"
            onChange={handleLoad}
            style={{ display: 'none' }}
          />
        </div>
        {loadError && <div className="warning">{loadError}</div>}

        <MaterialPanel />
        <SvgImportPanel />
        <ToolSettingsPanel />
        <GcodeExportPanel />
      </div>

      <DesignViewport />

      <div className="panel panel-right">
        <DepthPanel />
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={toggleCutPreview}>
            {showCutPreview ? 'Show Flat View' : 'Show 3D Preview'}
          </button>
        </div>
      </div>
    </div>
  );
}
