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
      // G-code Z is relative to material surface (0 = top, negative = into material)
      // 3D scene Z: top of material = thickness/2
      verts.push(seg.from.x, seg.from.y, topZ + seg.from.z);
      verts.push(seg.to.x, seg.to.y, topZ + seg.to.z);
    }

    const rGeo = new BufferGeometry();
    if (rapidVerts.length > 0) {
      rGeo.setAttribute('position', new Float32BufferAttribute(rapidVerts, 3));
    }

    const cGeo = new BufferGeometry();
    if (cutVerts.length > 0) {
      cGeo.setAttribute('position', new Float32BufferAttribute(cutVerts, 3));
    }

    return { rapidGeo: rGeo, cutGeo: cGeo };
  }, [gcode, material.thickness]);

  if (!showToolpaths || !gcode || !rapidGeo || !cutGeo) return null;

  return (
    <group>
      <lineSegments geometry={rapidGeo}>
        <lineBasicMaterial color="#4488ff" opacity={0.4} transparent linewidth={1} />
      </lineSegments>
      <lineSegments geometry={cutGeo}>
        <lineBasicMaterial color="#ff4444" opacity={0.8} transparent linewidth={1} />
      </lineSegments>
    </group>
  );
}
