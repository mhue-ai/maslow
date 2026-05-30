import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { ToolpathOverlay } from '../studio/viewport/ToolpathOverlay';
import { RenderedWorkpiece } from './RenderedWorkpiece';
import { useDesignStore } from '../store/designStore';
import { gcodeToSegments } from '../gcode/gcodeToPoints';

export type VisualizerMode = 'toolpath' | 'rendered';

function WebGLFallback() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: '#888', gap: 12, padding: 32, textAlign: 'center',
    }}>
      <div style={{ fontSize: 24 }}>3D Viewport</div>
      <div style={{ fontSize: 13, color: '#555', maxWidth: 400 }}>
        WebGL is not available. Try Chrome or Edge on a machine with a GPU.
      </div>
    </div>
  );
}

/** Compute the bounding box of all toolpath segments */
function useToolpathBounds() {
  const gcode = useDesignStore((s) => s.gcode);
  return useMemo(() => {
    if (!gcode) return null;
    const segments = gcodeToSegments(gcode.split('\n'));
    if (segments.length === 0) return null;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const seg of segments) {
      minX = Math.min(minX, seg.from.x, seg.to.x);
      maxX = Math.max(maxX, seg.from.x, seg.to.x);
      minY = Math.min(minY, seg.from.y, seg.to.y);
      maxY = Math.max(maxY, seg.from.y, seg.to.y);
    }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }, [gcode]);
}

/** Material outline — just the boundary, no obscuring fill. Toolpath is the star. */
function MaterialOutline() {
  const material = useDesignStore((s) => s.material);
  const topZ = material.thickness / 2;
  const w = material.width / 2;
  const h = material.height / 2;

  // Rectangle outline at the top surface (Z = topZ, matches G-code Z=0)
  const points = useMemo(() => {
    return new Float32Array([
      -w, -h, topZ,
      w, -h, topZ,
      w, -h, topZ,
      w, h, topZ,
      w, h, topZ,
      -w, h, topZ,
      -w, h, topZ,
      -w, -h, topZ,
    ]);
  }, [w, h, topZ]);

  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points, 3));
    return g;
  }, [points]);

  return (
    // Just the outline — no fill. Toolpath never gets obscured.
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#8a7a6a" />
    </lineSegments>
  );
}

interface Props {
  autoFrame: number; // increment to trigger re-frame
  mode: VisualizerMode;
}

function Scene({ autoFrame: _autoFrame, mode }: Props) {
  const material = useDesignStore((s) => s.material);
  const bounds = useToolpathBounds();
  const maxDim = bounds
    ? Math.max(bounds.width, bounds.height)
    : Math.max(material.width, material.height);

  return (
    <>
      <ambientLight intensity={mode === 'rendered' ? 0.35 : 0.6} />
      {/* Strong key light at a shallow angle so pocket walls cast visible
          shadows relative to the raised (uncut) letters — depth jumps out. */}
      <directionalLight
        position={[maxDim * 0.6, maxDim * 1.2, maxDim * 0.4]}
        intensity={mode === 'rendered' ? 1.1 : 0.6}
      />
      {mode === 'rendered' && (
        <>
          {/* Fill light from opposite side keeps pocket floors from going pitch black. */}
          <directionalLight position={[-maxDim, maxDim * 0.5, -maxDim]} intensity={0.45} />
          {/* Rim light picks out carved edges. */}
          <directionalLight position={[0, maxDim * 0.4, -maxDim * 1.5]} intensity={0.25} />
        </>
      )}

      {/* Rotate entire scene -90° around X so G-code Z (up) → Three.js Y (up).
          This lets us use the standard Y-up camera convention with proper top-down view. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {mode === 'toolpath' ? (
          <>
            <MaterialOutline />
            <ToolpathOverlay />
          </>
        ) : (
          <RenderedWorkpiece />
        )}
      </group>

      {/* Grid aligned with the horizontal (XZ) plane in Three.js world, which is
          the G-code XY plane after the scene rotation above. */}
      <gridHelper
        args={[maxDim * 3, Math.round(maxDim * 3 / 100), '#2a2a4a', '#1a1a2a']}
        position={[0, -material.thickness / 2 - 0.5, 0]}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        target={[0, 0, 0]}
      />
    </>
  );
}

