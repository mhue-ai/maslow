import { useRef, useState, useCallback, useEffect } from 'react';
import { useDesignStore } from '../../store/designStore';

/**
 * Native SVG renderer — displays the normalized SVG with perfect fidelity.
 * Depth is indicated via CSS brightness filters (no polygon conversion).
 *
 * Architecture (validated by jscut, LaserWeb4, OpenBuilds, Easel):
 * - DISPLAY: native SVG rendering (browser handles all curves perfectly)
 * - TOOLPATHS: separate SVGLoader polygon approximation (in gcodeGenerator)
 * - These layers are intentionally decoupled — industry standard pattern
 */
export function SvgPreview2D() {
  const svgText = useDesignStore((s) => s.svgText);
  const material = useDesignStore((s) => s.material);
  const shapeLevels = useDesignStore((s) => s.shapeLevels);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const setShapeLevel = useDesignStore((s) => s.setShapeLevel);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const setSvgTransformOverride = useDesignStore((s) => s.setSvgTransformOverride);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const shapeRegistry = useDesignStore((s) => s.shapeRegistry);

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'move'>('none');
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const STEP_MM = 2;

  // Build the enhanced SVG with depth styling via CSS brightness filters
  const [enhancedSvg, setEnhancedSvg] = useState<string>('');

  useEffect(() => {
    if (!svgText || shapeRegistry.length === 0) {
      setEnhancedSvg('');
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return;

    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    // Inject a global style block that strips ALL original colors with !important
    // This guarantees our overrides win over any inline styles, CSS classes, etc.
    const styleBlock = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleBlock.textContent = `
      path, polygon, polyline, rect, circle, ellipse, line {
        fill: #c4a66a !important;
        stroke: #8a6a3a !important;
        stroke-width: 0.02 !important;
        fill-opacity: 1 !important;
        stroke-opacity: 1 !important;
      }
      text {
        fill: #5a4a2a !important;
        stroke: none !important;
        pointer-events: none !important;
      }
    `;
    svg.insertBefore(styleBlock, svg.firstChild);

    // Walk through registry and assign depth styling to each element
    const allElements = svg.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line, text');
    let regIdx = 0;

    allElements.forEach((el) => {
      const entry = shapeRegistry[regIdx];
      regIdx++;
      if (!entry) return;

      if (entry.isText) {
        el.setAttribute('style', 'pointer-events: none; fill: #5a4a2a !important; stroke: none !important;');
        return;
      }

      el.setAttribute('data-shape-id', entry.id);

      const level = shapeLevels.get(entry.id)?.level ?? 0;
      const isSelected = selectedPathId === entry.id;
      const isProfile = entry.id === profileCutId;
      const thickness = material.thickness;

      // Show each shape's actual depth as a realistic top-down preview.
      // Face = material surface (light wood), deeper = darker wood, through = hole.
      // This shows what the finished CNC piece will look like from above.
      let fill: string;
      let stroke: string;
      const filters: string[] = [];

      if (isProfile) {
        // Profile cut: orange dashed outline, material color fill
        fill = '#c4a66a';
        stroke = '#ff8800';
      } else if (level >= thickness) {
        // Through-cut: very dark (hole in material)
        fill = '#2a1a0a';
        stroke = '#1a1a1a';
      } else if (level > 0) {
        // Relief: darker wood proportional to depth
        // Interpolate from surface wood (#c4a66a) to deep wood (#3a2510)
        const ratio = Math.min(1, level / thickness);
        const r = Math.round(196 - ratio * 140);
        const g = Math.round(166 - ratio * 130);
        const b = Math.round(106 - ratio * 80);
        fill = `rgb(${r},${g},${b})`;
        stroke = `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 20)})`;
      } else {
        // Face level: material surface color (light wood)
        fill = '#c4a66a';
        stroke = '#8a6a3a';
      }

      // Override via BOTH attribute AND style — CSS inline style has higher
      // precedence than XML attributes. Fusion 360 SVGs have style="fill:..."
      // which overrides setAttribute('fill') if not also set in style.
      el.setAttribute('fill', fill);
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', '0.02');
      (el as HTMLElement).style.fill = fill;
      (el as HTMLElement).style.stroke = stroke;
      (el as HTMLElement).style.strokeWidth = '0.3';

      const styles: string[] = [
        'cursor: crosshair',
        `fill: ${fill} !important`,
        `stroke: ${stroke} !important`,
        'stroke-width: 0.02 !important',
      ];

      if (isProfile) {
        styles.push('stroke-dasharray: 8 4');
        styles.push('stroke-width: 1.5');
      }

      if (isSelected) {
        filters.push('drop-shadow(0 0 4px #4488ff) drop-shadow(0 0 8px #4488ff)');
        el.setAttribute('stroke', '#4488ff');
        el.setAttribute('stroke-width', '2');
      }

      if (filters.length > 0) {
        styles.push(`filter: ${filters.join(' ')}`);
      }

      el.setAttribute('style', styles.join('; '));
    });

    setEnhancedSvg(new XMLSerializer().serializeToString(svg));
  }, [svgText, shapeRegistry, shapeLevels, selectedPathId, profileCutId, material.thickness]);

  // Step deeper on click
  const stepDeeper = useCallback((shapeId: string) => {
    const current = shapeLevels.get(shapeId)?.level ?? 0;
    const next = current + STEP_MM;
    setShapeLevel(shapeId, next > material.thickness ? 0 : next);
  }, [shapeLevels, setShapeLevel, material.thickness]);

  // Click handler — find clicked element's shape ID
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragMode !== 'none') return;

    const target = e.target as Element;
    let el: Element | null = target;
    while (el && !(el as HTMLElement).dataset?.shapeId) {
      el = el.parentElement;
    }

    if (el) {
      const shapeId = (el as HTMLElement).dataset.shapeId!;
      selectPath(shapeId);
      if (e.shiftKey) {
        setShapeLevel(shapeId, 0);
      } else {
        stepDeeper(shapeId);
      }
      return;
    }

    // Paint-bucket: find element at click point using the rendered SVG
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const pt = (svgEl as SVGSVGElement).createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = (svgEl as SVGSVGElement).getScreenCTM();
    if (!ctm) return;
    const svgCoord = pt.matrixTransform(ctm.inverse());

    // Check all shape elements for containment
    const shapes = svgEl.querySelectorAll('[data-shape-id]');
    let bestId: string | null = null;
    let bestArea = Infinity;

    shapes.forEach((shape) => {
      const sid = (shape as HTMLElement).dataset.shapeId;
      if (!sid || !(shape instanceof SVGGeometryElement)) return;
      const origFill = shape.getAttribute('fill');
      shape.setAttribute('fill', 'black');
      const inside = shape.isPointInFill(svgCoord);
      shape.setAttribute('fill', origFill ?? 'none');
      if (inside) {
        try {
          const bbox = shape.getBBox();
          const area = bbox.width * bbox.height;
          if (area < bestArea) { bestArea = area; bestId = sid; }
        } catch {}
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

  // Pan / Move
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
      const el = containerRef.current?.querySelector('.svg-container');
      const w = el?.getBoundingClientRect().width ?? 500;
      const mmPerPixel = material.width / w;
      setSvgTransformOverride({
        offsetX: dragStart.current.ox + dx * mmPerPixel,
        offsetY: dragStart.current.oy - dy * mmPerPixel,
      });
    }
  }, [dragMode, material.width, setSvgTransformOverride]);

  const handleMouseUp = useCallback(() => setDragMode('none'), []);
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!svgText) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 14 }}>
        Import an SVG to see the design
      </div>
    );
  }

  const ec = toolConfig.edgeClearance;
  const ecPctX = (ec / material.width * 100).toFixed(2);
  const ecPctY = (ec / material.height * 100).toFixed(2);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        width: '100%', height: '100%', overflow: 'hidden',
        background: '#1a1a2e', position: 'relative',
        cursor: dragMode !== 'none' ? 'grabbing' : 'crosshair',
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

      {/* Material surface with native SVG */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: 'center center',
        transition: dragMode !== 'none' ? 'none' : 'transform 0.1s ease-out',
      }}>
        <div style={{
          background: '#c4a66a',
          width: `${Math.min(800, material.width * 0.5)}px`,
          aspectRatio: `${material.width} / ${material.height}`,
          position: 'relative',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          border: '2px solid #8a7a4a',
        }}>
          {/* Native SVG rendered with CSS brightness for depth */}
          <div
            className="svg-container"
            style={{
              position: 'absolute',
              left: `${ecPctX}%`, top: `${ecPctY}%`,
              width: `${(100 - 2 * parseFloat(ecPctX)).toFixed(2)}%`,
              height: `${(100 - 2 * parseFloat(ecPctY)).toFixed(2)}%`,
              transform: `rotate(${svgTransformOverride.rotation}deg) scaleX(${svgTransformOverride.mirrorX ? -1 : 1}) scaleY(${svgTransformOverride.mirrorY ? -1 : 1})`,
            }}
            dangerouslySetInnerHTML={{ __html: enhancedSvg }}
          />

          {/* Edge clearance overlay */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <rect x={`${ecPctX}%`} y={`${ecPctY}%`}
              width={`${(100 - 2 * parseFloat(ecPctX)).toFixed(2)}%`}
              height={`${(100 - 2 * parseFloat(ecPctY)).toFixed(2)}%`}
              fill="none" stroke="#ff444466" strokeWidth="1.5" strokeDasharray="6 4" />
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#ff880033" strokeWidth="0.5" strokeDasharray="4 4" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#ff880033" strokeWidth="0.5" strokeDasharray="4 4" />
            <text x={`${parseFloat(ecPctX) + 1}%`} y={`${parseFloat(ecPctY) + 4}%`}
              fill="#ff444488" fontSize="8" fontFamily="sans-serif">{ec}mm clearance</text>
          </svg>

          {/* Dimension label */}
          <div style={{ position: 'absolute', bottom: -20, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#666' }}>
            {material.width} x {material.height} x {material.thickness} mm
          </div>
        </div>
      </div>
    </div>
  );
}
