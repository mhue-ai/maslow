import { useDesignStore } from '../../store/designStore';
import type { ThreeEvent } from '@react-three/fiber';

export function MaterialBlock() {
  const material = useDesignStore((s) => s.material);
  const paths = useDesignStore((s) => s.paths);
  const setSvgTransformOverride = useDesignStore((s) => s.setSvgTransformOverride);

  const { width, height, thickness } = material;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    // Only handle clicks when SVG is loaded — click sets design center position
    if (paths.length === 0) return;
    e.stopPropagation();

    // Get click position on material surface (XY plane at Z=thickness/2)
    const point = e.point;

    // Set offset so design centers at click point
    setSvgTransformOverride({
      offsetX: point.x,
      offsetY: point.y,
    });
  };

  return (
    <mesh
      position={[0, 0, 0]}
      onClick={handleClick}
    >
      <boxGeometry args={[width, height, thickness]} />
      <meshStandardMaterial
        color="#c4a66a"
        roughness={0.8}
        metalness={0.05}
      />
    </mesh>
  );
}
