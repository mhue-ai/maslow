import { useMachineStore } from '../../store/machineStore';
import { connect, disconnect } from '../../comms/maslowSocket';

const STATUS_COLORS: Record<string, string> = {
  disconnected: '#555',
  connecting: '#f0a030',
  connected: '#44cc44',
  error: '#ff4444',
};

export function ConnectionPanel() {
  const connection = useMachineStore((s) => s.connection);
  const url = useMachineStore((s) => s.url);
  const setUrl = useMachineStore((s) => s.setUrl);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: STATUS_COLORS[connection],
          flexShrink: 0,
        }}
      />
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{
          flex: 1,
          padding: '4px 8px',
          border: '1px solid #333',
          borderRadius: 4,
          background: '#0d0d1a',
          color: '#ddd',
          fontSize: 13,
        }}
        placeholder="ws://maslow.fortmiller"
      />
      {connection === 'connected' ? (
        <button className="btn btn-sm" onClick={disconnect}>
          Disconnect
        </button>
      ) : (
        <button
          className="btn btn-sm btn-primary"
          onClick={() => connect(url)}
          disabled={connection === 'connecting'}
        >
          {connection === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      )}
    </div>
  );
}