interface ViewportProps {
  mode?: VisualizerMode;
}

export function VisualizerViewport({ mode = 'toolpath' }: ViewportProps = {}) {
  const material = useDesignStore((s) => s.material);
  const bounds = useToolpathBounds();
  const [webglFailed, setWebglFailed] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // R3F's <Canvas> uses a ResizeObserver on its parent to size the WebGL
  // drawing buffer. On INITIAL mount the parent already has its final size
  // (set by flex layout), so the observer never fires a "size changed" event
  // and the canvas stays at its HTML default 300×150 — appearing as a tiny
  // render in the top-left of an otherwise black container.
  //
  // We force the issue: after the wrapper mounts AND after each frame for the
  // first ~500 ms, dispatch a window-resize. R3F also listens to window
  // resizes, and one of these will land after R3F's effect chain has set up
  // its observer, triggering a real size sync.
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event('resize'));
    fire();
    const t1 = setTimeout(fire, 50);
    const t2 = setTimeout(fire, 200);
    const t3 = setTimeout(fire, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // Re-fire on Canvas remount (Fit button increments frameCount, which
    // changes the <Canvas key=…> prop and forces a fresh Canvas mount).
  }, [frameCount]);

  // Also watch the wrapper for any size change (e.g. window resize, sidebar
  // collapse) and propagate it as a window resize so R3F syncs.
  useLayoutEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Camera: isometric 3D angle. Works well for any aspect ratio. Y-up Three.js after
  // scene rotation — Y is "world up", XZ is the floor (G-code XY plane).
  const { camPos, fov } = useMemo(() => {
    // Use toolpath bounds if larger than material (for designs that span beyond)
    const effectiveWidth = bounds ? Math.max(bounds.width, material.width) : material.width;
    const effectiveHeight = bounds ? Math.max(bounds.height, material.height) : material.height;
    const maxDim = Math.max(effectiveWidth, effectiveHeight);
    const dist = maxDim * 1.2;
    return {
      // Classic isometric-ish: equal offsets in X, Y, Z for a 3D perspective view
      camPos: [dist * 0.7, dist * 0.9, dist * 0.7] as [number, number, number],
      fov: 45,
    };
  }, [material, bounds]);

  const maxDim = Math.max(material.width, material.height, material.thickness);

  if (webglFailed) {
    return <WebGLFallback />;
  }

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', background: '#0a0a14', position: 'relative' }}>
      {/* Frame button — reset camera */}
      <button
        onClick={() => setFrameCount((c) => c + 1)}
        title="Reset camera to fit toolpath"
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          background: '#1a1a30', border: '1px solid #2a2a4a', color: '#aaa',
          padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
        }}
      >
        ↻ Fit
      </button>

      <Canvas
        key={frameCount} /* remount to reapply camera position */
        camera={{
          position: camPos,
          fov,
          near: 0.1,
          far: maxDim * 20,
        }}
        fallback={<WebGLFallback />}
        onError={() => setWebglFailed(true)}
        // Force ResizeObserver to fire immediately. Default is debounced ~100ms,
        // and on initial mount the canvas can stay at the 300×150 default size
        // until the debounce expires — which looks like a "black page" because
        // the tiny canvas sits at top-left of the 1200+px container.
        resize={{ debounce: 0, scroll: false }}
        // Belt-and-suspenders: also tell the canvas element itself to fill the
        // wrapper via CSS, so even if ResizeObserver hasn't fired yet the
        // browser scales the existing drawing buffer to the visible area.
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <Scene autoFrame={frameCount} mode={mode} />
      </Canvas>

      {bounds && (
        <div style={{
          position: 'absolute', bottom: 8, right: 12, fontSize: 10, color: '#555',
          pointerEvents: 'none', fontFamily: 'monospace',
        }}>
          Toolpath: {bounds.width.toFixed(0)} × {bounds.height.toFixed(0)} mm
        </div>
      )}
    </div>
  );
}
