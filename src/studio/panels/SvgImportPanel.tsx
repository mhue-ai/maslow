import { useRef, useState } from 'react';
import { parseSvg } from '../../svg/svgParser';
import { svgToShapes } from '../../svg/svgToShapes';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { loadImage, traceImageToSvg, DEFAULT_TRACE } from '../../svg/imageTracer';
import { EXAMPLES } from './examples';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

export function SvgImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // When an image is imported, keep it around so the threshold can be re-traced.
  const [tracedImg, setTracedImg] = useState<HTMLImageElement | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_TRACE.threshold);
  const [invert, setInvert] = useState(false);

  const setPaths = useDesignStore((s) => s.setPaths);
  const setSvgBounds = useDesignStore((s) => s.setSvgBounds);
  const setSvgText = useDesignStore((s) => s.setSvgText);
  const setShapeRegistry = useDesignStore((s) => s.setShapeRegistry);
  const paths = useDesignStore((s) => s.paths);
  const setIntent = useUiStore((s) => s.setIntent);

  /** Run an SVG string through the shared parse → convert → store flow. */
  const applySvgText = (text: string): boolean => {
    const parsed = parseSvg(text);
    if (parsed.hasTextElements) {
      setWarning(
        'Text elements found — these cannot be cut. In your vector editor, convert text to paths ' +
        '(Inkscape: Path → Object to Path). Other shapes imported fine.'
      );
    }
    const converted = svgToShapes(parsed);
    if (converted.length === 0) {
      setWarning('No cuttable shapes found.');
      return false;
    }
    setShapeRegistry(parsed.shapeRegistry); // before setPaths
    setPaths(converted);
    setSvgBounds(parsed.viewBox);
    setSvgText(parsed.normalizedSvgText);
    return true;
  };

  const retrace = (img: HTMLImageElement, t: number, inv: boolean) => {
    try {
      const svg = traceImageToSvg(img, { ...DEFAULT_TRACE, threshold: t, invert: inv });
      applySvgText(svg);
    } catch (err) {
      setWarning(`Couldn't trace image: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleFile = async (file: File) => {
    setWarning(null);
    const lower = file.name.toLowerCase();
    const isSvg = lower.endsWith('.svg');
    const isImage = IMAGE_EXTS.some((e) => lower.endsWith(e)) || file.type.startsWith('image/');

    try {
      if (isSvg) {
        setTracedImg(null);
        const text = await file.text();
        if (applySvgText(text)) setFileName(file.name);
      } else if (isImage) {
        const img = await loadImage(file);
        setTracedImg(img);
        setThreshold(DEFAULT_TRACE.threshold);
        setInvert(false);
        retrace(img, DEFAULT_TRACE.threshold, false);
        setFileName(file.name);
      } else {
        setWarning('Drop an SVG, or a PNG/JPG image to trace.');
      }
    } catch (err) {
      setWarning(`Failed to import: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const clear = () => {
    setPaths([]);
    setSvgBounds(null);
    setSvgText(null);
    setFileName(null);
    setWarning(null);
    setTracedImg(null);
  };

  return (
    <div>
      <h3><span className="step">2</span> Add your design</h3>

      {warning && <div className="warning">{warning}</div>}

      <div className="file-upload" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <label className="file-upload-label" onClick={() => inputRef.current?.click()}>
          {fileName ? `${fileName} (${paths.length} shapes)` : 'Drop an SVG or image, or click to choose'}
        </label>
        <input ref={inputRef} type="file" accept=".svg,image/*" onChange={handleChange} style={{ display: 'none' }} />
      </div>

      {/* Starter projects — only when nothing's loaded, to get going fast. */}
      {paths.length === 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ fontSize: 10, color: '#666', margin: '0 0 4px' }}>or start from an example:</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.name}
                className="btn btn-sm"
                title={ex.blurb}
                style={{ flex: 1, fontSize: 10 }}
                onClick={() => {
                  setWarning(null);
                  setTracedImg(null);
                  if (applySvgText(ex.svg)) {
                    setFileName(`${ex.name} (example)`);
                    setIntent(ex.intent);
                  }
                }}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image tracing controls — only when an image was imported. */}
      {tracedImg && (
        <div style={{ marginTop: 6, padding: 6, background: '#0f0f1e', border: '1px solid #2a2a4a', borderRadius: 4 }}>
          <p style={{ fontSize: 10, color: '#88bbff', margin: '0 0 4px' }}>
            Traced from image — drag to adjust what counts as “ink”.
          </p>
          <label style={{ fontSize: 11, color: '#bbb' }}>
            Threshold: {threshold}
            <input
              type="range" min={10} max={245} step={5} value={threshold}
              onChange={(e) => { const t = Number(e.target.value); setThreshold(t); retrace(tracedImg, t, invert); }}
              style={{ width: '100%' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#bbb', marginTop: 4 }}>
            <input
              type="checkbox" checked={invert}
              onChange={(e) => { setInvert(e.target.checked); retrace(tracedImg, threshold, e.target.checked); }}
            />
            Invert (trace the light areas)
          </label>
        </div>
      )}

      {paths.length > 0 && (
        <button className="btn btn-sm" onClick={clear} style={{ marginTop: 6 }}>
          Clear design
        </button>
      )}
    </div>
  );
}
