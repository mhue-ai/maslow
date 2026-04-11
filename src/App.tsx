import { useState } from 'react';
import { DesignStudio } from './studio/DesignStudio';
import { MachineControl } from './machine/MachineControl';
import './App.css';

type Tab = 'design' | 'machine';

export default function App() {
  const [tab, setTab] = useState<Tab>('design');

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
      </header>
      <main className="app-main">
        {tab === 'design' ? <DesignStudio /> : <MachineControl />}
      </main>
    </div>
  );
}
