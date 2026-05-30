import { useState, useEffect } from 'react';

const ONBOARDING_KEY = 'maslow_onboarding_seen';

interface Step {
  title: string;
  body: string;
  highlight?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Maslow CNC Studio',
    body: 'Design, simulate, and cut — all in one place. This quick tour covers the essentials. You can skip at any time and revisit via the Help menu.',
  },
  {
    title: '1. Design Studio',
    body: 'Import an SVG, set a material size, and click shapes to assign cut depths. The preview shows a wood-color depth gradient so you can see the finished piece before cutting.',
    highlight: 'design',
  },
  {
    title: '2. Generate G-Code',
    body: 'When depths are set, click Generate G-Code. The app creates toolpaths with pocket clearing, island avoidance, and profile cuts. Preview them in 3D or animate with the Paths view.',
    highlight: 'gcode',
  },
  {
    title: '3. Machine Control',
    body: 'Connect to your Maslow via WebSocket. Calibrate on first use (belt retract, extend, attach, tension, find anchors). Upload G-code to the machine and run it from flash storage.',
    highlight: 'machine',
  },
  {
    title: '4. Safety First',
    body: 'Always use Dry Run for new designs — the Z axis stays at safe height so you can verify the toolpath with no risk. Pre-flight checks catch issues before cuts start.',
    highlight: 'dryrun',
  },
  {
    title: 'Ready to Cut',
    body: 'You can reopen this tour anytime from the Help button. Happy making!',
  },
];

export function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) {
        setVisible(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* ignore */ }
    setVisible(false);
    setStep(0);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else dismiss();
  };

  const prev = () => setStep(Math.max(0, step - 1));

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#16162a',
        border: '1px solid #2a2a4a',
        borderRadius: 8,
        padding: 24,
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= step ? '#4488ff' : '#2a2a4a',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
          Step {step + 1} of {STEPS.length}
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#eee', fontWeight: 600 }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 13, color: '#bbb', lineHeight: 1.5, marginBottom: 24 }}>
          {current.body}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={dismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              fontSize: 12,
              cursor: 'pointer',
              padding: '6px 10px',
            }}
          >
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                onClick={prev}
                className="btn btn-sm"
                style={{ padding: '6px 14px' }}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="btn btn-sm btn-primary"
              style={{ padding: '6px 14px' }}
            >
              {step === STEPS.length - 1 ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reopen the onboarding modal from elsewhere (e.g. Help button) */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
    // Trigger reload of OnboardingModal state — simplest: reload
    window.location.reload();
  } catch {
    /* ignore */
  }
}
