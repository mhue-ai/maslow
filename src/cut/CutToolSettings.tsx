import { useDesignStore } from '../store/designStore';
import type { WorkOrigin } from '../types/design';

/**
 * Tool Settings — Cut mode.
 *
 * The two parameters the user cares about most for Cut mode (tool width =
 * bit diameter, tool depth = cutDepth) are surfaced inline at the top of
 * CutShapes. This panel exposes the secondary machine parameters:
 * feed/plunge rate, depth-per-pass, RPM, safe height, edge clearance,
 * work origin, plus the tab knobs when the cut goes through.
 */
export function CutToolSettings() {
  const config = useDesignStore((s) => s.toolConfig);
  const setConfig = useDesignStore((s) => s.setToolConfig);
  const paths = useDesignStore((s) => s.paths);
  const cutDepth = useDesignStore((s) => s.cutDepth);
  const material = useDesignStore((s) => s.material);

  if (paths.length === 0) {
    return (
      <div>
        <h3><span className="step">3</span> Tool Settings</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import SVG first</p>
      </div>
    );
  }

  const isThrough = cutDepth >= material.thickness - 0.1;

  return (
    <div>
      <h3><span className="step">3</span> Tool Settings</h3>

      <label data-tip="Where (0,0) is on the material.">
        Work Origin
        <select
          value={config.workOrigin}
          onChange={(e) => setConfig({ workOrigin: e.target.value as WorkOrigin })}
          style={{ padding: '4px 6px', border: '1px solid #333', borderRadius: 4, background: '#0d0d1a', color: '#ddd', fontSize: 13 }}
        >
          <option value="center">Center</option>
          <option value="bottom-left">Bottom-Left</option>
          <option value="top-left">Top-Left</option>
        </select>
      </label>

      <label data-tip="Diameter of your router bit. Common: 1/4&quot; = 6.35mm, 1/8&quot; = 3.175mm. In Cut mode the bit centerline follows the line — the bit diameter is the groove width.">
        Bit diameter
        <input type="number" value={config.bitDiameter} min={1} max={25} step={0.01}
          onChange={(e) => setConfig({ bitDiameter: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      <label data-tip="How fast the bit moves horizontally while cutting.">
        Feed rate
        <input type="number" value={config.feedRate} min={100} max={2500} step={50}
          onChange={(e) => setConfig({ feedRate: Number(e.target.value) })} />
        <span className="unit">mm/min</span>
      </label>

      <label data-tip="How fast the bit plunges downward into material.">
        Plunge rate
        <input type="number" value={config.plungeRate} min={50} max={300} step={10}
          onChange={(e) => setConfig({ plungeRate: Number(e.target.value) })} />
        <span className="unit">mm/min</span>
      </label>

      <label data-tip="Maximum depth per pass. Multiple passes are used to reach the full cut depth. Rule: don't exceed 50-100% of bit diameter per pass.">
        Depth/pass
        <input type="number" value={config.depthPerPass} min={0.5} max={10} step={0.5}
          onChange={(e) => setConfig({ depthPerPass: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      <label data-tip="Router spindle speed. DeWalt DWP611: dial 1 = ~16,000, dial 6 = ~27,000 RPM.">
        RPM
        <input type="number" value={config.rpm} min={5000} max={30000} step={1000}
          onChange={(e) => setConfig({ rpm: Number(e.target.value) })} />
      </label>

      <label data-tip="Height above material surface for rapid (non-cutting) moves.">
        Safe height
        <input type="number" value={config.safeHeight} min={2} max={20} step={1}
          onChange={(e) => setConfig({ safeHeight: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      <label data-tip="Minimum distance from sheet edges. Maslow belt accuracy degrades within ~100mm of frame edges.">
        Edge clearance
        <input type="number" value={config.edgeClearance} min={50} max={200} step={10}
          onChange={(e) => setConfig({ edgeClearance: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      {isThrough ? (
        <>
          <h3 data-tip="Small bridges of material left during through-cuts to keep pieces from falling. Auto-engaged because tool depth ≥ material thickness.">
            Through-cut tabs
          </h3>

          <label data-tip="Number of tabs evenly spaced around each through-cut.">
            Tab count
            <input type="number" value={config.tabCount} min={0} max={12} step={1}
              onChange={(e) => setConfig({ tabCount: Number(e.target.value) })} />
          </label>

          <label data-tip="Width of each tab along the cut path. 12mm (2x bit diameter) is standard.">
            Tab width
            <input type="number" value={config.tabWidth} min={4} max={25} step={1}
              onChange={(e) => setConfig({ tabWidth: Number(e.target.value) })} />
            <span className="unit">mm</span>
          </label>

          <label data-tip="How tall each tab is (how much material remains under the tab).">
            Tab height
            <input type="number" value={config.tabHeight} min={2} max={15} step={0.5}
              onChange={(e) => setConfig({ tabHeight: Number(e.target.value) })} />
            <span className="unit">mm</span>
          </label>
        </>
      ) : (
        <p style={{ fontSize: 10, color: '#555', marginTop: 8 }}>
          Tabs auto-engage when tool depth reaches material thickness ({material.thickness}mm).
        </p>
      )}
    </div>
  );
}
