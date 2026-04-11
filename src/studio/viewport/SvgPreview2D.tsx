import { useRef, useEffect, useState, useCallback } from 'react';
import { useDesignStore } from '../../store/designStore';

/**
 * Native 2D SVG preview with zoom/pan and clickable depth assignment.
 * Renders the SVG exactly as a browser would — text, fonts, strokes, fills.
 */
export function SvgPreview2D() {
  const svgText = useDesignStore((s) => s.svgText);
  const material = useDesignStore((s) => s.material);
  const depthAssignments = useDesignStore((s) => s.depthAssignments);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const setDepth = useDesignStore((s) => s.setDepth);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const profileCutId = useDesignStore((s) => s.profileCutId);
  const toolConfig = useDesignStore((s) => s.toolConfig);

  const containerRef = useRef<HTMLDivElement>(null);
  const [svgDoc, setSvgDoc] = useState<string | null>(null);

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Process SVG text with interactivity enhancements
  useEffect(() => {
    if (!svgText) { setSvgDoc(null); return; }
    setSvgDoc(enhanceSvg(svgText, depthAssignments, selectedPathId, profileCutId, toolConfig.bitDiameter, material));
  }, [svgText, depthAssignments, selectedPathId, profileCutId, toolConfig.bitDiameter, material]);

  // Handle clicks on SVG elements — toggle pocket/through
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isPanning) return; // Don't toggle during pan

    const target = e.target as Element;
    let el: Element | null = target;
    while (el && !(el as HTMLElement).dataset?.pathIndex) {
      el = el.parentElement;
    }
    if (!el) return;
    const pathIndex = (el as HTMLElement).dataset.pathIndex;
    if (!pathIndex) return;

    const pathId = `path-${pathIndex}`;
    selectPath(pathId);

    const assignment = depthAssignments.get(pathId);
    const currentType = assignment?.type ?? 'face';

    if (e.shiftKey) {
      setDepth(pathId, currentType === 'through' ? 'face' : 'through');
    } else {
      setDepth(pathId, currentType === 'relief' ? 'face' : 'relief');
    }
  }, [depthAssignments, selectPath, setDepth, isPanning]);

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
        cursor: isPanning ? 'grabbing' : 'default',
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
        Scroll = zoom. Ctrl+drag = pan. Click = pocket. Shift+click = through.
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
          {/* Material dimensions label */}
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
  depthAssignments: Map<string, any>,
  selectedPathId: string | null,
  profileCutId: string | null,
  bitDiameter: number,
  material: { width: number; height: number }
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
  // Scale bit diameter to SVG coordinate space
  const bitStrokeWidth = (bitDiameter / material.width) * svgWidth;

  const shapeElements = svg.querySelectorAll(
    'path, polygon, polyline, rect, circle, ellipse, line, text'
  );

  let index = 0;
  shapeElements.forEach((el) => {
    const pathId = `path-${index}`;
    const isProfileCut = pathId === profileCutId;
    el.setAttribute('data-path-index', String(index));

    const assignment = depthAssignments.get(pathId);
    const isSelected = selectedPathId === pathId;
    const depthType = assignment?.type ?? 'face';
    const styles: string[] = ['cursor: pointer'];
    const filters: string[] = [];

    // Scale strokes to represent bit kerf width
    const hasStroke = el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none';
    if (hasStroke) {
      styles.push(`stroke-width: ${bitStrokeWidth.toFixed(2)}`);
      styles.push('stroke-linecap: round');
      styles.push('stroke-linejoin: round');
    }

    // Profile cut — orange dashed outline
    if (isProfileCut) {
      if (hasStroke) {
        el.setAttribute('stroke', '#ff8800');
        styles.push(`stroke-dasharray: ${(bitStrokeWidth * 2).toFixed(1)} ${bitStrokeWidth.toFixed(1)}`);
      }
      filters.push('drop-shadow(0 0 4px #ff8800)');
      styles.push('opacity: 0.9');
    } else if (depthType === 'relief') {
      filters.push('drop-shadow(0 0 3px #4488ff)');
      styles.push('opacity: 0.85');
      // Show pocket fill area — fill the interior with blue to visualize the pocketed region
      el.setAttribute('fill', 'rgba(34, 85, 170, 0.4)');
      if (hasStroke) el.setAttribute('stroke', '#4488ff');
    } else if (depthType === 'through' && !isProfileCut) {
      filters.push('drop-shadow(0 0 3px #ff4444)');
      styles.push('opacity: 0.85');
      // Show through-cut area
      el.setAttribute('fill', 'rgba(170, 34, 34, 0.4)');
      if (hasStroke) el.setAttribute('stroke', '#ff4444');
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
    index++;
  });

  return new XMLSerializer().serializeToString(svg);
}
