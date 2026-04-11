import { useRef, useEffect, useState, useCallback } from 'react';
import { useDesignStore } from '../../store/designStore';

/**
 * Native 2D SVG preview — renders the SVG exactly as a browser would,
 * with clickable elements for depth assignment.
 *
 * This replaces the Three.js ShapeGeometry approach for the design view,
 * which can't render text, handles strokes poorly, and creates noisy shapes.
 */
export function SvgPreview2D() {
  const svgText = useDesignStore((s) => s.svgText);
  const material = useDesignStore((s) => s.material);
  const depthAssignments = useDesignStore((s) => s.depthAssignments);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const setDepth = useDesignStore((s) => s.setDepth);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);

  const containerRef = useRef<HTMLDivElement>(null);
  const [svgDoc, setSvgDoc] = useState<string | null>(null);

  // Process SVG text: inject interactivity styles and IDs
  useEffect(() => {
    if (!svgText) {
      setSvgDoc(null);
      return;
    }

    // Parse the SVG and enhance it for interactivity
    const enhanced = enhanceSvg(svgText, depthAssignments, selectedPathId);
    setSvgDoc(enhanced);
  }, [svgText, depthAssignments, selectedPathId]);

  // Handle clicks on SVG elements
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as SVGElement;

    // Walk up to find the nearest element with a data-path-index
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
  }, [depthAssignments, selectPath, setDepth]);

  if (!svgText) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#555',
        fontSize: 14,
      }}>
        Import an SVG to see the design
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        overflow: 'auto',
        padding: 20,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          background: '#c4a66a', // Material color (wood)
          padding: 0,
          position: 'relative',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          // Scale SVG to fit while showing material bounds
          maxWidth: '100%',
          maxHeight: '100%',
          aspectRatio: `${material.width} / ${material.height}`,
          transform: `scale(${svgTransformOverride.scale}) rotate(${svgTransformOverride.rotation}deg) scaleX(${svgTransformOverride.mirrorX ? -1 : 1}) scaleY(${svgTransformOverride.mirrorY ? -1 : 1})`,
        }}
        dangerouslySetInnerHTML={svgDoc ? { __html: svgDoc } : undefined}
      />
    </div>
  );
}

/**
 * Enhance the SVG markup for interactive depth assignment.
 * Adds data-path-index attributes to clickable elements and applies
 * visual styles based on depth assignments.
 */
function enhanceSvg(
  svgText: string,
  depthAssignments: Map<string, any>,
  selectedPathId: string | null
): string {
  // Parse as DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgText;

  // Make SVG fill its container
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  // Find all shape elements and add interactivity
  const shapeElements = svg.querySelectorAll(
    'path, polygon, polyline, rect, circle, ellipse, line, text'
  );

  let index = 0;
  shapeElements.forEach((el) => {
    const pathId = `path-${index}`;
    el.setAttribute('data-path-index', String(index));

    // Apply depth-based styling
    const assignment = depthAssignments.get(pathId);
    const isSelected = selectedPathId === pathId;

    if (assignment) {
      if (assignment.type === 'relief') {
        // Blue overlay for pocketed areas
        el.setAttribute('style',
          (el.getAttribute('style') || '') +
          '; filter: drop-shadow(0 0 3px #4488ff); opacity: 0.85;'
        );
        if (el.getAttribute('fill') && el.getAttribute('fill') !== 'none') {
          el.setAttribute('fill', '#2255aa');
        }
      } else if (assignment.type === 'through') {
        // Red overlay for through-cut areas
        el.setAttribute('style',
          (el.getAttribute('style') || '') +
          '; filter: drop-shadow(0 0 3px #ff4444); opacity: 0.85;'
        );
        if (el.getAttribute('fill') && el.getAttribute('fill') !== 'none') {
          el.setAttribute('fill', '#aa2222');
        }
      }
    }

    if (isSelected) {
      el.setAttribute('style',
        (el.getAttribute('style') || '') +
        '; filter: drop-shadow(0 0 6px #ffffff); stroke-width: 3;'
      );
    }

    // Add hover cursor
    el.setAttribute('style',
      (el.getAttribute('style') || '') + '; cursor: pointer;'
    );

    index++;
  });

  // Add a subtle grid background to show material extent
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
}
