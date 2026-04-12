import { useRef, useEffect, useState, useCallback } from 'react';
import { useDesignStore } from '../../store/designStore';
import type { SvgShapeEntry } from '../../svg/svgParser';
import type { ShapeLevel, Material } from '../../types/design';

/**
 * Native 2D SVG preview with zoom/pan, paint-bucket region selection,
 * and bit kerf visualization.
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
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgDoc, setSvgDoc] = useState<string | null>(null);

  // Zoom/pan/drag state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'move'>('none');
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Process SVG
  useEffect(() => {
    if (!svgText) { setSvgDoc(null); return; }
    setSvgDoc(enhanceSvg(svgText, shapeLevels, selectedPathId, profileCutId, toolConfig.bitDiameter, material, shapeRegistry));
  }, [svgText, shapeLevels, selectedPathId, profileCutId, toolConfig.bitDiameter, material, shapeRegistry]);

  const STEP_MM = 2; // Each click deepens by 2mm

  // Step a shape deeper: 0 → 2 → 4 → ... → thickness → 0
  const stepDeeper = useCallback((shapeId: string) => {
    const current = shapeLevels.get(shapeId)?.level ?? 0;
    const thickness = material.thickness;
    const next = current + STEP_MM;
    setShapeLevel(shapeId, next > thickness ? 0 : next);
  }, [shapeLevels, setShapeLevel, material.thickness, profileCutId]);

  // Paint-bucket click handler
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragMode !== 'none') return;

    // First: check if user clicked directly on an SVG element
    const target = e.target as Element;
    let el: Element | null = target;
    while (el && !(el as HTMLElement).dataset?.shapeId) {
      el = el.parentElement;
    }

    if (el) {
      const shapeId = (el as HTMLElement).dataset.shapeId;
      if (!shapeId) return;
      selectPath(shapeId);
      if (e.shiftKey) {
        setShapeLevel(shapeId, 0);
      } else {
        stepDeeper(shapeId);
      }
      return;
    }

    // Clicked on empty space — find the smallest enclosing closed shape
    if (!svgContainerRef.current || !svgText) return;
    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgPoint = svgEl.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;
    const svgCoord = svgPoint.matrixTransform(ctm.inverse());

    const closedElements = svgEl.querySelectorAll('[data-shape-id]');
    let bestId: string | null = null;
    let bestArea = Infinity;

    closedElements.forEach((shape) => {
      const shapeId = (shape as HTMLElement).dataset?.shapeId;
      if (!shapeId) return;

      if (shape instanceof SVGGeometryElement) {
        // Temporarily set fill to solid for hit testing —
        // isPointInFill returns false for fill="none" elements
        const origFill = shape.getAttribute('fill');
        shape.setAttribute('fill', 'black');
        const isInside = shape.isPointInFill(svgCoord);
        shape.setAttribute('fill', origFill ?? 'none');

        if (isInside) {
          const bbox = shape.getBBox();
          const area = bbox.width * bbox.height;
          if (area < bestArea) {
            bestArea = area;
            bestId = shapeId;
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
  }, [shapeLevels, selectPath, setShapeLevel, stepDeeper, dragMode !== 'none', svgText]);


  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.2, Math.min(10, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      // Ctrl+drag or middle-click = pan viewport
      e.preventDefault();
      setDragMode('pan');
      dragStart.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
    } else if (e.button === 0 && e.altKey) {
      // Alt+drag = move design on material
      e.preventDefault();
      setDragMode('move');
      dragStart.current = {
        x: e.clientX, y: e.clientY,
        ox: svgTransformOverride.offsetX, oy: svgTransformOverride.offsetY,
      };
    }
  }, [pan, svgTransformOverride]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragMode === 'none') return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (dragMode === 'pan') {
      setPan({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
    } else if (dragMode === 'move') {
      // Convert screen pixels to material mm
      const containerEl = svgContainerRef.current;
      if (!containerEl) return;
      const matEl = containerEl.closest('[style*="aspectRatio"]') ?? containerEl;
      const pixelWidth = matEl.getBoundingClientRect().width;
      const mmPerPixel = material.width / (pixelWidth / zoom);
      setSvgTransformOverride({
        offsetX: dragStart.current.ox + dx * mmPerPixel,
        offsetY: dragStart.current.oy - dy * mmPerPixel, // Y inverted
      });
    }
  }, [dragMode, zoom, material.width, setSvgTransformOverride]);

  const handleMouseUp = useCallback(() => {
    setDragMode('none');
  }, []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!svgText) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 14 }}>
        Import an SVG to see the design
      </div>
    );
  }

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
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#1a1a2e',
        cursor: dragMode !== 'none' ? 'grabbing' : 'crosshair',
        position: 'relative',
      }}
    >
      {/* Zoom controls */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 10,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(10, z * 1.25))}>+</button>
        <span style={{ fontSize: 11, color: '#888', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))}>-</button>
        <button className="btn btn-sm" onClick={resetView}>Fit</button>
      </div>

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: 8, left: 8, zIndex: 10,
        fontSize: 10, color: '#555',
      }}>
        Click = deepen 2mm. Shift+click = reset. Alt+drag = move design. Ctrl+drag = pan. Scroll = zoom.
      </div>

      {/* Material surface with SVG */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: 'center center',
        transition: dragMode !== 'none' ? 'none' : 'transform 0.1s ease-out',
      }}>
        <div
          ref={svgContainerRef}
          style={{
            background: '#c4a66a',
            width: `${Math.min(800, material.width * 0.5)}px`,
            aspectRatio: `${material.width} / ${material.height}`,
            position: 'relative',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            border: '2px solid #8a7a4a',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              transform: `rotate(${svgTransformOverride.rotation}deg) scaleX(${svgTransformOverride.mirrorX ? -1 : 1}) scaleY(${svgTransformOverride.mirrorY ? -1 : 1})`,
            }}
            dangerouslySetInnerHTML={svgDoc ? { __html: svgDoc } : undefined}
          />
          {/* Snap lines: center cross + margin guides */}
          <svg style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible',
          }}>
            {/* Center crosshair */}
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#ff880044" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#ff880044" strokeWidth="1" strokeDasharray="4 4" />
            {/* Edge margin guides (1" / 25mm from edges) */}
            <rect x="2%" y="2%" width="96%" height="96%" fill="none" stroke="#ffffff11" strokeWidth="0.5" strokeDasharray="2 6" />
          </svg>
          <div style={{
            position: 'absolute', bottom: -20, left: 0, right: 0,
            textAlign: 'center', fontSize: 10, color: '#666',
          }}>
            {material.width} x {material.height} x {material.thickness} mm
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Enhance SVG markup for interactive depth assignment.
 */
