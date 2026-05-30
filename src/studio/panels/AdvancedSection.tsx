import { useState, type ReactNode } from 'react';

/**
 * Collapsible "Advanced" disclosure. Wraps the raw numeric machine knobs
 * (feed/plunge/RPM/stepover/etc.) so a beginner never has to look at them, but
 * an experienced user can open them and override. Collapsed by default.
 */
export function AdvancedSection({
  title = 'Advanced settings',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #2a2a4a', paddingTop: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          color: '#888',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          padding: '2px 0',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-block', width: 10, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}>
          ▸
        </span>
        {title}
      </button>
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}
