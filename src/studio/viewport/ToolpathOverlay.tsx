import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { useDesignStore } from '../../store/designStore';
import { gcodeToSegments } from '../../gcode/gcodeToPoints';

/**
 * Renders generated G-code toolpaths as colored lines in the 3D viewport.
 * Red = cutting moves (G1), Blue = rapid moves (G0).
 */
export function ToolpathOverlay() {
  const gcode = useDesignStore((s) => s.gcode);
  const material = useDesignStore((s) => s.material);
  const showToolpaths = useDesignStore((s) => s.showToolpaths);

  const { rapidGeo, cutGeo } = useMemo(() => {
    if (!gcode) return { rapidGeo: null, cutGeo: null };

    const segments = gcodeToSegments(gcode.split('\n'));
    const rapidVerts: number[] = [];
    const cutVerts: number[] = [];

    const topZ = material.thickness / 2;

    for (const seg of segments) {
      const verts = seg.type === 'rapid' ? rapidVerts : cutVerts;
      verts.push(seg.from.x, seg.from.y, topZ + seg.from.z);
      verts.push(seg.to.x, seg.to.y, topZ + seg.to.z);
    }

    // Only create geometry if we have vertices — empty BufferGeometry crashes renderer
    let rGeo: BufferGeometry | null = null;
    if (rapidVerts.length > 0) {
      rGeo = new BufferGeometry();
      rGeo.setAttribute('position', new Float32BufferAttribute(rapidVerts, 3));
    }

    let cGeo: BufferGeometry | null = null;
    if (cutVerts.length > 0) {
      cGeo = new BufferGeometry();
      cGeo.setAttribute('position', new Float32BufferAttribute(cutVerts, 3));
    }

    return { rapidGeo: rGeo, cutGeo: cGeo };
  }, [gcode, material.thickness]);

  if (!showToolpaths || !gcode) return null;

  return (
    <group>
      {rapidGeo && (
        <lineSegments geometry={rapidGeo}>
          <lineBasicMaterial color="#4488ff" opacity={0.4} transparent linewidth={1} />
        </lineSegments>
      )}
      {cutGeo && (
        <lineSegments geometry={cutGeo}>
          <lineBasicMaterial color="#ff4444" opacity={0.8} transparent linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
}
