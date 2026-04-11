import { useDesignStore } from '../../store/designStore';

export function MaterialBlock() {
  const material = useDesignStore((s) => s.material);

  // Three.js uses meters by default, but we work in mm.
  // We'll keep everything in mm scale in the scene.
  const { width, height, thickness } = material;

  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[width, height, thickness]} />
      <meshStandardMaterial
        color="#c4a66a"
        roughness={0.8}
        metalness={0.05}
      />
    </mesh>
  );
}
