import { create } from 'zustand';

/**
 * Top-level navigation / guided-flow state, kept separate from the design data
 * store. Three stages — Design → Preview → Cut — and within Design, the
 * maker's intent picks which design mode is shown.
 */
export type Stage = 'design' | 'preview' | 'cut';

/** What the maker is making — maps to a design mode. */
export type Intent = 'cutout' | 'carve' | 'score';

export const INTENTS: { id: Intent; label: string; glyph: string; blurb: string }[] = [
  { id: 'cutout', label: 'Cut Out', glyph: '✂', blurb: 'Cut a shape free from the sheet' },
  { id: 'carve',  label: 'Carve',   glyph: '◳', blurb: 'Lower areas — signs, trays, reliefs' },
  { id: 'score',  label: 'Score',   glyph: '╱', blurb: 'Run the bit along the lines' },
];

interface UiState {
  stage: Stage;
  setStage: (s: Stage) => void;
  intent: Intent;
  setIntent: (i: Intent) => void;
}

export const useUiStore = create<UiState>((set) => ({
  stage: 'design',
  setStage: (stage) => set({ stage }),
  intent: 'cutout', // Cut Out is the most common one-off maker task — lead with it
  setIntent: (intent) => set({ intent }),
}));
