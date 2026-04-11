import { useRef, useState } from 'react';
import { parseSvg } from '../../svg/svgParser';
import { svgToShapes } from '../../svg/svgToShapes';
import { useDesignStore } from '../../store/designStore';

export function SvgImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const setPaths = useDesignStore((s) => s.setPaths);
  const setSvgBounds = useDesignStore((s) => s.setSvgBounds);
  const setSvgText = useDesignStore((s) => s.setSvgText);
  const paths = useDesignStore((s) => s.paths);

  const handleFile = async (file: File) => {
    setWarning(null);

    if (!file.name.endsWith('.svg')) {
      setWarning('Please upload an SVG file.');
      return;
    }

    const text = await file.text();

    try {
      const parsed = parseSvg(text);

      if (parsed.hasTextElements) {
        setWarning(
          'This SVG contains <text> elements that cannot be processed. ' +
          'Convert text to paths in Inkscape first (Path → Object to Path).'
        );
      }

      const converted = svgToShapes(parsed);

      if (converted.length === 0) {
        setWarning('No paths found in SVG. Make sure it contains vector paths, not just text or images.');
        return;
      }

      setPaths(converted);
      setSvgBounds({ width: parsed.viewBox.width, height: parsed.viewBox.height });
      setSvgText(text);
      setFileName(file.name);
    } catch (err) {
      setWarning(`Failed to parse SVG: ${err instanceof Error ? err.message : String(err)}`);
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

  return (
    <div>
      <h3>SVG Import</h3>

      {warning && <div className="warning">{warning}</div>}

      <div
        className="file-upload"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <label
          className="file-upload-label"
          onClick={() => inputRef.current?.click()}
        >
          {fileName
            ? `${fileName} (${paths.length} paths)`
            : 'Drop SVG or click to upload'}
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".svg"
          onChange={handleChange}
        />
      </div>

      {paths.length > 0 && (
        <button
          className="btn btn-sm"
          onClick={() => {
            setPaths([]);
            setSvgBounds(null);
            setSvgText(null);
            setFileName(null);
            setWarning(null);
          }}
        >
          Clear SVG
        </button>
      )}
    </div>
  );
}
