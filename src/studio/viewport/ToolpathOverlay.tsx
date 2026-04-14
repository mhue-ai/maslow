import { useMemo, useRef, useEffect } from 'react';
import { BufferGeometry, Float32BufferAttribute, Vector3, Line as ThreeLine, LineBasicMaterial } from 'three';
import { useFrame } from '@react-three/fiber';
import { useDesignStore } from '../../store/designStore';
import { gcodeToSegments } from '../../gcode/gcodeToPoints';

/**
 * Renders G-code toolpaths with optional animated playback.
 * Static mode: all paths shown at once (red cuts, blue rapids).
 * Simulation mode: progressive reveal with green completed, gray upcoming, yellow tool head.
 */
export function ToolpathOverlay() {
  const gcode = useDesignStore((s) => s.gcode);
  const material = useDesignStore((s) => s.material);
  const showToolpaths = useDesignStore((s) => s.showToolpaths);
  const simSetTotalSegments = useDesignStore((s) => s.simSetTotalSegments);

  const accumulatorRef = useRef(0);
  const prevGeoRef = useRef<BufferGeometry[]>([]);

  // Parse segments once when gcode changes
  const segments = useMemo(() => {
    if (!gcode) return [];
    return gcodeToSegments(gcode.split('\n'));
  }, [gcode]);

  // Update total segments count in store
  useEffect(() => {
    simSetTotalSegments(segments.length);
  }, [segments.length, simSetTotalSegments]);

  // Reset accumulator when simulation resets
  const simProgress = useDesignStore((s) => s.simProgress);
  useEffect(() => {
    if (simProgress === 0) accumulatorRef.current = 0;
  }, [simProgress]);

  // Animate: advance simProgress each frame
  useFrame((_, delta) => {
    const state = useDesignStore.getState();
    if (!state.simPlaying || segments.length === 0) return;

    if (state.simProgress >= segments.length) {
      state.simPause();
      return;
    }

    // Clamp delta to avoid jumps after tab-away
    const clampedDelta = Math.min(delta, 0.1);
    accumulatorRef.current += clampedDelta * 30 * state.simSpeed;
    const steps = Math.floor(accumulatorRef.current);
    if (steps > 0) {
      accumulatorRef.current -= steps;
      const newProgress = Math.min(state.simProgress + steps, segments.length);
      state.simSetProgress(newProgress);
    }
  });

  const simPlaying = useDesignStore((s) => s.simPlaying);
  const topZ = material.thickness / 2;
  const isSimulating = simProgress > 0 || simPlaying;

  // Build geometries — dispose old ones to prevent memory leaks
  const geoResult = useMemo(() => {
    // Dispose previous geometries
    prevGeoRef.current.forEach((g) => g.dispose());
    prevGeoRef.current = [];

    if (segments.length === 0) {
      return { completedRapidGeo: null, completedCutGeo: null, upcomingGeo: null, toolPos: null };
    }

    if (!isSimulating) {
      // Static mode
      const rapidVerts: number[] = [];
      const cutVerts: number[] = [];

      for (const seg of segments) {
        const verts = seg.type === 'rapid' ? rapidVerts : cutVerts;
        verts.push(seg.from.x, seg.from.y, topZ + seg.from.z);
        verts.push(seg.to.x, seg.to.y, topZ + seg.to.z);
      }

      const rGeo = makeGeo(rapidVerts);
      const cGeo = makeGeo(cutVerts);
      if (rGeo) prevGeoRef.current.push(rGeo);
      if (cGeo) prevGeoRef.current.push(cGeo);

      return { completedRapidGeo: rGeo, completedCutGeo: cGeo, upcomingGeo: null, toolPos: null };
    }

    // Simulation mode — split by progress
    const doneRapidVerts: number[] = [];
    const doneCutVerts: number[] = [];
    const todoVerts: number[] = [];
    let tp: Vector3 | null = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (i < simProgress) {
        const verts = seg.type === 'rapid' ? doneRapidVerts : doneCutVerts;
        verts.push(seg.from.x, seg.from.y, topZ + seg.from.z);
        verts.push(seg.to.x, seg.to.y, topZ + seg.to.z);
        tp = new Vector3(seg.to.x, seg.to.y, topZ + seg.to.z);
      } else {
        todoVerts.push(seg.from.x, seg.from.y, topZ + seg.from.z);
        todoVerts.push(seg.to.x, seg.to.y, topZ + seg.to.z);
      }
    }

    const drGeo = makeGeo(doneRapidVerts);
    const dcGeo = makeGeo(doneCutVerts);
    const tGeo = makeGeo(todoVerts);
    if (drGeo) prevGeoRef.current.push(drGeo);
    if (dcGeo) prevGeoRef.current.push(dcGeo);
    if (tGeo) prevGeoRef.current.push(tGeo);

    return { completedRapidGeo: drGeo, completedCutGeo: dcGeo, upcomingGeo: tGeo, toolPos: tp };
  }, [segments, simProgress, isSimulating, topZ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      prevGeoRef.current.forEach((g) => g.dispose());
      prevGeoRef.current = [];
    };
  }, []);

  if (!showToolpaths || !gcode) return null;

  const { completedRapidGeo, completedCutGeo, upcomingGeo, toolPos } = geoResult;

  return (
    <group>
      {/* Completed rapids */}
      {completedRapidGeo && (
        <lineSegments geometry={completedRapidGeo}>
          <lineBasicMaterial color={isSimulating ? '#335588' : '#4488ff'} opacity={isSimulating ? 0.25 : 0.4} transparent />
        </lineSegments>
      )}

      {/* Completed cuts */}
      {completedCutGeo && (
        <lineSegments geometry={completedCutGeo}>
          <lineBasicMaterial color={isSimulating ? '#44cc44' : '#ff4444'} opacity={isSimulating ? 0.9 : 0.8} transparent />
        </lineSegments>
      )}

      {/* Upcoming (not yet cut) */}
      {upcomingGeo && (
        <lineSegments geometry={upcomingGeo}>
          <lineBasicMaterial color="#444444" opacity={0.2} transparent />
        </lineSegments>
      )}

      {/* Tool head indicator */}
      {toolPos && isSimulating && <ToolHead position={toolPos} topZ={topZ} />}
    </group>
  );
}

/** Yellow sphere at tool position with vertical drop line */
function ToolHead({ position, topZ }: { position: Vector3; topZ: number }) {
  const lineObj = useMemo(
    () => new ThreeLine(new BufferGeometry(), new LineBasicMaterial({ color: '#ffcc00', opacity: 0.4, transparent: true })),
    [],
  );

  // Update drop line geometry when position changes
  useEffect(() => {
    const geo = new BufferGeometry();
    const dropZ = -(position.z - topZ);
    geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, dropZ], 3));
    lineObj.geometry.dispose();
    lineObj.geometry = geo;
  }, [position, topZ, lineObj]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      lineObj.geometry.dispose();
      (lineObj.material as LineBasicMaterial).dispose();
    };
  }, [lineObj]);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[3, 12, 12]} />
        <meshStandardMaterial color="#ffcc00" emissive="#ffaa00" emissiveIntensity={0.8} />
      </mesh>
      <primitive object={lineObj} />
    </group>
  );
}

function makeGeo(verts: number[]): BufferGeometry | null {
  if (verts.length === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  return geo;
}
