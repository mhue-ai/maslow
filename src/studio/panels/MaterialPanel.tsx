import { useState } from 'react';
import { useDesignStore } from '../../store/designStore';
import { BUILT_IN_PRESETS, type MaterialPreset } from '../../types/design';

const STORAGE_KEY = 'maslow-material-presets';

function loadCustomPresets(): MaterialPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: MaterialPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function MaterialPanel() {
  const material = useDesignStore((s) => s.material);
  const setMaterial = useDesignStore((s) => s.setMaterial);
  const setToolConfig = useDesignStore((s) => s.setToolConfig);
  const [customPresets, setCustomPresets] = useState<MaterialPreset[]>(loadCustomPresets);

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  const applyPreset = (preset: MaterialPreset) => {
    setMaterial({ width: preset.width, height: preset.height, thickness: preset.thickness });
    setToolConfig({
      feedRate: preset.feedRate,
      plungeRate: preset.plungeRate,
      rpm: preset.rpm,
      depthPerPass: preset.depthPerPass,
    });
  };

  const saveCurrentAsPreset = () => {
    const name = prompt('Preset name:');
    if (!name) return;
    const toolConfig = useDesignStore.getState().toolConfig;
    const preset: MaterialPreset = {
      name,
      width: material.width,
      height: material.height,
      thickness: material.thickness,
      feedRate: toolConfig.feedRate,
      plungeRate: toolConfig.plungeRate,
      rpm: toolConfig.rpm,
      depthPerPass: toolConfig.depthPerPass,
    };
    const updated = [...customPresets, preset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
  };

  return (
    <div>
      <h3>Material</h3>

      <label>
        Preset
        <select
          value=""
          onChange={(e) => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx) && allPresets[idx]) applyPreset(allPresets[idx]);
          }}
          style={{
            padding: '4px 6px',
            border: '1px solid #333',
            borderRadius: 4,
            background: '#0d0d1a',
            color: '#ddd',
            fontSize: 12,
            width: 130,
          }}
        >
          <option value="">Select preset...</option>
          {allPresets.map((p, i) => (
            <option key={`${p.name}-${i}`} value={i}>{p.name}</option>
          ))}
        </select>
      </label>

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
          max={2500}
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

      <button className="btn btn-sm" onClick={saveCurrentAsPreset} style={{ marginTop: 4 }}>
        Save as Preset
      </button>
    </div>
  );
}
