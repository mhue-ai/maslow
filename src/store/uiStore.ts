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
  { id: 'cutout', label: 'Cut Out', glyph: '✂', blurb: 'Cut shapes free from the sheet' },
  { id: 'score',  label: 'Score',   glyph: '╱', blurb: 'Shallow lines along your paths' },
  { id: 'carve',  label: 'Carve',   glyph: '◳', blurb: 'Lower areas — signs, trays, reliefs' },
];

/**
 * Cut Out and Score are the SAME engine (the bit follows your lines) at two
 * depths: Cut Out goes all the way through, Score scratches shallow surface
 * lines. Carve hollows out areas — either machine-cleared (FullMode) or
 * outline-only / clear-by-hand (OutlineMode), chosen by `carveOutlineOnly`.
 */
interface UiState {
  stage: Stage;
  setStage: (s: Stage) => void;
  intent: Intent;
  setIntent: (i: Intent) => void;
  carveOutlineOnly: boolean;
  setCarveOutlineOnly: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  stage: 'design',
  setStage: (stage) => set({ stage }),
  intent: 'cutout', // Cut Out is the most common one-off maker task — lead with it
  setIntent: (intent) => set({ intent }),
  carveOutlineOnly: false,
  setCarveOutlineOnly: (carveOutlineOnly) => set({ carveOutlineOnly }),
}));
