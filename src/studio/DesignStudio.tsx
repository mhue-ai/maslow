import { DesignViewport } from './viewport/DesignViewport';
import { MaterialPanel } from './panels/MaterialPanel';
import { SvgImportPanel } from './panels/SvgImportPanel';
import { DepthPanel } from './panels/DepthPanel';
import { ToolSettingsPanel } from './panels/ToolSettingsPanel';
import { GcodeExportPanel } from './panels/GcodeExportPanel';
import { useDesignStore } from '../store/designStore';

export function DesignStudio() {
  const showCutPreview = useDesignStore((s) => s.showCutPreview);
  const toggleCutPreview = useDesignStore((s) => s.toggleCutPreview);

  return (
    <div className="design-studio">
      <div className="panel panel-left">
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
