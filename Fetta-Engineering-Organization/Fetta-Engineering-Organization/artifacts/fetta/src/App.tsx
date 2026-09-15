import React, { useRef, useState } from 'react';

const agents = [
  { name: 'Architecture', className: 'agent-architecture', accent: 'blue' },
  { name: 'Security', className: 'agent-security', accent: 'gold' },
  { name: 'Database', className: 'agent-database', accent: 'teal' },
  { name: 'Frontend', className: 'agent-frontend', accent: 'violet' },
];

export function App() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const folderName = file.webkitRelativePath.split('/')[0] || 'Selected repository';
    setSelectedFolder(folderName);
  };

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
              onClick={handleFolderSelect}
              aria-label={selectedFolder ? `Change codebase: ${selectedFolder}` : 'Choose a codebase folder'}
            >
              <span className="button-glint" aria-hidden="true" />
              <span className="button-copy">
                <span className="button-kicker">
                  {selectedFolder ? 'Codebase connected' : 'Begin here'}
                </span>
                <span className="button-label">
                  {selectedFolder ? selectedFolder : 'Choose codebase'}
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
              // @ts-expect-error webkitdirectory is supported by Chromium-based browsers.
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFileChange}
              aria-label="Choose a codebase folder"
              className="sr-only"
            />
            <p className="control-hint">
              {selectedFolder
                ? 'Choose another folder to switch projects'
                : 'Select a local repository to wake the organization'}
            </p>
          </div>

          <div className="system-status">
            <span className="status-orb" aria-hidden="true" />
            <span>{selectedFolder ? 'Repository ready to map' : 'Intelligence system ready'}</span>
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
            <span>{selectedFolder ? 'Listening' : 'Dormant'}</span>
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