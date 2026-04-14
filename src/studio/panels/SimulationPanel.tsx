import { useDesignStore } from '../../store/designStore';

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10];

export function SimulationPanel() {
  const simPlaying = useDesignStore((s) => s.simPlaying);
  const simProgress = useDesignStore((s) => s.simProgress);
  const simSpeed = useDesignStore((s) => s.simSpeed);
  const simTotalSegments = useDesignStore((s) => s.simTotalSegments);
  const simPlay = useDesignStore((s) => s.simPlay);
  const simPause = useDesignStore((s) => s.simPause);
  const simReset = useDesignStore((s) => s.simReset);
  const simSetProgress = useDesignStore((s) => s.simSetProgress);
  const simSetSpeed = useDesignStore((s) => s.simSetSpeed);

  const pct = simTotalSegments > 0 ? Math.round((simProgress / simTotalSegments) * 100) : 0;
  const isDone = simProgress >= simTotalSegments && simTotalSegments > 0;

  const handlePlayPause = () => {
    if (simPlaying) {
      simPause();
    } else if (isDone) {
      // Restart from beginning if completed
      simSetProgress(0);
      simPlay();
    } else {
      simPlay();
    }
  };

  return (
    <div style={{
      background: '#12122a',
      border: '1px solid #2a2a4a',
      borderRadius: 6,
      padding: 10,
    }}>
      {/* Progress bar */}
      <div
        style={{
          height: 6,
          background: '#1a1a30',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 8,
          cursor: 'pointer',
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          simSetProgress(Math.round(ratio * simTotalSegments));
        }}
      >
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: isDone ? '#44cc44' : '#4488ff',
          borderRadius: 3,
          transition: simPlaying ? 'none' : 'width 0.15s',
        }} />
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Play/Pause */}
        <button
          className="btn btn-sm"
          onClick={handlePlayPause}
          disabled={simTotalSegments === 0}
          style={{
            minWidth: 36,
            fontSize: 14,
            background: simPlaying ? '#332200' : '#1a2a1a',
            border: `1px solid ${simPlaying ? '#664400' : '#2a4a2a'}`,
            color: simPlaying ? '#ffaa44' : '#44cc44',
          }}
        >
          {simPlaying ? '⏸' : '▶'}
        </button>

        {/* Reset */}
        <button
          className="btn btn-sm"
          onClick={simReset}
          disabled={simProgress === 0 && !simPlaying}
          style={{ minWidth: 36, fontSize: 12 }}
        >
          ⏮
        </button>

        {/* Progress text */}
        <div style={{ flex: 1, fontSize: 10, color: '#888', textAlign: 'center', fontFamily: 'monospace' }}>
          {simProgress.toLocaleString()} / {simTotalSegments.toLocaleString()} ({pct}%)
        </div>

        {/* Speed selector */}
        <div style={{ display: 'flex', gap: 2 }}>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              className="btn btn-sm"
              onClick={() => simSetSpeed(s)}
              style={{
                padding: '2px 5px',
                fontSize: 9,
                minWidth: 0,
                background: simSpeed === s ? '#1a2a4a' : undefined,
                border: simSpeed === s ? '1px solid #4488ff' : undefined,
                color: simSpeed === s ? '#4488ff' : '#666',
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={simTotalSegments}
        value={simProgress}
        onChange={(e) => simSetProgress(Number(e.target.value))}
        style={{
          width: '100%',
          marginTop: 6,
          height: 4,
          appearance: 'auto',
          accentColor: '#4488ff',
        }}
      />
    </div>
  );
}
