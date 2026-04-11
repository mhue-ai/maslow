import { useDesignStore } from '../../store/designStore';

export function MaterialPanel() {
  const material = useDesignStore((s) => s.material);
  const setMaterial = useDesignStore((s) => s.setMaterial);

  return (
    <div>
      <h3>Material</h3>
      <label>
        Width
        <input
          type="number"
          value={material.width}
          min={10}
          max={2500}
          step={1}
          onChange={(e) => setMaterial({ width: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>
      <label>
        Height
        <input
          type="number"
          value={material.height}
          min={10}
          max={1300}
          step={1}
          onChange={(e) => setMaterial({ height: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>
      <label>
        Thickness
        <input
          type="number"
          value={material.thickness}
          min={1}
          max={100}
          step={0.5}
          onChange={(e) => setMaterial({ thickness: Number(e.target.value) })}
        />
        <span className="unit">mm</span>
      </label>
    </div>
  );
}
