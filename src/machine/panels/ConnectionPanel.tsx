import { useEffect } from 'react';
import { useMachineStore } from '../../store/machineStore';
import { connect, disconnect } from '../../comms/maslowSocket';

const STATUS_COLORS: Record<string, string> = {
  disconnected: '#555',
  connecting: '#f0a030',
  connected: '#44cc44',
  error: '#ff4444',
};

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Error',
};

export function ConnectionPanel() {
  const connection = useMachineStore((s) => s.connection);
  const url = useMachineStore((s) => s.url);
  const setUrl = useMachineStore((s) => s.setUrl);
  const autoconnect = useMachineStore((s) => s.autoconnect);
  const setAutoconnect = useMachineStore((s) => s.setAutoconnect);
  const connectionError = useMachineStore((s) => s.connectionError);
  const retryAttempt = useMachineStore((s) => s.retryAttempt);

  // Auto-connect on mount if user enabled it
  useEffect(() => {
    if (autoconnect && connection === 'disconnected') {
      connect(url);
    }
    // only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    // Enable autoconnect when user manually connects (persists across reloads)
    if (!autoconnect) setAutoconnect(true);
    connect(url);
  };

  const handleDisconnect = () => {
    // Disable autoconnect so it doesn't immediately reconnect
    setAutoconnect(false);
    disconnect();
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          title={STATUS_LABELS[connection]}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: STATUS_COLORS[connection],
            flexShrink: 0,
            boxShadow: connection === 'connected' ? '0 0 6px #44cc44' : 'none',
            animation: connection === 'connecting' ? 'pulse 1s ease-in-out infinite' : 'none',
          }}
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            flex: 1,
            padding: '4px 8px',
            border: `1px solid ${connection === 'error' ? '#664444' : '#333'}`,
            borderRadius: 4,
            background: '#0d0d1a',
            color: '#ddd',
            fontSize: 13,
          }}
          placeholder="ws://maslow.fortmiller:81"
        />
        {connection === 'connected' ? (
          <button className="btn btn-sm" onClick={handleDisconnect}>
            Disconnect
          </button>
        ) : (
          <button
            className="btn btn-sm btn-primary"
            onClick={handleConnect}
            disabled={connection === 'connecting'}
          >
            {connection === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>

      {/* Error detail + retry info */}
      {(connectionError || (connection === 'disconnected' && retryAttempt > 0 && autoconnect)) && (
        <div style={{
          marginTop: 6,
          padding: '4px 8px',
          fontSize: 10,
          color: connection === 'error' ? '#ff8888' : '#aaa',
          background: connection === 'error' ? 'rgba(255,68,68,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${connection === 'error' ? 'rgba(255,68,68,0.2)' : 'rgba(255,255,255,0.05)'}`,
          borderRadius: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {connectionError ?? `Retrying... (attempt ${retryAttempt + 1})`}
          </span>
          {connection !== 'connected' && (
            <button
              onClick={handleConnect}
              style={{
                background: 'none',
                border: '1px solid #444',
                color: '#aaa',
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 2,
                cursor: 'pointer',
              }}
            >
              Retry now
            </button>
          )}
        </div>
      )}

      {/* Autoconnect toggle */}
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
        fontSize: 10,
        color: '#666',
        cursor: 'pointer',
        userSelect: 'none',
      }}>
        <input
          type="checkbox"
          checked={autoconnect}
          onChange={(e) => setAutoconnect(e.target.checked)}
          style={{ margin: 0, cursor: 'pointer' }}
        />
        Reconnect automatically on page load
      </label>
    </div>
  );
}
