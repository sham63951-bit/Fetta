import React, { useEffect, useRef, useState } from 'react';

const agents = [
  { name: 'Architecture', className: 'agent-architecture', accent: 'blue' },
  { name: 'Security', className: 'agent-security', accent: 'gold' },
  { name: 'Database', className: 'agent-database', accent: 'teal' },
  { name: 'Frontend', className: 'agent-frontend', accent: 'violet' },
];

type MercuryStatus = {
  ingestionId: string;
  phase: 'UPLOADING' | 'VALIDATING' | 'EXTRACTING' | 'DISCOVERING' | 'INDEXING' | 'READY' | 'FAILED';
  archiveBytes: number;
  filesDiscovered: number;
  filesIndexed: number;
  filesIgnored: number;
  expandedBytes: number;
  elapsedMs: number;
  throughputFilesPerSecond: number;
  error?: string;
};

export function App() {
  const [selectedArchive, setSelectedArchive] = useState<string | null>(null);
  const [mercuryStatus, setMercuryStatus] = useState<MercuryStatus | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleArchiveSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedArchive(file.name);
    setUploadError(null);
    setMercuryStatus(null);

    try {
      const response = await fetch('/api/mercury/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/zip',
          'X-Fetta-Archive-Name': file.name,
        },
        body: file,
      });
      const payload = await response.json() as { ingestionId?: string; error?: string };
      if (!response.ok || !payload.ingestionId) {
        throw new Error(payload.error || 'Mercury could not accept this archive.');
      }
      setMercuryStatus({
        ingestionId: payload.ingestionId,
        phase: 'VALIDATING',
        archiveBytes: file.size,
        filesDiscovered: 0,
        filesIndexed: 0,
        filesIgnored: 0,
        expandedBytes: 0,
        elapsedMs: 0,
        throughputFilesPerSecond: 0,
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Mercury could not accept this archive.');
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    if (!mercuryStatus?.ingestionId || ['READY', 'FAILED'].includes(mercuryStatus.phase)) return;
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/mercury/ingest/${mercuryStatus.ingestionId}`);
        if (response.ok) setMercuryStatus(await response.json() as MercuryStatus);
      } catch {
        // A transient polling failure should not interrupt Mercury's server-side work.
      }
    }, 900);
    return () => window.clearInterval(poll);
  }, [mercuryStatus?.ingestionId, mercuryStatus?.phase]);

  const phaseLabel = mercuryStatus?.phase === 'READY'
    ? 'Repository ready'
    : mercuryStatus?.phase
      ? `Mercury ${mercuryStatus.phase.toLowerCase()}`
      : 'Intelligence system ready';

  return (
    <main className="fetta-shell">
      <div
        className="cosmos-backdrop"
        style={{ backgroundImage: 'url(/solar-system.jpg)' }}
        aria-hidden="true"
      />
      <div className="cosmos-vignette" aria-hidden="true" />
      <div className="cosmos-noise" aria-hidden="true" />

      <section className="landing-layout">
        <aside className="welcome-panel">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="brand-name">FETTA</span>
          </div>

          <div className="welcome-copy">
            <p className="eyebrow">Engineering intelligence</p>
            <h1>
              Enter your
              <br />
              <em>codebase.</em>
            </h1>
            <p className="intro">
              A living map of your system, assembled by a constellation of
              specialist agents.
            </p>
          </div>

          <div className="entry-control">
            <button
              className="codebase-button"
              type="button"
              onClick={handleArchiveSelect}
              aria-label={selectedArchive ? `Change codebase archive: ${selectedArchive}` : 'Choose a codebase ZIP archive'}
            >
              <span className="button-glint" aria-hidden="true" />
              <span className="button-copy">
                <span className="button-kicker">
                  {mercuryStatus?.phase === 'READY' ? 'Mercury complete' : selectedArchive ? 'Archive received' : 'Begin here'}
                </span>
                <span className="button-label">
                  {selectedArchive ? selectedArchive : 'Choose repository ZIP'}
                </span>
              </span>
              <span className="button-arrow" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h11M10.5 4.5 16 10l-5.5 5.5" />
                </svg>
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={handleFileChange}
              aria-label="Choose a repository ZIP archive"
              className="sr-only"
            />
            <p className="control-hint">
              {uploadError || (selectedArchive
                ? `${phaseLabel} · ${mercuryStatus?.filesIndexed ?? 0} files indexed`
                : 'Select a repository ZIP to wake Mercury')}
            </p>
          </div>

          <div className="system-status">
            <span className="status-orb" aria-hidden="true" />
            <span>{phaseLabel}</span>
          </div>

          <div className="panel-footer">
            <span>v0.1 / local-first</span>
            <span className="footer-rule" aria-hidden="true" />
            <span>07 specialist agents</span>
          </div>
        </aside>

        <div className="universe-stage" aria-label="Fetta agent constellation">
          <div className="stage-caption">
            <span className="live-dot" />
            <span>Project brain</span>
            <span className="caption-divider" />
            <span>{mercuryStatus?.phase === 'READY' ? 'Listening' : 'Dormant'}</span>
          </div>

          <div className="orbit-map" aria-hidden="true">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit orbit-three" />
            <span className="orbit-node node-one" />
            <span className="orbit-node node-two" />
            <span className="orbit-node node-three" />
          </div>

          <div className="agent-legend">
            {agents.map((agent) => (
              <span className={`agent-label ${agent.className}`} key={agent.name}>
                <span className={`agent-pip ${agent.accent}`} />
                {agent.name}
              </span>
            ))}
          </div>

          <div className="stage-note">
            <span className="stage-note-line" />
            <span>One system. Every perspective.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;