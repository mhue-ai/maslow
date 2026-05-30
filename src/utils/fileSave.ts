/**
 * Save a file using the File System Access API (pick directory),
 * with fallback to classic download for unsupported browsers.
 */

interface SaveOptions {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

/**
 * Save content to a user-chosen location.
 * Uses showSaveFilePicker when available (Chrome/Edge), falls back to download.
 */
export async function saveFile(content: string | Blob, options: SaveOptions): Promise<string | null> {
  const blob = content instanceof Blob ? content : new Blob([content], { type: 'text/plain' });

  // Try File System Access API (Chrome 86+, Edge 86+)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: options.suggestedName,
        types: options.types ?? [
          { description: 'All Files', accept: { '*/*': [] } },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();

      // showSaveFilePicker remembers the directory internally between calls,
      // so we don't need to track a directory handle ourselves.
      return handle.name;
    } catch (err: unknown) {
      // User cancelled the dialog
      if (err instanceof Error && err.name === 'AbortError') return null;
      // API failed — fall through to download
    }
  }

  // Fallback: classic download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return options.suggestedName;
}

/** Save a project file (.maslow.json) */
export async function saveProjectFile(json: string, name: string): Promise<string | null> {
  return saveFile(json, {
    suggestedName: `${name}.maslow.json`,
    types: [
      { description: 'Maslow Project', accept: { 'application/json': ['.maslow.json', '.json'] } },
    ],
  });
}

/** Save G-code (.nc) */
export async function saveGcodeFile(gcode: string, name: string): Promise<string | null> {
  return saveFile(gcode, {
    suggestedName: name,
    types: [
      { description: 'G-Code File', accept: { 'text/plain': ['.nc', '.gcode', '.ngc'] } },
    ],
  });
}
