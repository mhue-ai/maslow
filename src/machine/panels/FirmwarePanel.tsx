import { useState, useRef } from 'react';
import { useMachineStore } from '../../store/machineStore';

type UploadTarget = 'firmware' | 'config' | 'webui';

const GITHUB_REPO = 'https://github.com/MaslowCNC/Maslow_4';
const GITHUB_RELEASES = `${GITHUB_REPO}/releases`;
const LATEST_TAG = 'v1.20';

interface UploadSlot {
  id: UploadTarget;
  label: string;
  description: string;
  accept: string;
  githubFile: string;
}

const UPLOAD_SLOTS: UploadSlot[] = [
  {
    id: 'config',
    label: 'Machine Config',
    description: 'FluidNC .yaml configuration',
    accept: '.yaml,.yml',
    githubFile: 'maslow.yaml',
  },
  {
    id: 'webui',
    label: 'Web UI',
    description: 'index.html.gz web interface',
    accept: '.gz,.html',
    githubFile: 'index.html.gz',
  },
  {
    id: 'firmware',
    label: 'Firmware',
    description: 'FluidNC firmware.bin binary',
    accept: '.bin',
    githubFile: 'firmware.bin',
  },
];

export function FirmwarePanel() {
  const url = useMachineStore((s) => s.url);
  const [uploading, setUploading] = useState<UploadTarget | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Record<UploadTarget, string>>({
    firmware: '',
    config: '',
    webui: '',
  });
  const inputRefs = useRef<Record<UploadTarget, HTMLInputElement | null>>({
    firmware: null,
    config: null,
    webui: null,
  });

  // Derive HTTP base URL from WebSocket URL (for display)
  const getHttpBase = () => {
    try {
      const wsUrl = url.replace(/^ws:\/\//, '').replace(/:\d+$/, '');
      return `http://${wsUrl}`;
    } catch {
      return 'http://maslow.fortmiller';
    }
  };

  // Use Vite proxy to avoid CORS — requests to /maslow/* are forwarded to the Maslow
  const uploadBase = '/maslow';
  const httpBase = getHttpBase();

  const uploadFile = async (target: UploadTarget, file: File) => {
    setUploading(target);
    setProgress(0);
    setStatus((s) => ({ ...s, [target]: 'Uploading...' }));

    try {
      const formData = new FormData();
      formData.append('path', '/');
      formData.append('file', file, file.name);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error — is the machine reachable?'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
        xhr.timeout = 120000;

        xhr.open('POST', `${uploadBase}/upload`);
        xhr.send(formData);
      });

      setProgress(100);
      setStatus((s) => ({ ...s, [target]: `Uploaded ${file.name}` }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setStatus((s) => ({ ...s, [target]: `Error: ${msg}` }));
    } finally {
      setUploading(null);
    }
  };

  const handleFileSelect = (target: UploadTarget, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(target, file);
    e.target.value = '';
  };

  const handleRestart = async () => {
    setStatus((s) => ({ ...s, firmware: 'Restarting...' }));
    try {
      await fetch(`${uploadBase}/command?commandText=%24Restart`);
      setStatus((s) => ({ ...s, firmware: 'Restart sent — machine will reboot' }));
    } catch {
      setStatus((s) => ({ ...s, firmware: 'Error: Could not send restart command' }));
    }
  };

  const getDownloadUrl = (file: string) =>
    `${GITHUB_RELEASES}/download/${LATEST_TAG}/${file}`;

  return (
    <div>
      {/* Machine URL */}
      <div style={{
        background: '#1a1a30',
        borderRadius: 6,
        padding: 10,
        marginBottom: 12,
        border: '1px solid #2a2a4a',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ fontSize: 10, color: '#666', whiteSpace: 'nowrap' }}>Upload target</div>
        <code style={{
          flex: 1,
          fontSize: 12,
          color: '#88bbff',
          background: '#0d0d1a',
          padding: '4px 8px',
          borderRadius: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {httpBase}
        </code>
        <a
          href={httpBase}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: '#4488ff', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Open
        </a>
      </div>

      {/* GitHub source */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        padding: '0 2px',
      }}>
        <div style={{ fontSize: 10, color: '#666' }}>
          Source:{' '}
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4488ff', textDecoration: 'none' }}
          >
            MaslowCNC/Maslow_4
          </a>
        </div>
        <a
          href={GITHUB_RELEASES}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: '#4488ff', textDecoration: 'none' }}
        >
          All releases
        </a>
      </div>

      {/* Upload cards */}
      {UPLOAD_SLOTS.map((slot) => {
        const isUploading = uploading === slot.id;
        const slotStatus = status[slot.id];
        const downloadUrl = getDownloadUrl(slot.githubFile);

        return (
          <div
            key={slot.id}
            style={{
              background: '#1a1a30',
              borderRadius: 6,
              padding: 12,
              marginBottom: 8,
              border: '1px solid #2a2a4a',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{slot.label}</div>
                <div style={{ fontSize: 10, color: '#666' }}>{slot.description}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{ textDecoration: 'none', textAlign: 'center', minWidth: 50, fontSize: 11, color: '#88bbff', background: '#0d0d2a', border: '1px solid #334' }}
                >
                  {LATEST_TAG}
                </a>
                <button
                  className="btn btn-sm"
                  onClick={() => inputRefs.current[slot.id]?.click()}
                  disabled={uploading !== null}
                  style={{ minWidth: 60 }}
                >
                  {isUploading ? `${progress}%` : 'Upload'}
                </button>
              </div>
              <input
                ref={(el) => { inputRefs.current[slot.id] = el; }}
                type="file"
                accept={slot.accept}
                onChange={(e) => handleFileSelect(slot.id, e)}
                style={{ display: 'none' }}
              />
            </div>

            {/* Progress bar */}
            {isUploading && (
              <div style={{
                height: 3,
                background: '#2a2a4a',
                borderRadius: 2,
                overflow: 'hidden',
                marginTop: 6,
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: '#4488ff',
                  borderRadius: 2,
                  transition: 'width 0.2s',
                }} />
              </div>
            )}

            {/* Status message */}
            {slotStatus && !isUploading && (
              <div style={{
                fontSize: 10,
                marginTop: 4,
                color: slotStatus.startsWith('Error') ? '#ff4444' : '#44cc44',
              }}>
                {slotStatus}
              </div>
            )}
          </div>
        );
      })}

      {/* Restart button */}
      <button
        className="btn btn-sm"
        onClick={handleRestart}
        style={{
          width: '100%',
          marginTop: 8,
          background: '#332200',
          border: '1px solid #664400',
          color: '#ffaa44',
        }}
      >
        Restart Controller
      </button>
      <p style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
        Restart after uploading config or firmware to apply changes.
      </p>
    </div>
  );
}
