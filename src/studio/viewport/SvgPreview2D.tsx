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

  // After SVG renders, detect ring shapes and create store entries so they appear in sidebar
  useEffect(() => {
    if (!svgContainerRef.current) return;
    const svg = svgContainerRef.current.querySelector('svg');
    if (!svg) return;
    const rings = svg.querySelectorAll('[data-shape-id^="ring"]');
    rings.forEach((r) => {
      const id = (r as HTMLElement).dataset.shapeId;
      if (id && !shapeLevels.has(id)) {
        setShapeLevel(id, 0); // Pre-create at face level
      }
    });
  }, [svgDoc]); // Run after SVG doc updates

  const STEP_MM = 2; // Each click deepens by 2mm

  // Step a shape deeper: 0 → 2 → 4 → ... → thickness → 0
  const stepDeeper = useCallback((shapeId: string) => {
    const current = shapeLevels.get(shapeId)?.level ?? 0;
    const thickness = material.thickness;
    const next = current + STEP_MM;
    setShapeLevel(shapeId, next > thickness ? 0 : next);
  }, [shapeLevels, setShapeLevel, material.thickness]);

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
  }, [shapeLevels, selectPath, setShapeLevel, stepDeeper, dragMode, svgText]);


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
      // getBoundingClientRect already reflects zoom, so no zoom division needed
      const mmPerPixel = material.width / pixelWidth;
      setSvgTransformOverride({
        offsetX: dragStart.current.ox + dx * mmPerPixel,
        offsetY: dragStart.current.oy - dy * mmPerPixel, // Y inverted
      });
    }
  }, [dragMode, material.width, setSvgTransformOverride]);

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
              // Inset SVG by edge clearance so design fits within the safe area
              position: 'absolute',
              left: `${(toolConfig.edgeClearance / material.width * 100).toFixed(2)}%`,
              top: `${(toolConfig.edgeClearance / material.height * 100).toFixed(2)}%`,
              width: `${(100 - 2 * toolConfig.edgeClearance / material.width * 100).toFixed(2)}%`,
              height: `${(100 - 2 * toolConfig.edgeClearance / material.height * 100).toFixed(2)}%`,
              transform: `rotate(${svgTransformOverride.rotation}deg) scaleX(${svgTransformOverride.mirrorX ? -1 : 1}) scaleY(${svgTransformOverride.mirrorY ? -1 : 1})`,
            }}
            dangerouslySetInnerHTML={svgDoc ? { __html: svgDoc } : undefined}
          />
          {/* Snap lines + edge clearance zone */}
          {(() => {
            const ec = toolConfig.edgeClearance;
            const pctX = (ec / material.width * 100).toFixed(2);
            const pctY = (ec / material.height * 100).toFixed(2);
            const innerW = (100 - 2 * ec / material.width * 100).toFixed(2);
            const innerH = (100 - 2 * ec / material.height * 100).toFixed(2);
            return (
              <svg style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                pointerEvents: 'none', overflow: 'visible',
              }}>
                {/* Center crosshair */}
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#ff880044" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#ff880044" strokeWidth="1" strokeDasharray="4 4" />
                {/* Edge clearance zone — red dashed border showing unsafe area */}
                <rect
                  x={`${pctX}%`} y={`${pctY}%`}
                  width={`${innerW}%`} height={`${innerH}%`}
                  fill="none" stroke="#ff444466" strokeWidth="1.5" strokeDasharray="6 4"
                />
                {/* Shade the unsafe edge zone with a subtle red overlay */}
                <rect x="0" y="0" width="100%" height={`${pctY}%`} fill="#ff000008" />
                <rect x="0" y={`${parseFloat(pctY) + parseFloat(innerH)}%`} width="100%" height={`${pctY}%`} fill="#ff000008" />
                <rect x="0" y={`${pctY}%`} width={`${pctX}%`} height={`${innerH}%`} fill="#ff000008" />
                <rect x={`${parseFloat(pctX) + parseFloat(innerW)}%`} y={`${pctY}%`} width={`${pctX}%`} height={`${innerH}%`} fill="#ff000008" />
                {/* Edge clearance label */}
                <text x={`${parseFloat(pctX) + 1}%`} y={`${parseFloat(pctY) + 4}%`}
                  fill="#ff444488" fontSize="8" fontFamily="sans-serif">
                  {ec}mm clearance
                </text>
              </svg>
            );
          })()}
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

    // After normalization, getAttribute('fill') is reliable — no CSS workarounds needed
    const fill = el.getAttribute('fill');
    const isFilled = fill !== null && fill !== 'none' && fill !== '';
    const stroke = el.getAttribute('stroke');
    const hasStroke = stroke !== null && stroke !== 'none' && stroke !== '';

    if (hasStroke) {
      styles.push(`stroke-width: ${bitStrokeWidth.toFixed(2)}`);
      styles.push('stroke-linecap: round');
      styles.push('stroke-linejoin: round');
    }

    // Depth shading in greyscale
    if (isProfileCut) {
      if (hasStroke) {
        el.setAttribute('stroke', '#ff8800');
        styles.push(`stroke-dasharray: ${(bitStrokeWidth * 2).toFixed(1)} ${bitStrokeWidth.toFixed(1)}`);
      }
      el.setAttribute('fill', '#1a1a1a');
      filters.push('drop-shadow(0 0 4px #ff8800)');
    } else if (level <= 0) {
      if (!isFilled) {
        el.setAttribute('fill', 'rgba(255,255,255,0.01)');
        if (hasStroke) el.setAttribute('stroke', '#aaaaaa');
      } else {
        el.setAttribute('fill', '#ffffff');
        if (hasStroke) el.setAttribute('stroke', '#999999');
      }
      filters.push('drop-shadow(1px 2px 3px rgba(0,0,0,0.5))');
    } else if (level >= material.thickness) {
      el.setAttribute('fill', '#111111');
      if (hasStroke) el.setAttribute('stroke', '#333333');
    } else {
      const grey = Math.round(240 - depthRatio * 200);
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

  // Auto-detect gaps between nested closed polygons and create virtual ring shapes
  createRingShapes(svg, shapeLevels, selectedPathId, material);

  return new XMLSerializer().serializeToString(svg);
}

