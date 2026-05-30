import { useMemo } from 'react';
import { useDesignStore } from '../../store/designStore';
import { computeSvgTransform, transformPoint } from '../../svg/svgScaler';

/**
 * Plain-language design checks, shown during design (not buried at the end in
 * Machine Control). Catches the three mistakes a maker actually makes:
 *   1. Design bigger than the usable material.
 *   2. Bit wider than the finest detail (detail will be lost).
 *   3. Cutting all the way through with no tabs (parts come loose).
 *
 * Self-contained — reads everything from the store, so each mode just drops in
 * <DesignChecks/>.
 */

interface Check {
  level: 'warn' | 'ok';
  text: string;
  action?: { label: string; run: () => void };
}

export function DesignChecks() {
  const paths = useDesignStore((s) => s.paths);
  const material = useDesignStore((s) => s.material);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const shapeLevels = useDesignStore((s) => s.shapeLevels);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const cutShapeIds = useDesignStore((s) => s.cutShapeIds);
  const cutDepth = useDesignStore((s) => s.cutDepth);
  const setToolConfig = useDesignStore((s) => s.setToolConfig);

  const checks = useMemo<Check[]>(() => {
    if (paths.length === 0 || !svgBounds) return [];
    const out: Check[] = [];

    const transform = computeSvgTransform(
      svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance
    );

    // Design extent + smallest feature, in machine mm.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let smallestFeature = Infinity;
    for (const p of paths) {
      for (const shape of p.shapes) {
        const pts = shape.getPoints(32).map((q) => transformPoint(q.x, q.y, transform));
        if (pts.length < 2) continue;
        let sx = Infinity, sX = -Infinity, sy = Infinity, sY = -Infinity;
        for (const pt of pts) {
          if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
          if (pt.x < sx) sx = pt.x; if (pt.x > sX) sX = pt.x;
          if (pt.y < sy) sy = pt.y; if (pt.y > sY) sY = pt.y;
        }
        smallestFeature = Math.min(smallestFeature, Math.min(sX - sx, sY - sy));
      }
    }
    const designW = maxX - minX;
    const designH = maxY - minY;

    // 1. Oversize — must fit inside the edge-clearance-inset sheet.
    const usableW = material.width - 2 * toolConfig.edgeClearance;
    const usableH = material.height - 2 * toolConfig.edgeClearance;
    if (designW > usableW || designH > usableH) {
      out.push({
        level: 'warn',
        text: `Your design (${designW.toFixed(0)}×${designH.toFixed(0)}mm) is bigger than the usable area of your material (${Math.max(0, usableW).toFixed(0)}×${Math.max(0, usableH).toFixed(0)}mm after edge margins). Scale it down or use a bigger sheet.`,
      });
    }

    // 2. Bit vs finest detail.
    if (Number.isFinite(smallestFeature) && smallestFeature > 0 && toolConfig.bitDiameter > smallestFeature + 0.01) {
      out.push({
        level: 'warn',
        text: `Your bit (${toolConfig.bitDiameter.toFixed(2)}mm) is wider than the smallest part of your design (~${smallestFeature.toFixed(1)}mm). Fine detail will be rounded off or skipped — use a smaller bit for the detail.`,
      });
    }

    // 3. Through-cut with no tabs → parts come loose.
    const hasThrough =
      !!profileCutId ||
      Array.from(shapeLevels.values()).some((l) => l.level >= material.thickness) ||
      (cutShapeIds.size > 0 && cutDepth >= material.thickness - 0.1);
    if (hasThrough && toolConfig.tabCount === 0) {
      out.push({
        level: 'warn',
        text: 'You’re cutting all the way through with no holding tabs — parts can shift or fly loose mid-cut.',
        action: { label: 'Add tabs', run: () => setToolConfig({ tabCount: 4 }) },
      });
    }

    if (out.length === 0) out.push({ level: 'ok', text: 'Looks good — fits the material, no obvious problems.' });
    return out;
  }, [paths, material, toolConfig, svgBounds, svgTransformOverride, shapeLevels, profileCutId, cutShapeIds, cutDepth, setToolConfig]);

  if (checks.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {checks.map((c, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '6px 8px', borderRadius: 4, marginBottom: 4, fontSize: 11, lineHeight: 1.4,
            background: c.level === 'warn' ? 'rgba(255,170,68,0.1)' : 'rgba(68,204,68,0.08)',
            border: `1px solid ${c.level === 'warn' ? 'rgba(255,170,68,0.35)' : 'rgba(68,204,68,0.25)'}`,
            color: c.level === 'warn' ? '#ffcc88' : '#88cc88',
          }}
        >
          <span aria-hidden="true">{c.level === 'warn' ? '⚠' : '✓'}</span>
          <span style={{ flex: 1 }}>{c.text}</span>
          {c.action && (
            <button
              className="btn btn-sm"
              onClick={c.action.run}
              style={{ flexShrink: 0, padding: '2px 8px' }}
            >
              {c.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
