import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { useDesignStore } from '../../store/designStore';
import { computeSvgTransform } from '../../svg/svgScaler';

const DEPTH_COLORS: Record<string, string> = {
  face: '#44cc44',
  relief: '#4488ff',
  through: '#ff4444',
  unassigned: '#888888',
};

export function SvgOverlay() {
  const paths = useDesignStore((s) => s.paths);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const depthAssignments = useDesignStore((s) => s.depthAssignments);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const showCutPreview = useDesignStore((s) => s.showCutPreview);

  const transform = useMemo(() => {
    if (!svgBounds) return null;
    return computeSvgTransform(
      { ...svgBounds, minX: 0, minY: 0 },
      material
    );
  }, [svgBounds, material]);

  if (paths.length === 0 || !transform || showCutPreview) return null;

  // Position SVG slightly above the material top face
  const zPos = material.thickness / 2 + 0.1;

  // ShapeGeometry lies in the XY plane. The material top face is also XY at Z=zPos.
  // No rotation needed — scale handles the SVG Y-flip, position handles centering.
  return (
    <group
      position={[transform.offsetX, transform.offsetY, zPos]}
      scale={[transform.scaleX, transform.scaleY, 1]}
    >
      {paths.map((path) => {
        const assignment = depthAssignments.get(path.data.id);
        const depthType = assignment?.type ?? 'unassigned';
        const color = DEPTH_COLORS[depthType];
        const isSelected = selectedPathId === path.data.id;

        return path.shapes.map((shape, shapeIdx) => (
          <mesh
            key={`${path.data.id}-${shapeIdx}`}
            onClick={(e) => {
              e.stopPropagation();
              selectPath(path.data.id);
            }}
          >
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial
              color={color}
              opacity={isSelected ? 0.9 : 0.6}
              transparent
              side={DoubleSide}
              emissive={isSelected ? '#ffffff' : '#000000'}
              emissiveIntensity={isSelected ? 0.15 : 0}
            />
          </mesh>
        ));
      })}
    </group>
  );
}