/**
 * Find nested closed polygons and create virtual "ring" shapes for the
 * gaps between them. These are the implied regions that don't exist as
 * SVG elements but are visible as dark areas between borders.
 */
function createRingShapes(
  svg: SVGSVGElement,
  shapeLevels: Map<string, ShapeLevel>,
  selectedPathId: string | null,
  material: Material
): void {
  // Collect all closed shape elements with bounding boxes.
  // Store the SVG path `d` attribute for creating compound ring paths.
  const closedShapes: { el: Element; id: string; pathD: string; bbox: { x: number; y: number; w: number; h: number }; area: number }[] = [];

  // Include polygons (convert points to path d)
  const polygons = svg.querySelectorAll('polygon[data-shape-id]');
  polygons.forEach((el) => {
    const id = (el as HTMLElement).dataset.shapeId;
    if (!id) return;
    const points = el.getAttribute('points');
    if (!points) return;
    const pathD = polygonPointsToPath(points, false);
    const bbox = computeBBoxFromCoords(pathD);
    if (bbox.w > 0) {
      closedShapes.push({ el, id, pathD, bbox, area: bbox.w * bbox.h });
    }
  });

  // Include closed <path> elements — use actual d attribute
  const pathEls = svg.querySelectorAll('path[data-shape-id]');
  pathEls.forEach((el) => {
    const id = (el as HTMLElement).dataset.shapeId;
    if (!id) return;
    const d = el.getAttribute('d');
    if (!d || !/z/i.test(d)) return;
    const bbox = computeBBoxFromCoords(d);
    const area = bbox.w * bbox.h;
    if (area < 0.01) return;
    closedShapes.push({ el, id, pathD: d, bbox, area });
  });

  // Sort by area, largest first
  closedShapes.sort((a, b) => b.area - a.area);

  // For each pair where smaller is inside larger, create a ring
  const usedInners = new Set<string>();
  let ringIndex = 0;

  for (let i = 0; i < closedShapes.length; i++) {
    const outer = closedShapes[i];
    for (let j = i + 1; j < closedShapes.length; j++) {
      const inner = closedShapes[j];
      if (usedInners.has(inner.id)) continue;

      // Check if inner bbox is inside outer bbox
      if (inner.bbox.x >= outer.bbox.x &&
          inner.bbox.y >= outer.bbox.y &&
          inner.bbox.x + inner.bbox.w <= outer.bbox.x + outer.bbox.w &&
          inner.bbox.y + inner.bbox.h <= outer.bbox.y + outer.bbox.h) {

        // Create a ring shape: compound path with outer + reversed inner
        const ringId = `ring-${ringIndex++}`;
        const outerD = outer.pathD;
        const innerD = reversePath(inner.pathD);

        const ringPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ringPath.setAttribute('d', outerD + ' ' + innerD);
        ringPath.setAttribute('fill-rule', 'evenodd');
        ringPath.setAttribute('data-shape-id', ringId);

        // Style based on depth level
        const level = shapeLevels.get(ringId)?.level ?? 0;
        const isSelected = selectedPathId === ringId;
        const depthRatio = Math.min(1, level / material.thickness);

        let fill: string;
        let stroke = 'none';
        const styles: string[] = ['cursor: crosshair'];
        const filters: string[] = [];

        if (level <= 0) {
          // Face-level ring: slightly lighter than material with visible outline
          fill = '#d4b87a';
          stroke = '#aa885588';
        } else if (level >= material.thickness) {
          fill = '#111111';
        } else {
          const grey = Math.round(240 - depthRatio * 200);
          fill = `rgb(${grey}, ${grey}, ${grey})`;
        }

        if (isSelected) {
          filters.push('drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 12px #4488ff)');
        }

        if (filters.length > 0) {
          styles.push(`filter: ${filters.join(' ')}`);
        }

        ringPath.setAttribute('fill', fill);
        ringPath.setAttribute('stroke', stroke);
        ringPath.setAttribute('style', styles.join('; '));

        // Insert BEFORE the outer element so it renders between the two polygons
        outer.el.parentNode?.insertBefore(ringPath, outer.el.nextSibling);

        usedInners.add(inner.id);
      }
    }
  }
}