function enhanceSvg(
  svgText: string,
  shapeLevels: Map<string, ShapeLevel>,
  selectedPathId: string | null,
  profileCutId: string | null,
  bitDiameter: number,
  material: Material,
  shapeRegistry: SvgShapeEntry[]
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgText;

  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  // Calculate stroke scale: bit diameter relative to SVG viewBox
  const vb = svg.getAttribute('viewBox');
  let svgWidth = 600;
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts[2]) svgWidth = parts[2];
  }
  const bitStrokeWidth = (bitDiameter / material.width) * svgWidth;

  // Query ALL shape elements in DOM order — matches the registry order
  const allElements = svg.querySelectorAll(
    'path, polygon, polyline, rect, circle, ellipse, line, text'
  );

  let registryIdx = 0;
  allElements.forEach((el) => {
    // Match this DOM element to its registry entry by sequential position
    const entry = shapeRegistry[registryIdx];
    registryIdx++;
    if (!entry) return;

    // Text elements: render at face level, not clickable
    if (entry.isText) {
      el.setAttribute('fill', '#ffffff');
      el.setAttribute('style', 'cursor: default; filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.5)); pointer-events: none;');
      return;
    }

    const shapeId = entry.id;
    const isProfileCut = shapeId === profileCutId;
    el.setAttribute('data-shape-id', shapeId);

    const shapeEntry = shapeLevels.get(shapeId);
    const level = shapeEntry?.level ?? 0;
    const isSelected = selectedPathId === shapeId;
    const depthRatio = Math.min(1, level / material.thickness);
    const styles: string[] = ['cursor: crosshair'];
    const filters: string[] = [];

    // Scale strokes to represent bit kerf width
    const hasStroke = el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none';
    if (hasStroke) {
      styles.push(`stroke-width: ${bitStrokeWidth.toFixed(2)}`);
      styles.push('stroke-linecap: round');
      styles.push('stroke-linejoin: round');
    }

    // Depth shading in GREYSCALE — material background stays wood color,
    // all shape depth indicators use shades of grey.
    // Face = white, shallow = light grey, deep = dark grey, through = near-black.
    if (isProfileCut) {
      // Profile cut — orange dashed outline, very dark grey fill
      if (hasStroke) {
        el.setAttribute('stroke', '#ff8800');
        styles.push(`stroke-dasharray: ${(bitStrokeWidth * 2).toFixed(1)} ${bitStrokeWidth.toFixed(1)}`);
      }
      el.setAttribute('fill', '#1a1a1a');
      filters.push('drop-shadow(0 0 4px #ff8800)');
    } else if (level <= 0) {
      // Face (level 0) — white/bright, clearly raised
      const currentFill = el.getAttribute('fill');
      if (currentFill === 'none' || !currentFill) {
        // Outline-only: near-invisible fill for CLICK detection, visible grey stroke
        el.setAttribute('fill', 'rgba(255,255,255,0.01)');
        if (hasStroke) el.setAttribute('stroke', '#aaaaaa');
      } else {
        // Filled element: white
        el.setAttribute('fill', '#ffffff');
        if (hasStroke) el.setAttribute('stroke', '#999999');
      }
      filters.push('drop-shadow(1px 2px 3px rgba(0,0,0,0.5))');
    } else if (level >= material.thickness) {
      // Through-cut — near-black
      el.setAttribute('fill', '#111111');
      if (hasStroke) el.setAttribute('stroke', '#333333');
    } else {
      // Relief — grey proportional to depth: white(0) → dark grey(thickness)
      const grey = Math.round(240 - depthRatio * 200); // 240 (light) to 40 (dark)
      el.setAttribute('fill', `rgb(${grey}, ${grey}, ${grey})`);
      if (hasStroke) el.setAttribute('stroke', `rgb(${Math.max(0, grey - 50)}, ${Math.max(0, grey - 50)}, ${Math.max(0, grey - 50)})`);
    }

    // Selection highlight
    if (isSelected) {
      filters.push('drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 12px #4488ff)');
      styles.push('opacity: 1');
    }

    if (filters.length > 0) {
      styles.push(`filter: ${filters.join(' ')}`);
    }

    el.setAttribute('style', styles.join('; '));
  });

  return new XMLSerializer().serializeToString(svg);
}
