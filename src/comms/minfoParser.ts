import type { MInfo } from '../types/machine';

/**
 * Parse MINFO JSON response from the Maslow firmware.
 */
export function parseMInfo(text: string): MInfo | null {
  try {
    // MINFO might be embedded in MSG:INFO wrapper or raw JSON
    // Extract JSON object from message — handles nested braces
    let jsonStr = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const obj = JSON.parse(jsonStr);
    return {
      homed: Boolean(obj.homed),
      calibrationInProgress: Boolean(obj.calibrationInProgress),
      extended: Boolean(obj.extended),
      tl: Number(obj.tl) || 0,
      tr: Number(obj.tr) || 0,
      bl: Number(obj.bl) || 0,
      br: Number(obj.br) || 0,
      etl: Number(obj.etl) || 0,
      etr: Number(obj.etr) || 0,
      ebl: Number(obj.ebl) || 0,
      ebr: Number(obj.ebr) || 0,
    };
  } catch {
    return null;
  }
}
