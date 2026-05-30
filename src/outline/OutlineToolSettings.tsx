import { useDesignStore } from '../store/designStore';
import type { WorkOrigin } from '../types/design';
import { BitPicker } from '../studio/panels/BitPicker';
import { AdvancedSection } from '../studio/panels/AdvancedSection';

/**
 * Cutting setup — Score / relief-outline mode.
 *
 * Beginner-visible: where zero is, which bit, and the relief depth. Raw machine
 * numbers + the profile tabs live in Advanced.
 */
export function OutlineToolSettings() {
  const config = useDesignStore((s) => s.toolConfig);
  const setConfig = useDesignStore((s) => s.setToolConfig);
  const paths = useDesignStore((s) => s.paths);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const material = useDesignStore((s) => s.material);
  const outlineReliefDepth = useDesignStore((s) => s.outlineReliefDepth);
  const setOutlineReliefDepth = useDesignStore((s) => s.setOutlineReliefDepth);

  if (paths.length === 0) {
    return (
      <div>
        <h3><span className="step">3</span> Cutting</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Add a design first</p>
      </div>
    );
  }

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

      <label data-tip="How deep to carve down around the shapes you mark. You clear the waste in between by hand. Must be less than the material thickness.">
        Relief depth
        <input type="number" value={outlineReliefDepth} min={0.5} max={material.thickness - 0.5} step={0.5}
          onChange={(e) => setOutlineReliefDepth(Number(e.target.value))} />
        <span className="unit">mm</span>
      </label>

      <AdvancedSection>
        <label data-tip="Bit diameter in mm. Usually set by the bit picker above. Controls how far the path is offset from each line so islands stay full size.">
          Bit diameter
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

        {profileCutId && (
          <>
            <h3 style={{ marginTop: 8 }} data-tip="If you pick an outer profile to release the whole piece, these little bridges hold it until you cut them.">
              Profile tabs
            </h3>
            <label>
              Tab count
              <input type="number" value={config.tabCount} min={0} max={12} step={1}
                onChange={(e) => setConfig({ tabCount: Number(e.target.value) })} />
            </label>
            <label>
              Tab width
              <input type="number" value={config.tabWidth} min={4} max={25} step={1}
                onChange={(e) => setConfig({ tabWidth: Number(e.target.value) })} />
              <span className="unit">mm</span>
            </label>
            <label>
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
