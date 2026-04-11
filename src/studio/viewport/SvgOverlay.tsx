import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { useDesignStore } from '../../store/designStore';
import { computeSvgTransform } from '../../svg/svgScaler';
import type { ThreeEvent } from '@react-three/fiber';

const DEPTH_COLORS: Record<string, string> = {
  face: '#44cc44',
  relief: '#4488ff',
  through: '#ff4444',
  unassigned: '#999999',
};

function DesignInstance({ offsetX, offsetY, opacity }: { offsetX: number; offsetY: number; opacity: number }) {
  const paths = useDesignStore((s) => s.paths);
  const depthAssignments = useDesignStore((s) => s.depthAssignments);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const setDepth = useDesignStore((s) => s.setDepth);

  const handleClick = (e: ThreeEvent<MouseEvent>, pathId: string) => {
    e.stopPropagation();
    selectPath(pathId);

    const assignment = depthAssignments.get(pathId);
    const currentType = assignment?.type ?? 'face';

    if (e.nativeEvent.shiftKey) {
      // Shift+click → toggle through-cut
      setDepth(pathId, currentType === 'through' ? 'face' : 'through');
    } else {
      // Click → toggle pocket (relief)
      setDepth(pathId, currentType === 'relief' ? 'face' : 'relief');
    }
  };

  return (
    <group position={[offsetX, offsetY, 0]}>
      {paths.map((path) => {
        const assignment = depthAssignments.get(path.data.id);
        const depthType = assignment?.type ?? 'unassigned';
        const color = DEPTH_COLORS[depthType];
        const isSelected = selectedPathId === path.data.id;

        return path.shapes.map((shape, shapeIdx) => (
          <mesh
            key={`${path.data.id}-${shapeIdx}`}
            onClick={(e) => handleClick(e, path.data.id)}
          >
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial
              color={color}
              opacity={(isSelected ? 0.9 : 0.6) * opacity}
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

export function SvgOverlay() {
  const paths = useDesignStore((s) => s.paths);
  const material = useDesignStore((s) => s.material);
  const svgBounds = useDesignStore((s) => s.svgBounds);
  const showCutPreview = useDesignStore((s) => s.showCutPreview);
  const toolConfig = useDesignStore((s) => s.toolConfig);
  const svgTransformOverride = useDesignStore((s) => s.svgTransformOverride);
  const designCopies = useDesignStore((s) => s.designCopies);

  const transform = useMemo(() => {
    if (!svgBounds) return null;
    return computeSvgTransform(
      { ...svgBounds, minX: 0, minY: 0 },
      material,
      toolConfig.workOrigin,
      svgTransformOverride
    );
  }, [svgBounds, material, toolConfig.workOrigin, svgTransformOverride]);

  if (paths.length === 0 || !transform || showCutPreview) return null;

  const zPos = material.thickness / 2 + 0.1;

  return (
    <group
      position={[transform.offsetX, transform.offsetY, zPos]}
      scale={[transform.scaleX, transform.scaleY, 1]}
      rotation={[0, 0, transform.rotation]}
    >
      <DesignInstance offsetX={0} offsetY={0} opacity={1} />
      {designCopies.map((copy) => (
        <DesignInstance
          key={copy.id}
          offsetX={copy.offsetX / Math.abs(transform.scaleX)}
          offsetY={copy.offsetY / Math.abs(transform.scaleY)}
          opacity={0.75}
        />
      ))}
    </group>
  );
}
