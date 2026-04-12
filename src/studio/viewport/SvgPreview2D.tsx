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
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const shapeRegistry = useDesignStore((s) => s.shapeRegistry);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgDoc, setSvgDoc] = useState<string | null>(null);

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

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
    // If past thickness, wrap back to 0 (face)
    setShapeLevel(shapeId, next > thickness ? 0 : next);
  }, [shapeLevels, setShapeLevel, material.thickness]);

  // Paint-bucket click handler
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isPanning) return;

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
        const isInside = shape.isPointInFill(svgCoord);
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
  }, [shapeLevels, selectPath, setShapeLevel, stepDeeper, isPanning, svgText]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.2, Math.min(10, z * delta)));
  }, []);

  // Middle-click or Ctrl+click pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
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
        cursor: isPanning ? 'grabbing' : 'crosshair',
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
        Click = deepen 2mm per click. Shift+click = reset to face. Ctrl+drag = pan. Scroll = zoom.
      </div>

      {/* Material surface with SVG */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: 'center center',
        transition: isPanning ? 'none' : 'transform 0.1s ease-out',
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
      el.setAttribute('fill', '#c4a66a');
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

    // Depth-proportional shading using SOLID OPAQUE colors.
    // No semi-transparent overlays — prevents visual bleed between layers.
    if (isProfileCut) {
      // Profile cut — orange dashed, dark solid fill
      if (hasStroke) {
        el.setAttribute('stroke', '#ff8800');
        styles.push(`stroke-dasharray: ${(bitStrokeWidth * 2).toFixed(1)} ${bitStrokeWidth.toFixed(1)}`);
      }
      el.setAttribute('fill', '#2a1500');
      filters.push('drop-shadow(0 0 4px #ff8800)');
    } else if (level <= 0) {
      // Face (level 0) — WHITE/bright to clearly stand out as raised above any pocket
      const currentFill = el.getAttribute('fill');
      if (currentFill === 'none' || !currentFill) {
        // Outline-only: very light fill for hit detection, nearly invisible
        el.setAttribute('fill', '#d4c49a');
        styles.push('opacity: 0.08');
      } else {
        // Filled face element: bright cream — clearly raised above dark pockets
        el.setAttribute('fill', '#f0e6cc');
        if (hasStroke) el.setAttribute('stroke', '#a08040');
      }
      filters.push('drop-shadow(1px 2px 3px rgba(0,0,0,0.6))');
    } else if (level >= material.thickness) {
      // Through-cut — solid very dark (hole appearance)
      el.setAttribute('fill', '#0a0500');
      if (hasStroke) el.setAttribute('stroke', '#662222');
    } else {
      // Relief — solid wood color darkened proportionally to depth
      // Interpolate from light wood (#c4a66a) to dark wood (#3a2510) based on depth
      const r = Math.round(196 - depthRatio * 160);
      const g = Math.round(166 - depthRatio * 140);
      const b = Math.round(106 - depthRatio * 90);
      el.setAttribute('fill', `rgb(${r}, ${g}, ${b})`);
      if (hasStroke) el.setAttribute('stroke', `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 30)})`);
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
