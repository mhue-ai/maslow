import { useState, useEffect } from 'react';
import { DesignStudio } from './studio/DesignStudio';
import { MachineControl } from './machine/MachineControl';
import { useDesignStore } from './store/designStore';
import { useMachineStore } from './store/machineStore';
import { send } from './comms/maslowSocket';
import './App.css';

type Tab = 'design' | 'machine';

export default function App() {
  const [tab, setTab] = useState<Tab>('design');
  const connection = useMachineStore((s) => s.connection);
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);
  const nudgeDesign = useDesignStore((s) => s.nudgeDesign);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Undo/redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }

      // Arrow keys to nudge design position (skip if typing in an input)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const step = e.shiftKey ? 10 : 1; // Shift = 10mm, normal = 1mm
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeDesign(-step, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeDesign(step, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeDesign(0, step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudgeDesign(0, -step); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, nudgeDesign]);

  const handleEstop = () => {
    send('\x18');
    useMachineStore.getState().clearJob();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">Maslow CNC Studio</div>
        <nav className="app-tabs">
          <button
            className={`tab-btn ${tab === 'design' ? 'active' : ''}`}
            onClick={() => setTab('design')}
          >
            Design Studio
          </button>
          <button
            className={`tab-btn ${tab === 'machine' ? 'active' : ''}`}
            onClick={() => setTab('machine')}
          >
            Machine Control
          </button>
        </nav>

        {/* Floating E-stop in header when connected */}
        {connection === 'connected' && tab === 'design' && (
          <button
            onClick={handleEstop}
            style={{
              marginLeft: 'auto',
              padding: '4px 16px',
              background: '#cc2222',
              border: '2px solid #ff4444',
              borderRadius: 4,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            E-STOP
          </button>
        )}
      </header>
      <main className="app-main">
        {tab === 'design' ? <DesignStudio /> : <MachineControl />}
      </main>
    </div>
  );
}