/**
 * Convert SVG polygon points to path d attribute.
 * If reverse=true, reverses the point order (for creating holes in compound paths).
 */
function polygonPointsToPath(points: string, reverse: boolean): string {
  // Parse SVG polygon points — handles multiple formats:
  // "x,y x,y x,y"  or  "x y x y x y"  or  "x, y, x, y"
  const nums = points.trim().replace(/,/g, ' ').split(/\s+/).map(Number).filter((n) => !isNaN(n));
  const pairs: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length - 1; i += 2) {
    pairs.push({ x: nums[i], y: nums[i + 1] });
  }

  if (reverse) pairs.reverse();
  if (pairs.length === 0) return '';

  let d = `M${pairs[0].x},${pairs[0].y}`;
  for (let i = 1; i < pairs.length; i++) {
    d += ` L${pairs[i].x},${pairs[i].y}`;
  }
  d += ' Z';
  return d;
}

/**
 * Reverse an SVG path direction (for creating holes in compound paths).
 * Extracts coordinate pairs from the path, reverses the order, and
 * rebuilds as M...L...Z. Works for paths with M, L, and Z commands.
 * For complex curves (C, Q, A), falls back to the original path.
 */
/**
 * Compute bounding box from path coordinates without needing getBBox()
 * (which fails in DOMParser context). Parses all numbers from the d attribute.
 */
function computeBBoxFromCoords(d: string): { x: number; y: number; w: number; h: number } {
  const nums = d.match(/-?[\d.]+/g)?.map(Number) ?? [];
  if (nums.length < 4) return { x: 0, y: 0, w: 0, h: 0 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (isNaN(x) || isNaN(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function reversePath(d: string): string {
  // Extract all coordinate pairs from the path
  const coords: { x: number; y: number }[] = [];
  // Match all numbers (coordinates) in the path
  const numRegex = /(-?[\d.]+)\s*[,\s]\s*(-?[\d.]+)/g;
  let match;
  while ((match = numRegex.exec(d)) !== null) {
    coords.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) });
  }

  if (coords.length < 2) return d;

  // Reverse the coordinates and rebuild path
  coords.reverse();
  let reversed = `M${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    reversed += ` L${coords[i].x},${coords[i].y}`;
  }
  reversed += ' Z';
  return reversed;
}
