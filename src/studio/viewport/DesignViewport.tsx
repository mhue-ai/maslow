import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { MaterialBlock } from './MaterialBlock';
import { SvgOverlay } from './SvgOverlay';
import { CutPreview } from './CutPreview';
import { useDesignStore } from '../../store/designStore';

function WebGLFallback() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: '#888',
      gap: 12,
      padding: 32,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 24 }}>3D Viewport</div>
      <div style={{ fontSize: 13, color: '#555', maxWidth: 400 }}>
        WebGL is not available in this browser. The 3D viewport requires a browser
        with GPU acceleration enabled. Try opening this app in Chrome or Edge on
        a machine with a GPU.
      </div>
    </div>
  );
}

function Scene() {
  const material = useDesignStore((s) => s.material);
  const showCutPreview = useDesignStore((s) => s.showCutPreview);
  const maxDim = Math.max(material.width, material.height, material.thickness);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[maxDim, maxDim, maxDim]} intensity={0.8} />
      <directionalLight position={[-maxDim * 0.5, -maxDim * 0.3, maxDim * 0.5]} intensity={0.3} />

      <MaterialBlock />
      <SvgOverlay />
      {showCutPreview && <CutPreview />}

      <Grid
        args={[maxDim * 4, maxDim * 4]}
        position={[0, 0, -material.thickness / 2 - 0.5]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#1a1a3a"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#2a2a5a"
        fadeDistance={maxDim * 3}
        infiniteGrid
      />

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <axesHelper args={[maxDim * 0.3]} />
    </>
  );
}

export function DesignViewport() {
  const material = useDesignStore((s) => s.material);
  const [webglFailed, setWebglFailed] = useState(false);

  const maxDim = Math.max(material.width, material.height, material.thickness);
  const camDist = maxDim * 1.8;

  if (webglFailed) {
    return (
      <div className="viewport">
        <WebGLFallback />
      </div>
    );
  }

  return (
    <div className="viewport">
      <Canvas
        camera={{
          position: [camDist * 0.6, camDist * 0.4, camDist * 0.8],
          fov: 45,
          near: 0.1,
          far: maxDim * 20,
        }}
        onCreated={() => {}}
        fallback={<WebGLFallback />}
        onError={() => setWebglFailed(true)}
      >
        <Scene />
      </Canvas>

      <div style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        fontSize: 11,
        color: '#555',
        pointerEvents: 'none',
      }}>
        {material.width} x {material.height} x {material.thickness} mm
      </div>
    </div>
  );
}
