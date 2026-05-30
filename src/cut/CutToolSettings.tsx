import { useDesignStore } from '../store/designStore';
import type { WorkOrigin } from '../types/design';
import { BitPicker } from '../studio/panels/BitPicker';
import { AdvancedSection } from '../studio/panels/AdvancedSection';

/**
 * Cutting setup — Cut Out mode.
 *
 * Beginner-visible: where zero is, which bit, and how deep to cut. Every raw
 * machine number (feed/plunge/depth-per-pass/RPM/clearances/tabs) lives in the
 * Advanced disclosure — derived from the material + bit, overridable if wanted.
 */
export function CutToolSettings() {
  const config = useDesignStore((s) => s.toolConfig);
  const setConfig = useDesignStore((s) => s.setToolConfig);
  const paths = useDesignStore((s) => s.paths);
  const cutDepth = useDesignStore((s) => s.cutDepth);
  const setCutDepth = useDesignStore((s) => s.setCutDepth);
  const material = useDesignStore((s) => s.material);

  if (paths.length === 0) {
    return (
      <div>
        <h3><span className="step">3</span> Cutting</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Add a design first</p>
      </div>
    );
  }

  const isThrough = cutDepth >= material.thickness - 0.1;

  return (
    <div>
      <h3><span className="step">3</span> Cutting</h3>

      <label data-tip="Where (0,0) sits on your material. Set the same spot as zero on the machine before cutting.">
        Where’s zero?
        <select
          value={config.workOrigin}
          onChange={(e) => setConfig({ workOrigin: e.target.value as WorkOrigin })}
          style={{ padding: '4px 6px', border: '1px solid #333', borderRadius: 4, background: '#0d0d1a', color: '#ddd', fontSize: 13 }}
        >
          <option value="center">Middle of the material</option>
          <option value="bottom-left">Bottom-left corner</option>
          <option value="top-left">Top-left corner</option>
        </select>
      </label>

      <BitPicker />

      <label data-tip="How deep to cut along each line. Reach the material thickness to cut all the way through — tabs are added automatically so parts don’t fly loose.">
        How deep?
        <input type="number" value={cutDepth} min={0.5} max={Math.max(material.thickness, cutDepth)} step={0.5}
          onChange={(e) => setCutDepth(Number(e.target.value))} />
        <span className="unit">mm</span>
      </label>
      <p style={{ fontSize: 10, color: isThrough ? '#ffaa44' : '#666', margin: '2px 0 0' }}>
        {isThrough
          ? `Cuts through all ${material.thickness}mm — tabs hold the parts.`
          : `Grooves ${cutDepth}mm deep (material is ${material.thickness}mm thick).`}
      </p>

      <AdvancedSection>
        <label data-tip="Bit diameter in mm. Usually set by the bit picker above — change here for an odd-size bit. The bit centerline follows each line, so this is the groove width.">
          Tool width (bit)
          <input type="number" value={config.bitDiameter} min={0.5} max={25} step={0.01}
            onChange={(e) => setConfig({ bitDiameter: Number(e.target.value) })} />
          <span className="unit">mm</span>
        </label>

        <label data-tip="How fast the bit moves sideways while cutting.">
          Feed rate
          <input type="number" value={config.feedRate} min={100} max={2500} step={50}
            onChange={(e) => setConfig({ feedRate: Number(e.target.value) })} />
          <span className="unit">mm/min</span>
        </label>

        <label data-tip="How fast the bit dips down into the material.">
          Plunge rate
          <input type="number" value={config.plungeRate} min={50} max={300} step={10}
            onChange={(e) => setConfig({ plungeRate: Number(e.target.value) })} />
          <span className="unit">mm/min</span>
        </label>

        <label data-tip="How much it cuts on each pass. Deep cuts are split into several passes.">
          Depth per pass
          <input type="number" value={config.depthPerPass} min={0.5} max={10} step={0.5}
            onChange={(e) => setConfig({ depthPerPass: Number(e.target.value) })} />
          <span className="unit">mm</span>
        </label>

        <label data-tip="Router spindle speed.">
          RPM
          <input type="number" value={config.rpm} min={5000} max={30000} step={1000}
            onChange={(e) => setConfig({ rpm: Number(e.target.value) })} />
        </label>

        <label data-tip="How high the bit lifts for non-cutting moves.">
          Safe height
          <input type="number" value={config.safeHeight} min={2} max={20} step={1}
            onChange={(e) => setConfig({ safeHeight: Number(e.target.value) })} />
          <span className="unit">mm</span>
        </label>

        <label data-tip="Stay-away margin from the sheet edges. The Maslow loses accuracy near the frame edges.">
          Edge margin
          <input type="number" value={config.edgeClearance} min={50} max={200} step={10}
            onChange={(e) => setConfig({ edgeClearance: Number(e.target.value) })} />
          <span className="unit">mm</span>
        </label>

        {isThrough && (
          <>
            <h3 style={{ marginTop: 8 }} data-tip="Little bridges of material left behind so cut-out parts don’t come loose mid-cut. Snap or sand them off afterwards.">
              Holding tabs
            </h3>
            <label data-tip="How many tabs around each part.">
              Tab count
              <input type="number" value={config.tabCount} min={0} max={12} step={1}
                onChange={(e) => setConfig({ tabCount: Number(e.target.value) })} />
            </label>
            <label data-tip="How wide each tab is.">
              Tab width
              <input type="number" value={config.tabWidth} min={4} max={25} step={1}
                onChange={(e) => setConfig({ tabWidth: Number(e.target.value) })} />
              <span className="unit">mm</span>
            </label>
            <label data-tip="How tall each tab is (material left under it).">
              Tab height
              <input type="number" value={config.tabHeight} min={2} max={15} step={0.5}
                onChange={(e) => setConfig({ tabHeight: Number(e.target.value) })} />
              <span className="unit">mm</span>
            </label>
          </>
        )}
      </AdvancedSection>
    </div>
  );
}
