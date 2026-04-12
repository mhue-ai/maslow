import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useDesignStore } from '../../store/designStore';
import { computeSvgTransform, transformPoint } from '../../svg/svgScaler';
import * as ClipperLib from 'js-angusj-clipper';

/**
 * Clean 2D shape renderer — builds a fresh SVG from extracted polygon data.
 * No dangerouslySetInnerHTML, no DOM manipulation of the original SVG.
 * Each shape is a clean <polygon> element colored by depth level.
 */
export function SvgPreview2D() {
  const paths = useDesignStore((s) => s.paths);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const shapeLevels = useDesignStore((s) => s.shapeLevels);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const setShapeLevel = useDesignStore((s) => s.setShapeLevel);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const setSvgTransformOverride = useDesignStore((s) => s.setSvgTransformOverride);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const toolConfig = useDesignStore((s) => s.toolConfig);

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'move'>('none');
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const STEP_MM = 2;

  // Compute the SVG transform (SVG coords → material coords)
  const transform = useMemo(() => {
    if (!svgBounds) return null;
    return computeSvgTransform(svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance);
  }, [svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance]);

  // Clipper instance for polygon simplification
  const [clipper, setClipper] = useState<ClipperLib.ClipperLibWrapper | null>(null);
  useEffect(() => {
    ClipperLib.loadNativeClipperLibInstanceAsync(
      ClipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback as any
    ).then(setClipper).catch(() => {});
  }, []);

  // Extract clean polygon data from Three.js shapes
  const shapePolygons = useMemo(() => {
    if (!transform || paths.length === 0) return [];

    const SCALE = 10000;
    const polys: { id: string; name: string; points: string; bbox: { x: number; y: number; w: number; h: number } }[] = [];

    for (const path of paths) {
      for (const shape of path.shapes) {
        const rawPts = shape.getPoints(128);
        if (rawPts.length < 3) continue;

        // Transform each point from SVG space to material space
        // Negate Y because material space is Y-up but SVG viewBox renders Y-down
        const pts = rawPts.map((p) => {
          const tp = transformPoint(p.x, p.y, transform);
          return { x: tp.x, y: -tp.y };
        });

        // Compute bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const w = maxX - minX;
        const h = maxY - minY;
        const bboxArea = w * h;

        // Only filter truly degenerate shapes — let Clipper handle self-intersections
        if (bboxArea < 0.01) continue; // Skip near-zero area shapes

        // Use Clipper to simplify self-intersecting polygons into clean shapes
        let cleanPts = pts;
        if (clipper && pts.length > 50) {
          try {
            const scaled = pts.map(p => ({ x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) }));
            const simplified = clipper.simplifyPolygon(scaled, ClipperLib.PolyFillType.EvenOdd);
            if (simplified && simplified.length > 0 && simplified[0].length >= 3) {
              // Use the largest simplified polygon
              let best = simplified[0];
              for (const s of simplified) {
                if (s.length > best.length) best = s;
              }
              cleanPts = best.map(p => ({ x: p.x / SCALE, y: p.y / SCALE }));
            }
          } catch { /* fallback to original pts */ }
        }

        // Recompute bbox from cleaned points
        let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity;
        for (const p of cleanPts) {
          if (p.x < cMinX) cMinX = p.x;
          if (p.x > cMaxX) cMaxX = p.x;
          if (p.y < cMinY) cMinY = p.y;
          if (p.y > cMaxY) cMaxY = p.y;
        }

        const pointsStr = cleanPts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

        polys.push({
          id: path.data.id,
          name: path.data.name,
          points: pointsStr,
          bbox: { x: cMinX, y: cMinY, w: cMaxX - cMinX, h: cMaxY - cMinY },
        });
        break; // Only use the first shape per path (primary outline)
      }
    }
    return polys;
  }, [paths, transform, clipper]);

  // Detect rings (gaps between nested shapes)
  const ringPolygons = useMemo(() => {
    if (shapePolygons.length < 2) return [];

    // Sort by area, largest first
    const sorted = [...shapePolygons].sort((a, b) => (b.bbox.w * b.bbox.h) - (a.bbox.w * a.bbox.h));
    const rings: { id: string; outerPoints: string; innerPoints: string }[] = [];
    let ringIdx = 0;

    for (let i = 0; i < sorted.length; i++) {
      const outer = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const inner = sorted[j];
        // Check bbox containment
        if (inner.bbox.x >= outer.bbox.x &&
            inner.bbox.y >= outer.bbox.y &&
            inner.bbox.x + inner.bbox.w <= outer.bbox.x + outer.bbox.w &&
            inner.bbox.y + inner.bbox.h <= outer.bbox.y + outer.bbox.h) {
          rings.push({
            id: `ring-${ringIdx++}`,
            outerPoints: outer.points,
            innerPoints: inner.points,
          });
          break; // Only first (largest) child per outer
        }
      }
      if (rings.length >= 5) break; // Limit to prevent excessive rings
    }
    return rings;
  }, [shapePolygons]);

  // Pre-create ring store entries
  useMemo(() => {
    for (const ring of ringPolygons) {
      if (!shapeLevels.has(ring.id)) {
        setShapeLevel(ring.id, 0);
      }
    }
  }, [ringPolygons.length]);

  // Step a shape deeper: 0 → 2 → 4 → ... → thickness → 0
  const stepDeeper = useCallback((shapeId: string) => {
    const current = shapeLevels.get(shapeId)?.level ?? 0;
    const thickness = material.thickness;
    const next = current + STEP_MM;
    setShapeLevel(shapeId, next > thickness ? 0 : next);
  }, [shapeLevels, setShapeLevel, material.thickness]);

  // Click handler
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragMode !== 'none') return;

    const target = e.target as Element;
    const shapeId = (target as HTMLElement).dataset?.shapeId;

    if (shapeId) {
      selectPath(shapeId);
      if (e.shiftKey) {
        setShapeLevel(shapeId, 0);
      } else {
        stepDeeper(shapeId);
      }
      return;
    }

    // Paint-bucket: find smallest enclosing shape via SVG hit testing
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;
    const svgCoord = pt.matrixTransform(ctm.inverse());

    let bestId: string | null = null;
    let bestArea = Infinity;

    const clickables = svgEl.querySelectorAll('[data-shape-id]');
    clickables.forEach((shape) => {
      const sid = (shape as HTMLElement).dataset.shapeId;
      if (!sid) return;
      if (shape instanceof SVGGeometryElement) {
        const origFill = shape.getAttribute('fill');
        shape.setAttribute('fill', 'black');
        const inside = shape.isPointInFill(svgCoord);
        shape.setAttribute('fill', origFill ?? 'none');
        if (inside) {
          const bbox = shape.getBBox();
          const area = bbox.width * bbox.height;
          if (area < bestArea) {
            bestArea = area;
            bestId = sid;
          }
        }
      }
    });

    if (bestId) {
      selectPath(bestId);
      if (e.shiftKey) {
        setShapeLevel(bestId, 0);
      } else {
        stepDeeper(bestId);
      }
    }
  }, [shapeLevels, selectPath, setShapeLevel, stepDeeper, dragMode]);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.2, Math.min(10, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  // Pan/Move
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      setDragMode('pan');
      dragStart.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
    } else if (e.button === 0 && e.altKey) {
      e.preventDefault();
      setDragMode('move');
      dragStart.current = { x: e.clientX, y: e.clientY, ox: svgTransformOverride.offsetX, oy: svgTransformOverride.offsetY };
    }
  }, [pan, svgTransformOverride]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragMode === 'none') return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (dragMode === 'pan') {
      setPan({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
    } else if (dragMode === 'move') {
      const containerWidth = svgRef.current?.getBoundingClientRect().width ?? 500;
      const mmPerPixel = material.width / containerWidth;
      setSvgTransformOverride({
        offsetX: dragStart.current.ox + dx * mmPerPixel,
        offsetY: dragStart.current.oy - dy * mmPerPixel,
      });
    }
  }, [dragMode, material.width, setSvgTransformOverride]);

  const handleMouseUp = useCallback(() => setDragMode('none'), []);
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Depth → color
  const depthColor = (shapeId: string): string => {
    const level = shapeLevels.get(shapeId)?.level ?? 0;
    const isProfile = shapeId === profileCutId;
    if (isProfile) return '#1a1a1a';
    if (level <= 0) return '#ffffff';
    if (level >= material.thickness) return '#111111';
    const ratio = Math.min(1, level / material.thickness);
    const grey = Math.round(240 - ratio * 200);
    return `rgb(${grey},${grey},${grey})`;
  };

  const depthStroke = (shapeId: string): string => {
    const isProfile = shapeId === profileCutId;
    if (isProfile) return '#ff8800';
    const level = shapeLevels.get(shapeId)?.level ?? 0;
    if (level <= 0) return '#999999';
    return '#666666';
  };

  if (paths.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 14 }}>
        Import an SVG to see the design
      </div>
    );
  }

  // Viewport: material dimensions define the SVG viewBox
  const vbX = -material.width / 2;
  const vbY = -material.height / 2;
  const ec = toolConfig.edgeClearance;

  return (
    <div
      onClick={handleClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        width: '100%', height: '100%', overflow: 'hidden',
        background: '#1a1a2e', position: 'relative', cursor: dragMode !== 'none' ? 'grabbing' : 'crosshair',
      }}
    >
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(10, z * 1.25))}>+</button>
        <span style={{ fontSize: 11, color: '#888', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))}>-</button>
        <button className="btn btn-sm" onClick={resetView}>Fit</button>
      </div>

      {/* Hint */}
      <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 10, fontSize: 10, color: '#555' }}>
        Click = deepen 2mm. Shift+click = reset. Alt+drag = move. Ctrl+drag = pan. Scroll = zoom.
      </div>

      {/* Clean SVG built from polygon data */}
      <svg
        ref={svgRef}
        viewBox={`${vbX} ${vbY} ${material.width} ${material.height}`}
        style={{
          position: 'absolute', top: '50%', left: '50%',
          width: `${Math.min(90, 80 * (material.width / material.height))}%`,
          maxHeight: '85%',
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: dragMode !== 'none' ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        {/* Material background */}
        <rect x={vbX} y={vbY} width={material.width} height={material.height}
          fill="#c4a66a" stroke="#8a7a4a" strokeWidth={2 / zoom} />

        {/* Edge clearance zone */}
        <rect x={vbX + ec} y={vbY + ec} width={material.width - 2 * ec} height={material.height - 2 * ec}
          fill="none" stroke="#ff444466" strokeWidth={1.5 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />

        {/* Center crosshair */}
        <line x1={0} y1={vbY} x2={0} y2={vbY + material.height}
          stroke="#ff880033" strokeWidth={0.5 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />
        <line x1={vbX} y1={0} x2={vbX + material.width} y2={0}
          stroke="#ff880033" strokeWidth={0.5 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />

        {/* Clearance label */}
        <text x={vbX + ec + 2} y={vbY + ec + 8} fontSize={6} fill="#ff444488">{ec}mm clearance</text>

        {/* Dimension label */}
        <text x={0} y={vbY + material.height + 12} textAnchor="middle" fontSize={6} fill="#666">
          {material.width} x {material.height} x {material.thickness} mm
        </text>

        {/* Render order: largest shapes first (painter's algorithm),
            then rings as compound paths (outer boundary + inner hole). */}
        {[...shapePolygons]
          .sort((a, b) => (b.bbox.w * b.bbox.h) - (a.bbox.w * a.bbox.h))
          .map((poly) => {
            const isSelected = selectedPathId === poly.id;
            const isProfile = poly.id === profileCutId;
            return (
              <polygon
                key={poly.id}
                points={poly.points}
                fill={depthColor(poly.id)}
                stroke={isSelected ? '#4488ff' : depthStroke(poly.id)}
                strokeWidth={(isSelected ? 3 : 1) / zoom}
                strokeDasharray={isProfile ? `${6 / zoom} ${3 / zoom}` : undefined}
                data-shape-id={poly.id}
                style={{ cursor: 'crosshair' }}
              />
            );
          })}

        {/* Ring shapes as compound paths: outer boundary + reversed inner = gap only.
            Uses fill-rule="evenodd" so the inner area is a hole. */}
        {/* Ring shapes: only render when selected or at non-zero depth.
            At face level, the gap is naturally visible as material color
            between the dark profile cut and the white inner shapes. */}
        {ringPolygons.map((ring) => {
          const level = shapeLevels.get(ring.id)?.level ?? 0;
          const isSelected = selectedPathId === ring.id;

          // At face level and not selected: invisible (click through to paint-bucket)
          if (level <= 0 && !isSelected) return null;

          const outerCoords = ring.outerPoints.split(' ').map(s => s.split(',').map(Number));
          const innerCoords = ring.innerPoints.split(' ').map(s => s.split(',').map(Number)).reverse();
          const outerD = `M${outerCoords.map(c => c.join(',')).join(' L')} Z`;
          const innerD = `M${innerCoords.map(c => c.join(',')).join(' L')} Z`;

          return (
            <path
              key={ring.id}
              d={`${outerD} ${innerD}`}
              fillRule="evenodd"
              fill={isSelected && level <= 0 ? 'rgba(100,150,255,0.2)' : depthColor(ring.id)}
              stroke={isSelected ? '#4488ff' : '#666666'}
              strokeWidth={(isSelected ? 2 : 0.5) / zoom}
              data-shape-id={ring.id}
              style={{ cursor: 'crosshair', pointerEvents: 'all' }}
            />
          );
        })}
      </svg>
    </div>
  );
}
