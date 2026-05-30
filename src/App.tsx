import { useState, useEffect } from 'react';
import { FullMode } from './studio/FullMode';
import { OutlineMode } from './outline/OutlineMode';
import { CutMode } from './cut/CutMode';
import { Visualizer } from './visualizer/Visualizer';
import { MachineControl } from './machine/MachineControl';
import { OnboardingModal, resetOnboarding } from './components/OnboardingModal';
import { useDesignStore } from './store/designStore';
import { useMachineStore } from './store/machineStore';
import { send } from './comms/maslowSocket';
import './App.css';

// Three design modes:
//   - 'full'    — Pocket-clearing relief mode (most powerful)
//   - 'outline' — Relief outlines only, fill cleared by hand
//   - 'cut'     — Bit follows the line, no offset
// Plus 'visualizer' and 'machine' for preview / machine control.
type Tab = 'full' | 'outline' | 'cut' | 'visualizer' | 'machine';
const DESIGN_TABS: ReadonlyArray<Tab> = ['full', 'outline', 'cut'];

export default function App() {
  const [tab, setTab] = useState<Tab>('full');
  const connection = useMachineStore((s) => s.connection);
  const gcode = useDesignStore((s) => s.gcode);
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
            className={`tab-btn ${tab === 'full' ? 'active' : ''}`}
            onClick={() => setTab('full')}
            title="Full pocket-clearing relief mode — most powerful"
          >
            Full
          </button>
          <button
            className={`tab-btn ${tab === 'outline' ? 'active' : ''}`}
            onClick={() => setTab('outline')}
            title="Relief outlines only — clear the waste between cuts by hand"
          >
            Outline
          </button>
          <button
            className={`tab-btn ${tab === 'cut' ? 'active' : ''}`}
            onClick={() => setTab('cut')}
            title="Bit follows the line — straight cuts, no kerf compensation"
          >
            Cut
          </button>
          <button
            className={`tab-btn ${tab === 'visualizer' ? 'active' : ''}`}
            onClick={() => setTab('visualizer')}
            title={gcode ? 'Preview generated G-code toolpaths' : 'Generate G-code first'}
          >
            Visualizer{gcode && <span style={{ marginLeft: 5, fontSize: 9, color: '#44cc44' }}>●</span>}
          </button>
          <button
            className={`tab-btn ${tab === 'machine' ? 'active' : ''}`}
            onClick={() => setTab('machine')}
          >
            Machine Control
          </button>
        </nav>

        {/* Floating E-stop in header when connected */}
        {connection === 'connected' && DESIGN_TABS.includes(tab) && (
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

        {/* Help button — opens onboarding again */}
        <button
          onClick={resetOnboarding}
          title="Show welcome tour"
          style={{
            marginLeft: connection === 'connected' && DESIGN_TABS.includes(tab) ? 8 : 'auto',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#1a1a30',
            border: '1px solid #2a2a4a',
            color: '#888',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ?
        </button>
      </header>
      <main className="app-main">
        {tab === 'full' && <FullMode />}
        {tab === 'outline' && <OutlineMode />}
        {tab === 'cut' && <CutMode />}
        {tab === 'visualizer' && <Visualizer />}
        {tab === 'machine' && <MachineControl />}
      </main>
      <OnboardingModal />
    </div>
  );
}
