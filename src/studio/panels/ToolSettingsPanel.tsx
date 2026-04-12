import { useDesignStore } from '../../store/designStore';
import type { WorkOrigin } from '../../types/design';

export function ToolSettingsPanel() {
  const config = useDesignStore((s) => s.toolConfig);
  const setConfig = useDesignStore((s) => s.setToolConfig);
  const paths = useDesignStore((s) => s.paths);

  if (paths.length === 0) {
    return (
      <div>
        <h3><span className="step">3</span> Tool Settings</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import SVG first</p>
      </div>
    );
  }

  return (
    <div>
      <h3><span className="step">3</span> Tool Settings</h3>

      <label data-tip="Where (0,0) is on the material. Center: origin at material center. Bottom-Left: origin at bottom-left corner.">
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

      <label data-tip="Diameter of your router bit. Common: 1/4&quot; = 6.35mm, 1/8&quot; = 3.175mm. Affects kerf width and pocket clearing.">
        Bit diameter
        <input type="number" value={config.bitDiameter} min={1} max={25} step={0.01}
          onChange={(e) => setConfig({ bitDiameter: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      <label data-tip="How fast the bit moves horizontally while cutting. Slower = cleaner cut, faster = quicker job. Maslow max: 2500mm/min.">
        Feed rate
        <input type="number" value={config.feedRate} min={100} max={2500} step={50}
          onChange={(e) => setConfig({ feedRate: Number(e.target.value) })} />
        <span className="unit">mm/min</span>
      </label>

      <label data-tip="How fast the bit plunges downward into material. Should be slower than feed rate to avoid bit breakage. Maslow Z max: 300mm/min.">
        Plunge rate
        <input type="number" value={config.plungeRate} min={50} max={300} step={10}
          onChange={(e) => setConfig({ plungeRate: Number(e.target.value) })} />
        <span className="unit">mm/min</span>
      </label>

      <label data-tip="Maximum depth of cut per pass. Multiple passes are used for deep cuts. Rule: don't exceed 50-100% of bit diameter per pass.">
        Depth/pass
        <input type="number" value={config.depthPerPass} min={0.5} max={10} step={0.5}
          onChange={(e) => setConfig({ depthPerPass: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      <label data-tip="Router spindle speed. DeWalt DWP611: dial 1 = ~16,000, dial 6 = ~27,000 RPM. Higher RPM for harder materials.">
        RPM
        <input type="number" value={config.rpm} min={5000} max={30000} step={1000}
          onChange={(e) => setConfig({ rpm: Number(e.target.value) })} />
      </label>

      <label data-tip="How much the bit overlaps between pocket clearing passes. Lower % = smoother finish but slower. 40% is a good default.">
        Stepover
        <input type="number" value={Math.round(config.stepover * 100)} min={10} max={80} step={5}
          onChange={(e) => setConfig({ stepover: Number(e.target.value) / 100 })} />
        <span className="unit">%</span>
      </label>

      <label data-tip="Height above material surface for rapid (non-cutting) moves. Higher = safer but slower. 5mm is typical.">
        Safe height
        <input type="number" value={config.safeHeight} min={2} max={20} step={1}
          onChange={(e) => setConfig({ safeHeight: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      <h3 data-tip="Small bridges of material left during through-cuts to keep the piece from falling. Cut with a hand saw after CNC finishes.">
        Tabs (Through-cuts)
      </h3>

      <label data-tip="Number of tabs evenly spaced around through-cut perimeter. 4 is standard. 0 = no tabs (piece may shift during cut).">
        Tab count
        <input type="number" value={config.tabCount} min={0} max={12} step={1}
          onChange={(e) => setConfig({ tabCount: Number(e.target.value) })} />
      </label>

      <label data-tip="Width of each tab along the cut path. Wider = stronger hold but harder to remove. 12mm (2x bit diameter) is standard.">
        Tab width
        <input type="number" value={config.tabWidth} min={4} max={25} step={1}
          onChange={(e) => setConfig({ tabWidth: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>

      <label data-tip="How tall each tab is (how much material remains). About half the material thickness keeps the piece secure.">
        Tab height
        <input type="number" value={config.tabHeight} min={2} max={15} step={0.5}
          onChange={(e) => setConfig({ tabHeight: Number(e.target.value) })} />
        <span className="unit">mm</span>
      </label>
    </div>
  );
}
