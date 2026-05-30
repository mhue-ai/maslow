import { useEffect, useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { computeSvgTransform } from '../svg/svgScaler';
import { detectAutoIslands } from '../gcode/liteToolpath';

/**
 * Shapes — Design Light variant (v2).
 *
 * Mental model:
 *   - Each shape is either RELIEVE (waste — gets lowered to the relief
 *     depth, only its outline is cut) or KEEP (stays at material surface).
 *   - Any Keep shape geometrically inside a Relieve shape is auto-flagged
 *     as an ISLAND — its outline is cut on the waste side so the island
 *     stays at full size after manual fill removal.
 *   - Optionally one shape can be the outer PROFILE (release through-cut,
 *     last operation, with tabs).
 *
 * No fill, no pocketing — the user clears the waste between outlines by
 * hand (chisel, palm router, etc).
 */
export function ShapesLight() {
  const paths = useDesignStore((s) => s.paths);
  const liteReliefIds = useDesignStore((s) => s.liteReliefIds);
  const setLiteRelief = useDesignStore((s) => s.setLiteRelief);
  const clearLiteReliefs = useDesignStore((s) => s.clearLiteReliefs);
  const liteReliefDepth = useDesignStore((s) => s.liteReliefDepth);
  const setLiteReliefDepth = useDesignStore((s) => s.setLiteReliefDepth);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const setProfileCutId = useDesignStore((s) => s.setProfileCutId);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const setToolConfig = useDesignStore((s) => s.setToolConfig);

  // Auto-detected islands (Keep shapes inside a Relief). Computed async because
  // containment goes through ClipperLib (WASM).
  const [autoIslands, setAutoIslands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (paths.length === 0 || !svgBounds) { setAutoIslands(new Set()); return; }
    let cancelled = false;
    const transform = computeSvgTransform(
      svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance
    );
    detectAutoIslands(paths, liteReliefIds, transform, profileCutId).then((set) => {
      if (!cancelled) setAutoIslands(set);
    });
    return () => { cancelled = true; };
  }, [paths, liteReliefIds, svgBounds, material, toolConfig.workOrigin, toolConfig.edgeClearance, svgTransformOverride, profileCutId]);

  if (paths.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h3>Shapes</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import an SVG to see shapes</p>
      </div>
    );
  }

  const reliefCount = paths.filter((p) => liteReliefIds.has(p.data.id)).length;
  const islandCount = autoIslands.size;
  const keepCount = paths.length - reliefCount - (profileCutId ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h3 style={{ margin: '0 0 6px' }}>
        Shapes ({reliefCount} relief · {islandCount} island{islandCount === 1 ? '' : 's'} · {keepCount} keep)
      </h3>

      {/*
        The two parameters that actually determine whether the islands come out
        at the right size: relief depth (how deep the bit goes) and bit
        diameter (how much kerf-compensation offset is applied around each
        outline). Surface them side-by-side at the top of the shapes panel so
        the user doesn't have to bounce to Tool Settings to tune them. They
        stay synced with the same fields in ToolSettingsLight via the store.
      */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
        padding: 6, marginBottom: 8, background: '#0f0f1e',
        border: '1px solid #2a2a4a', borderRadius: 4,
      }}>
        <label
          data-tip="How deep the relief cuts go. The bit traces relief and island outlines to this depth — you remove the waste in between by hand."
          style={{ margin: 0 }}
        >
          Relief depth
          <input
            type="number"
            value={liteReliefDepth}
            min={0.5}
            max={material.thickness - 0.5}
            step={0.5}
            onChange={(e) => setLiteReliefDepth(Number(e.target.value))}
          />
          <span className="unit">mm</span>
        </label>
        <label
          data-tip="Diameter of the router bit. Controls how far the toolpath is offset from each outline (kerf compensation) so islands stay at their drawn size. 1/4&quot; = 6.35mm, 1/8&quot; = 3.175mm."
          style={{ margin: 0 }}
        >
          Bit diameter
          <input
            type="number"
            value={toolConfig.bitDiameter}
            min={1}
            max={25}
            step={0.01}
            onChange={(e) => setToolConfig({ bitDiameter: Number(e.target.value) })}
          />
          <span className="unit">mm</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={clearLiteReliefs} style={{ flex: 1 }}>
          Clear All Reliefs
        </button>
      </div>

      <p style={{ fontSize: 10, color: '#666', marginTop: 0, marginBottom: 6 }}>
        Tick a shape as <strong style={{ color: '#ff6666' }}>Relieve</strong> to mark it as waste.
        Any shape inside it that you leave un-ticked becomes an
        <strong style={{ color: '#88ccff' }}> island</strong> automatically — its outline is cut to
        protect it. Optionally pick one outer <strong style={{ color: '#ff8800' }}>profile</strong> for
        the release through-cut.
      </p>

      <div style={{
        flex: '1 1 0', minHeight: 0, overflow: 'auto', border: '1px solid #2a2a4a',
        borderRadius: 4, padding: 4, background: '#0a0a14',
      }}>
        {paths.map((p) => {
          const id = p.data.id;
          const isRelief = liteReliefIds.has(id);
          const isProfile = id === profileCutId;
          const isIsland = autoIslands.has(id);
          const isSelected = id === selectedPathId;

          // Visual role accent: profile > relief > island > keep
          const accent =
            isProfile ? '#ff8800' :
            isRelief  ? '#ff6666' :
            isIsland  ? '#88ccff' : '#333';

          // Don't allow a profile shape to also be a relief — they're mutually exclusive.
          const reliefDisabled = isProfile;

          return (
            <div
              key={id}
              onClick={() => selectPath(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 6px', borderRadius: 3, cursor: 'pointer',
                background: isSelected ? '#1a2a4a' : 'transparent',
                marginBottom: 2,
                borderLeft: `3px solid ${accent}`,
              }}
            >
              <input
                type="checkbox"
                checked={isRelief}
                disabled={reliefDisabled}
                onChange={(e) => { e.stopPropagation(); setLiteRelief(id, e.target.checked); }}
                onClick={(e) => e.stopPropagation()}
                title="Mark as relief — cut outline at relief depth, leave waste for manual removal"
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: isRelief || isIsland || isProfile ? '#ccc' : '#666',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {p.data.name}
              </span>

              {isIsland && !isRelief && !isProfile && (
                <span
                  style={{ fontSize: 9, color: '#88ccff', fontStyle: 'italic' }}
                  title="Auto-detected: this shape is inside a Relief, so its outline will be cut to preserve it as an island"
                >
                  island
                </span>
              )}

              <label
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 10, color: isProfile ? '#ff8800' : '#555',
                  margin: 0, cursor: 'pointer',
                }}
                title="Mark as the outer profile (release through-cut, cut last with tabs)"
              >
                <input
                  type="radio"
                  name="profileCut"
                  checked={isProfile}
                  onChange={() => {
                    // Selecting a profile clears any relief flag on the same shape.
                    if (isRelief) setLiteRelief(id, false);
                    setProfileCutId(id);
                  }}
                  style={{ margin: 0 }}
                />
                profile
              </label>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 10, color: '#666', marginTop: 6, marginBottom: 0 }}>
        All outlines cut to <strong>{liteReliefDepth} mm</strong>.
        {profileCutId && ' Profile released through the full thickness with tabs.'}
      </p>
    </div>
  );
}
