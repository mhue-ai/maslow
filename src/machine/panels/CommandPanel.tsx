import { useState, useRef, useEffect } from 'react';
import { send } from '../../comms/maslowSocket';
import { useMachineStore } from '../../store/machineStore';

const QUICK_COMMANDS = [
  { label: '$X', cmd: '$X', desc: 'Clear alarm' },
  { label: '$H', cmd: '$H', desc: 'Home all axes' },
  { label: 'MINFO', cmd: 'MINFO', desc: 'Machine info' },
  { label: '$RET', cmd: '$RET', desc: 'Retract all' },
  { label: '$EXT', cmd: '$EXT', desc: 'Extend all' },
];

export function CommandPanel() {
  const [input, setInput] = useState('');
  const [paused, setPaused] = useState(false);
  const consoleLog = useMachineStore((s) => s.consoleLog);
  const connection = useMachineStore((s) => s.connection);
  const clearConsole = useMachineStore((s) => s.clearConsole);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll only when not paused
  useEffect(() => {
    if (!paused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [consoleLog, paused]);

  const handleSend = () => {
    if (!input.trim()) return;
    send(input.trim());
    setInput('');
  };

  const disabled = connection !== 'connected';

  return (
    <div>
      <h3>Console</h3>

      {/* Quick command buttons */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {QUICK_COMMANDS.map((qc) => (
          <button
            key={qc.cmd}
            className="btn btn-sm"
            onClick={() => send(qc.cmd)}
            disabled={disabled}
            title={qc.desc}
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Command input */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Send command..."
          disabled={disabled}
          style={{
            flex: 1,
            padding: '4px 8px',
            border: '1px solid #333',
            borderRadius: 4,
            background: '#0d0d1a',
            color: '#ddd',
            fontSize: 13,
          }}
        />
        <button className="btn btn-sm" onClick={handleSend} disabled={disabled}>
          Send
        </button>
      </div>

      {/* Console output */}
      <div style={{ position: 'relative' }}>
        {paused && (
          <div style={{
            position: 'absolute',
            top: 4,
            right: 12,
            fontSize: 9,
            color: '#ffaa44',
            background: '#332200',
            padding: '2px 6px',
            borderRadius: 3,
            zIndex: 1,
          }}>
            PAUSED
          </div>
        )}
        <div
          ref={logRef}
          style={{
            height: 200,
            overflow: 'auto',
            background: '#0a0a14',
            border: `1px solid ${paused ? '#664400' : '#222'}`,
            borderRadius: 4,
            padding: 8,
            fontFamily: 'monospace',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {consoleLog.map((msg, i) => (
            <div
              key={`${msg.timestamp}-${i}`}
              style={{
                color:
                  msg.type === 'error'
                    ? '#ff6666'
                    : msg.type === 'info'
                    ? '#88aacc'
                    : '#888',
              }}
            >
              {msg.text}
            </div>
          ))}
          {consoleLog.length === 0 && (
            <div style={{ color: '#444' }}>Console output will appear here...</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          className="btn btn-sm"
          onClick={() => setPaused(!paused)}
          style={{
            background: paused ? '#332200' : undefined,
            border: paused ? '1px solid #664400' : undefined,
            color: paused ? '#ffaa44' : undefined,
          }}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          className="btn btn-sm"
          onClick={clearConsole}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
