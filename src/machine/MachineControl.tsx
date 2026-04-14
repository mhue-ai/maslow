import { useState } from 'react';
import { ConnectionPanel } from './panels/ConnectionPanel';
import { MonitorPanel } from './panels/MonitorPanel';
import { JogPanel } from './panels/JogPanel';
import { CommandPanel } from './panels/CommandPanel';
import { CalibratePanel } from './panels/CalibratePanel';
import { GcodeRunPanel } from './panels/GcodeRunPanel';
import { TestPanel } from './panels/TestPanel';
import { FirmwarePanel } from './panels/FirmwarePanel';
import { FileManagerPanel } from './panels/FileManagerPanel';
import { MachineSettingsPanel } from './panels/MachineSettingsPanel';
import { useMachineStore } from '../store/machineStore';
import { send } from '../comms/maslowSocket';

type MachineTab = 'monitor' | 'jog' | 'calibrate' | 'gcode' | 'console' | 'settings' | 'files' | 'firmware' | 'test';

const TABS: { id: MachineTab; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'jog', label: 'Jog' },
  { id: 'calibrate', label: 'Calibrate' },
  { id: 'gcode', label: 'G-Code' },
  { id: 'console', label: 'Console' },
  { id: 'settings', label: 'Settings' },
  { id: 'files', label: 'Files' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'test', label: 'Test' },
];

export function MachineControl() {
  const [tab, setTab] = useState<MachineTab>('monitor');
  const connection = useMachineStore((s) => s.connection);

  const handleEstop = () => {
    send('\x18'); // Ctrl-X soft reset
    useMachineStore.getState().clearJob();
  };

  return (
    <div className="machine-control">
      {/* E-STOP — always visible when connected */}
      {connection === 'connected' && (
        <button
          onClick={handleEstop}
          style={{
            width: '100%',
            padding: '12px',
            background: '#cc2222',
            border: '2px solid #ff4444',
            borderRadius: 6,
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          EMERGENCY STOP
        </button>
      )}

      <ConnectionPanel />

      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #2a2a4a', paddingBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {tab === 'monitor' && <MonitorPanel />}
        {tab === 'jog' && <JogPanel />}
        {tab === 'calibrate' && <CalibratePanel />}
        {tab === 'gcode' && <GcodeRunPanel />}
        {tab === 'console' && <CommandPanel />}
        {tab === 'settings' && <MachineSettingsPanel />}
        {tab === 'files' && <FileManagerPanel />}
        {tab === 'firmware' && <FirmwarePanel />}
        {tab === 'test' && <TestPanel />}
      </div>
    </div>
  );
}
