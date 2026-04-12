import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { useDesignStore } from '../../store/designStore';
import { computeSvgTransform } from '../../svg/svgScaler';

export function CutPreview() {
  const paths = useDesignStore((s) => s.paths);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const shapeLevels = useDesignStore((s) => s.shapeLevels);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);

  const transform = useMemo(() => {
    if (!svgBounds) return null;
    return computeSvgTransform(svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance);
  }, [svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance]);

  if (paths.length === 0 || !transform) return null;

  const topZ = material.thickness / 2;

  return (
    <group>
      {paths.map((path) => {
        const level = shapeLevels.get(path.data.id)?.level ?? 0;
        if (level <= 0) return null;

        const cutDepth = level >= material.thickness
          ? material.thickness + 0.5
          : level;

        return path.shapes.map((shape, shapeIdx) => (
          <group
            key={`cut-${path.data.id}-${shapeIdx}`}
            position={[transform.offsetX, transform.offsetY, topZ]}
            scale={[transform.scaleX, transform.scaleY, 1]}
            rotation={[0, 0, transform.rotation]}
          >
            {/* Pocket floor at the bottom of the cut */}
            {level < material.thickness && (
              <mesh position={[0, 0, -cutDepth]}>
                <shapeGeometry args={[shape]} />
                <meshStandardMaterial
                  color="#8B6914"
                  roughness={0.9}
                  side={DoubleSide}
                />
              </mesh>
            )}

            {/* Cut walls — extruded downward from top surface into material */}
            <mesh position={[0, 0, -cutDepth]} rotation={[0, 0, 0]}>
              <extrudeGeometry args={[shape, { depth: cutDepth, bevelEnabled: false }]} />
              <meshStandardMaterial
                color={level >= material.thickness ? '#1a1a2e' : '#6B4D1A'}
                roughness={0.95}
                transparent={level >= material.thickness}
                opacity={level >= material.thickness ? 0.15 : 0.85}
                side={DoubleSide}
              />
            </mesh>
          </group>
        ));
      })}
    </group>
  );
}
