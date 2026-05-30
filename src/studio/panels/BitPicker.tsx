import { useDesignStore } from '../../store/designStore';
import { BIT_PRESETS } from '../../types/design';

/**
 * Bit picker — the maker chooses a router bit from a small visual set instead
 * of typing a diameter + stepover. Selecting a bit derives diameter, stepover,
 * and clamps depth-per-pass (see store.applyBit). The exact numbers live in
 * Advanced settings for anyone who wants to override.
 */
export function BitPicker() {
  const bitDiameter = useDesignStore((s) => s.toolConfig.bitDiameter);
  const applyBit = useDesignStore((s) => s.applyBit);

  // Which preset is currently active (diameter within 0.05mm)?
  const activeIdx = BIT_PRESETS.findIndex((b) => Math.abs(b.diameter - bitDiameter) < 0.05);
  const active = activeIdx >= 0 ? BIT_PRESETS[activeIdx] : null;

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#bbb', marginBottom: 4 }}>
        Router bit
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {BIT_PRESETS.map((b, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={b.name}
              onClick={() => applyBit(b.diameter, b.stepover, b.maxDepthPerPass)}
              title={`${b.name} — ${b.blurb}`}
              style={{
                padding: '6px 2px',
                borderRadius: 4,
                border: `1px solid ${isActive ? '#4a7abf' : '#2a2a4a'}`,
                background: isActive ? '#1a2a4a' : '#0d0d1a',
                color: isActive ? '#aee' : '#999',
                fontSize: 12,
                fontWeight: isActive ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {b.short}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 10, color: '#666', margin: '4px 0 0' }}>
        {active
          ? active.blurb
          : `Custom ${bitDiameter.toFixed(2)}mm bit (set in Advanced)`}
      </p>
    </div>
  );
}
