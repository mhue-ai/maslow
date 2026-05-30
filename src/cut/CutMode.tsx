import { useRef, useState } from 'react';
import { SvgPreview2D } from '../studio/viewport/SvgPreview2D';
import { MaterialPanel } from '../studio/panels/MaterialPanel';
import { SvgImportPanel } from '../studio/panels/SvgImportPanel';
import { SvgTransformPanel } from '../studio/panels/SvgTransformPanel';
import { CutExportPanel } from './CutExportPanel';
import { CutToolSettings } from './CutToolSettings';
import { CutShapes } from './CutShapes';
import { DesignChecks } from '../studio/panels/DesignChecks';
import { useDesignStore } from '../store/designStore';
import { useUiStore } from '../store/uiStore';
import { saveProject, loadProject } from '../store/projectIO';

/**
 * The bit-follows-the-line engine, shared by TWO intents:
 *   - Cut Out — cut all the way through; the parts come free (with tabs).
 *   - Score   — shallow lines on the surface (engraving, fold lines, layout).
 * Both trace each selected path AS DRAWN; only the depth differs. The intent
 * (from uiStore) drives the copy and the depth controls here and in the
 * Cutting / G-code panels.
 */
export function CutMode() {
  const intent = useUiStore((s) => s.intent);
  const isScore = intent === 'score';
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
          {isScore ? (
            <>
              <strong>Score</strong> — the bit follows your lines at a shallow
              depth, leaving surface lines (engraving, fold lines, layout marks).
              Pick which lines to score and how deep. To cut shapes all the way
              out use <strong>Cut Out</strong>; to hollow out areas use <strong>Carve</strong>.
            </>
          ) : (
            <>
              <strong>Cut Out</strong> — the bit follows your lines and the parts
              come free from the sheet. Pick which shapes to cut; holding tabs
              are added automatically. To scratch shallow surface lines use
              <strong> Score</strong>; to hollow out areas use <strong>Carve</strong>.
            </>
          )}
        </div>

        <MaterialPanel />
        <SvgImportPanel />
        <SvgTransformPanel />
        <CutToolSettings />
        <DesignChecks />
        <CutExportPanel />
      </div>

      {/* Center viewport — 2D SVG preview */}
      <div className="viewport">
        <SvgPreview2D />
      </div>

      <div className="panel panel-right" style={{ display: 'flex', flexDirection: 'column' }}>
        <CutShapes />

        {gcode && (
          <div style={{ flexShrink: 0, borderTop: '1px solid #2a2a4a', paddingTop: 8, marginTop: 8 }}>
            <p style={{ fontSize: 10, color: '#666', margin: 0 }}>
              Cut ready. Open the <strong style={{ color: '#88bbff' }}>Preview</strong> step to see exactly what the machine will do.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
