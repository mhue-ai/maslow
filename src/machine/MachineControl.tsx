import { useState } from 'react';
import { ConnectionPanel } from './panels/ConnectionPanel';
import { MonitorPanel } from './panels/MonitorPanel';
import { JogPanel } from './panels/JogPanel';
import { CommandPanel } from './panels/CommandPanel';
import { CalibratePanel } from './panels/CalibratePanel';
import { GcodeRunPanel } from './panels/GcodeRunPanel';
import { TestPanel } from './panels/TestPanel';

type MachineTab = 'monitor' | 'jog' | 'calibrate' | 'gcode' | 'console' | 'test';

const TABS: { id: MachineTab; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'jog', label: 'Jog' },
  { id: 'calibrate', label: 'Calibrate' },
  { id: 'gcode', label: 'G-Code' },
  { id: 'console', label: 'Console' },
  { id: 'test', label: 'Test' },
];

export function MachineControl() {
  const [tab, setTab] = useState<MachineTab>('monitor');

  return (
    <div className="machine-control">
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
        {tab === 'test' && <TestPanel />}
      </div>
    </div>
  );
}
