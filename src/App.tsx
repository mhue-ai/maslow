import { useEffect } from 'react';
import { FullMode } from './studio/FullMode';
import { OutlineMode } from './outline/OutlineMode';
import { CutMode } from './cut/CutMode';
import { Visualizer } from './visualizer/Visualizer';
import { MachineControl } from './machine/MachineControl';
import { OnboardingModal, resetOnboarding } from './components/OnboardingModal';
import { useDesignStore } from './store/designStore';
import { useMachineStore } from './store/machineStore';
import { useUiStore, INTENTS, type Stage } from './store/uiStore';
import { emergencyStop } from './comms/maslowSocket';
import './App.css';

const STAGES: { id: Stage; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'preview', label: 'Preview' },
  { id: 'cut', label: 'Cut' },
];

export default function App() {
  const stage = useUiStore((s) => s.stage);
  const setStage = useUiStore((s) => s.setStage);
  const intent = useUiStore((s) => s.intent);
  const setIntent = useUiStore((s) => s.setIntent);
  const carveOutlineOnly = useUiStore((s) => s.carveOutlineOnly);
  const setCarveOutlineOnly = useUiStore((s) => s.setCarveOutlineOnly);

  const connection = useMachineStore((s) => s.connection);
  const gcode = useDesignStore((s) => s.gcode);
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);
  const nudgeDesign = useDesignStore((s) => s.nudgeDesign);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeDesign(-step, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeDesign(step, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeDesign(0, step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudgeDesign(0, -step); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, nudgeDesign]);

  const handleEstop = () => {
    const sent = emergencyStop();
    useMachineStore.getState().clearJob();
    if (!sent) {
      useMachineStore.getState().addConsoleMessage({
        timestamp: Date.now(),
        text: 'E-STOP could not be sent — not connected. Use the machine’s physical stop NOW.',
        type: 'error',
      });
    }
  };

  const showEstop = connection === 'connected' && (stage === 'design' || stage === 'cut');

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">Maslow CNC Studio</div>

        {/* Stage rail — the guided 1-2-3 flow */}
        <nav className="app-tabs" aria-label="Workflow stages">
          {STAGES.map((s, i) => {
            const active = stage === s.id;
            const previewReady = s.id === 'preview' && gcode;
            return (
              <button
                key={s.id}
                className={`tab-btn ${active ? 'active' : ''}`}
                onClick={() => setStage(s.id)}
                title={
                  s.id === 'design' ? 'Set up material, add your design, choose what to make'
                  : s.id === 'preview' ? (gcode ? 'See exactly what the machine will do' : 'Generate a cut first')
                  : 'Connect and run the cut on your machine'
                }
              >
                <span style={{ opacity: 0.5, marginRight: 6 }}>{i + 1}</span>
                {s.label}
                {previewReady && <span style={{ marginLeft: 5, fontSize: 9, color: '#44cc44' }}>●</span>}
              </button>
            );
          })}
        </nav>

        {showEstop && (
          <button
            onClick={handleEstop}
            style={{
              marginLeft: 'auto', padding: '4px 16px', background: '#cc2222',
              border: '2px solid #ff4444', borderRadius: 4, color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
            }}
          >
            E-STOP
          </button>
        )}

        <button
          onClick={resetOnboarding}
          title="Show welcome tour"
          aria-label="Help and welcome tour"
          style={{
            marginLeft: showEstop ? 8 : 'auto', width: 28, height: 28, borderRadius: '50%',
            background: '#1a1a30', border: '1px solid #2a2a4a', color: '#888',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ?
        </button>
      </header>

      {/* Intent chooser — only on the Design stage. Picks WHAT you're making,
          which selects the design mode underneath. */}
      {stage === 'design' && (
        <div className="intent-bar" role="radiogroup" aria-label="What are you making?">
          <span className="intent-bar-label">What are you making?</span>
          {INTENTS.map((it) => {
            const active = intent === it.id;
            return (
              <button
                key={it.id}
                role="radio"
                aria-checked={active}
                className={`intent-chip ${active ? 'active' : ''}`}
                onClick={() => setIntent(it.id)}
                title={it.blurb}
              >
                <span className="intent-glyph" aria-hidden="true">{it.glyph}</span>
                <span className="intent-text">
                  <strong>{it.label}</strong>
                  <small>{it.blurb}</small>
                </span>
              </button>
            );
          })}

          {/* Carve sub-choice: machine clears the waste, or you clear it by hand
              (outline-only relief). Two genuinely different ways to lower an area. */}
          {intent === 'carve' && (
            <div className="carve-submode" role="radiogroup" aria-label="How to carve">
              <button
                role="radio" aria-checked={!carveOutlineOnly}
                className={`submode-btn ${!carveOutlineOnly ? 'active' : ''}`}
                onClick={() => setCarveOutlineOnly(false)}
                title="The machine hollows out the whole area"
              >
                🛠 Machine clears it
              </button>
              <button
                role="radio" aria-checked={carveOutlineOnly}
                className={`submode-btn ${carveOutlineOnly ? 'active' : ''}`}
                onClick={() => setCarveOutlineOnly(true)}
                title="The machine cuts just the outlines; you clear the waste by hand"
              >
                ✋ Outline only
              </button>
            </div>
          )}
        </div>
      )}

      <main className="app-main">
        {/* Cut Out and Score are the same bit-follows-the-line engine (CutMode),
            differing only by depth — CutMode reads the intent. */}
        {stage === 'design' && (intent === 'cutout' || intent === 'score') && <CutMode />}
        {/* Carve = hollow out areas: machine-cleared (FullMode) or
            outline-only / clear-by-hand (OutlineMode). */}
        {stage === 'design' && intent === 'carve' && (carveOutlineOnly ? <OutlineMode /> : <FullMode />)}
        {stage === 'preview' && <Visualizer />}
        {stage === 'cut' && <MachineControl />}
      </main>
      <OnboardingModal />
    </div>
  );
}
