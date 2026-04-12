import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { useDesignStore } from '../../store/designStore';
import { computeSvgTransform } from '../../svg/svgScaler';

function DesignInstance({ offsetX, offsetY, opacity }: { offsetX: number; offsetY: number; opacity: number }) {
  const paths = useDesignStore((s) => s.paths);
  const shapeLevels = useDesignStore((s) => s.shapeLevels);
  const selectedPathId = useDesignStore((s) => s.selectedPathId);
  const selectPath = useDesignStore((s) => s.selectPath);
  const material = useDesignStore((s) => s.material);

  return (
    <group position={[offsetX, offsetY, 0]}>
      {paths.map((path) => {
        const level = shapeLevels.get(path.data.id)?.level ?? 0;
        const ratio = Math.min(1, level / material.thickness);
        const color = level <= 0 ? '#44cc44' : level >= material.thickness ? '#ff4444' : `rgb(${68 - ratio * 40}, ${100 - ratio * 60}, ${200 - ratio * 100})`;
        const isSelected = selectedPathId === path.data.id;

        return path.shapes.map((shape, shapeIdx) => (
          <mesh
            key={`${path.data.id}-${shapeIdx}`}
            onClick={(e) => { e.stopPropagation(); selectPath(path.data.id); }}
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
    return computeSvgTransform(svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance);
  }, [svgBounds, material, toolConfig.workOrigin, svgTransformOverride, toolConfig.edgeClearance]);

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
