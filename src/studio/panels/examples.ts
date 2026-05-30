import type { Intent } from '../../store/uiStore';

/**
 * Built-in starter projects. Inline SVG strings (no fetch / no public assets)
 * so they load instantly and can't 404. Each one drops the maker into a
 * complete, cuttable design with a sensible intent pre-selected — the fastest
 * path from "empty app" to "I see how this works".
 */
export interface Example {
  name: string;
  blurb: string;
  intent: Intent;
  svg: string;
}

export const EXAMPLES: Example[] = [
  {
    name: 'Coaster',
    blurb: 'Round coaster with a recessed ring',
    intent: 'cutout',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46"/>
      <circle cx="50" cy="50" r="38"/>
    </svg>`,
  },
  {
    name: 'Hanging sign',
    blurb: 'Plaque with two hang holes + a star to carve',
    intent: 'carve',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">
      <rect x="4" y="4" width="152" height="82" rx="10"/>
      <circle cx="22" cy="16" r="4"/>
      <circle cx="138" cy="16" r="4"/>
      <path d="M80,30 L86,46 L103,46 L89,57 L95,73 L80,62 L65,73 L71,57 L57,46 L74,46 Z"/>
    </svg>`,
  },
  {
    name: 'Shelf bracket',
    blurb: 'L-bracket with mounting holes — cut out',
    intent: 'cutout',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <path d="M10,10 L110,10 L110,40 L40,40 L40,110 L10,110 Z"/>
      <circle cx="25" cy="25" r="5"/>
      <circle cx="95" cy="25" r="5"/>
      <circle cx="25" cy="95" r="5"/>
    </svg>`,
  },
];
