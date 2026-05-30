import { useEffect, useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { computeSvgTransform } from '../svg/svgScaler';
import { detectAutoIslands } from '../gcode/outlineToolpath';

/**
 * Shapes — Outline mode.
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
export function OutlineShapes() {
  const paths = useDesignStore((s) => s.paths);
  const outlineReliefIds = useDesignStore((s) => s.outlineReliefIds);
  const setOutlineRelief = useDesignStore((s) => s.setOutlineRelief);
  const clearOutlineReliefs = useDesignStore((s) => s.clearOutlineReliefs);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const setProfileCutId = useDesignStore((s) => s.setProfileCutId);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const toolConfig = useDesignStore((s) => s.toolConfig);

  // Auto-detected islands (Keep shapes inside a Relief). Computed async because
  // containment goes through ClipperLib (WASM).
  const [autoIslands, setAutoIslands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (paths.length === 0 || !svgBounds) { setAutoIslands(new Set()); return; }
    let cancelled = false;
    const transform = computeSvgTransform(
      svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance
    );
    detectAutoIslands(paths, outlineReliefIds, transform, profileCutId).then((set) => {
      if (!cancelled) setAutoIslands(set);
    });
    return () => { cancelled = true; };
  }, [paths, outlineReliefIds, svgBounds, material, toolConfig.workOrigin, toolConfig.edgeClearance, svgTransformOverride, profileCutId]);

  if (paths.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h3>Shapes</h3>
        <p style={{ fontSize: 11, color: '#555' }}>Import an SVG to see shapes</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h3 style={{ margin: '0 0 6px' }}>Shapes</h3>

      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button className="btn btn-sm" onClick={clearOutlineReliefs} style={{ flex: 1 }}>Clear</button>
      </div>

      <div style={{
        flex: '1 1 0', minHeight: 0, overflow: 'auto', border: '1px solid #2a2a4a',
        borderRadius: 4, padding: 4, background: '#0a0a14',
      }}>
        {paths.map((p) => {
          const id = p.data.id;
          const isRelief = outlineReliefIds.has(id);
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
                onChange={(e) => { e.stopPropagation(); setOutlineRelief(id, e.target.checked); }}
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
                    if (isRelief) setOutlineRelief(id, false);
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

    </div>
  );
}
