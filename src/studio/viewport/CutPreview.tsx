import { useMemo } from 'react';
import { ExtrudeGeometry, Shape, DoubleSide } from 'three';
import { useDesignStore } from '../../store/designStore';
import { computeSvgTransform } from '../../svg/svgScaler';

export function CutPreview() {
  const paths = useDesignStore((s) => s.paths);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const depthAssignments = useDesignStore((s) => s.depthAssignments);

  const transform = useMemo(() => {
    if (!svgBounds) return null;
    return computeSvgTransform({ ...svgBounds, minX: 0, minY: 0 }, material);
  }, [svgBounds, material]);

  if (paths.length === 0 || !transform) return null;

  const topZ = material.thickness / 2;

  return (
    <group>
      {paths.map((path) => {
        const assignment = depthAssignments.get(path.data.id);
        if (!assignment || assignment.type === 'face') return null;

        const cutDepth = assignment.type === 'through'
          ? material.thickness + 0.5
          : assignment.depth;

        return path.shapes.map((shape, shapeIdx) => {
          // Create extruded geometry for the cut volume
          const extrudeSettings = {
            depth: cutDepth,
            bevelEnabled: false,
          };

          return (
            <group
              key={`cut-${path.data.id}-${shapeIdx}`}
              position={[transform.offsetX, transform.offsetY, topZ]}
              scale={[transform.scaleX, transform.scaleY, 1]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {/* Pocket floor - visible bottom of the cut */}
              {assignment.type === 'relief' && (
                <mesh position={[0, 0, -0.01]}>
                  <shapeGeometry args={[shape]} />
                  <meshStandardMaterial
                    color="#8B6914"
                    roughness={0.9}
                    side={DoubleSide}
                  />
                </mesh>
              )}

              {/* Cut walls - extruded downward */}
              <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
                <extrudeGeometry args={[shape, extrudeSettings]} />
                <meshStandardMaterial
                  color={assignment.type === 'through' ? '#1a1a2e' : '#6B4D1A'}
                  roughness={0.95}
                  transparent={assignment.type === 'through'}
                  opacity={assignment.type === 'through' ? 0.15 : 0.85}
                  side={DoubleSide}
                />
              </mesh>
            </group>
          );
        });
      })}
    </group>
  );
}
