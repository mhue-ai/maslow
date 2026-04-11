import { useDesignStore } from '../../store/designStore';
import type { WorkOrigin } from '../../types/design';

export function ToolSettingsPanel() {
  const config = useDesignStore((s) => s.toolConfig);
  const setConfig = useDesignStore((s) => s.setToolConfig);
  const paths = useDesignStore((s) => s.paths);

  if (paths.length === 0) {
    return (
      <div>
        <h3>Tool Settings</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import SVG first</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Tool Settings</h3>

      <label>
        Work Origin
        <select
          value={config.workOrigin}
          onChange={(e) => setConfig({ workOrigin: e.target.value as WorkOrigin })}
          style={{
            padding: '4px 6px',
            border: '1px solid #333',
            borderRadius: 4,
            background: '#0d0d1a',
            color: '#ddd',
            fontSize: 13,
          }}
        >
          <option value="center">Center</option>
          <option value="bottom-left">Bottom-Left</option>
          <option value="top-left">Top-Left</option>
        </select>
      </label>

      <label>
        Bit diameter
        <input
          type="number"
          value={config.bitDiameter}
          min={1}
          max={25}
          step={0.01}
          onChange={(e) => setConfig({ bitDiameter: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>

      <label>
        Feed rate
        <input
          type="number"
          value={config.feedRate}
          min={100}
          max={2500}
          step={50}
          onChange={(e) => setConfig({ feedRate: Number(e.target.value) })}
        />
        <span className="unit">mm/min</span>
      </label>

      <label>
        Plunge rate
        <input
          type="number"
          value={config.plungeRate}
          min={50}
          max={300}
          step={10}
          onChange={(e) => setConfig({ plungeRate: Number(e.target.value) })}
        />
        <span className="unit">mm/min</span>
      </label>

      <label>
        Depth/pass
        <input
          type="number"
          value={config.depthPerPass}
          min={0.5}
          max={10}
          step={0.5}
          onChange={(e) => setConfig({ depthPerPass: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>

      <label>
        RPM
        <input
          type="number"
          value={config.rpm}
          min={5000}
          max={30000}
          step={1000}
          onChange={(e) => setConfig({ rpm: Number(e.target.value) })}
        />
      </label>

      <label>
        Stepover
        <input
          type="number"
          value={Math.round(config.stepover * 100)}
          min={10}
          max={80}
          step={5}
          onChange={(e) => setConfig({ stepover: Number(e.target.value) / 100 })}
        />
        <span className="unit">%</span>
      </label>

      <label>
        Safe height
        <input
          type="number"
          value={config.safeHeight}
          min={2}
          max={20}
          step={1}
          onChange={(e) => setConfig({ safeHeight: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>

      <h3>Tabs (Through-cuts)</h3>

      <label>
        Tab count
        <input
          type="number"
          value={config.tabCount}
          min={0}
          max={12}
          step={1}
          onChange={(e) => setConfig({ tabCount: Number(e.target.value) })}
        />
      </label>

      <label>
        Tab width
        <input
          type="number"
          value={config.tabWidth}
          min={4}
          max={25}
          step={1}
          onChange={(e) => setConfig({ tabWidth: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>

      <label>
        Tab height
        <input
          type="number"
          value={config.tabHeight}
          min={2}
          max={15}
          step={0.5}
          onChange={(e) => setConfig({ tabHeight: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>
    </div>
  );
}
