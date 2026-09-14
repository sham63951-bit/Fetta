import React, { useState, useRef } from 'react';

export function App() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const folderName = e.target.files[0].webkitRelativePath.split('/')[0] || 'Selected Repo';
      setSelectedFolder(folderName);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundImage: 'linear-gradient(145deg, oklch(0.11 0.014 255) 0%, oklch(0.08 0.012 220) 100%)' }}>
      {/* Radial gradient glows */}
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-50 blur-3xl pointer-events-none" style={{ background: 'radial-gradient(ellipse, oklch(0.31 0.08 200 / 0.44), transparent)' }} />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 rounded-full opacity-50 blur-3xl pointer-events-none" style={{ background: 'radial-gradient(ellipse, oklch(0.49 0.09 39 / 0.34), transparent)' }} />
      
      {/* Grain overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-24" style={{
        backgroundImage: 'radial-gradient(1px 1px at 4px 4px, rgba(255,255,255,0.18), transparent)',
        backgroundSize: '4px 4px'
      }} />

      {/* Ambient light bars */}
      <div className="absolute top-20 left-1/3 w-96 h-40 rounded-full opacity-25 blur-2xl pointer-events-none" style={{
        background: 'linear-gradient(90deg, oklch(0.9 0.035 197), transparent)',
        transform: 'rotate(-14deg)'
      }} />
      <div className="absolute bottom-1/4 right-0 w-96 h-40 rounded-full opacity-25 blur-2xl pointer-events-none" style={{
        background: 'linear-gradient(90deg, oklch(0.49 0.09 39), transparent)',
        transform: 'rotate(-12deg)'
      }} />

      {/* Floating sparkle (hidden on mobile) */}
      <div className="hidden lg:block absolute bottom-20 right-12 text-2xl opacity-58 animate-float" style={{
        animation: 'float 6s ease-in-out infinite'
      }}>
        ✨
      </div>

      {/* Product shell card */}
      <div className="absolute inset-0 flex items-center justify-center p-4" style={{ perspective: '1800px' }}>
        <div className="relative w-full max-w-6xl rounded-3xl overflow-hidden" style={{
          background: 'oklch(0.11 0.012 230)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 38px 90px rgba(0, 0, 0, 0.75), 0 0 40px rgba(0, 200, 220, 0.15)',
          transform: 'rotateX(0.8deg) rotateY(-1.2deg)',
          minHeight: '45rem',
          display: 'grid',
          gridTemplateColumns: '0.86fr 1.14fr'
        }}>
          {/* Left panel: artwork */}
          <div className="relative overflow-hidden">
            <img
              src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwwDAwUEBAMEBwUEBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAA+AH4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWm5ybnJ2eoqOkpaanqKmqsrO0tba2uLm6wsPExcbHyMnK0tPU1dbW2Nna4uPk5ebn6Onq8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba2uLm6wsPExcbHyMnK0tPU1dbW2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/KKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q=="
              alt="Iridescent liquid glass and brushed metal ribbons"
              className="w-full h-full object-cover"
              style={{
                objectPosition: '49% center',
                filter: 'saturate(1.12) contrast(1.16) brightness(0.98)'
              }}
            />
          </div>

          {/* Right panel: content */}
          <div className="relative p-20 flex flex-col justify-center" style={{
            background: 'linear-gradient(130deg, oklch(0.15 0.012 230) 0%, oklch(0.1 0.01 220) 100%)'
          }}>
            {/* Grain overlay on right panel */}
            <div className="absolute inset-0 pointer-events-none opacity-20" style={{
              backgroundImage: 'radial-gradient(1px 1px at 4px 4px, rgba(255,255,255,0.18), transparent)',
              backgroundSize: '4px 4px'
            }} />

            <div className="relative z-10">
              {/* Brand wordmark */}
              <div className="text-xl font-semibold tracking-widest mb-6" style={{ color: 'oklch(0.965 0.008 83)', letterSpacing: '0.32em' }}>
                FETTA
              </div>

              {/* Headline */}
              <h1 className="font-serif text-5xl font-normal leading-tight mb-8" style={{
                fontSize: 'clamp(3.1rem, 8vw, 5.1rem)',
                lineHeight: 0.91,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                color: 'oklch(0.965 0.008 83)'
              }}>
                Scale Your<br />
                <span style={{ fontStyle: 'italic' }}>Engineering</span><br />
                Intelligence.
              </h1>

              {/* Intro paragraph */}
              <p className="mb-12 max-w-md" style={{
                fontSize: '1rem',
                color: 'oklch(0.72 0.018 74)',
                fontFamily: '"DM Sans", sans-serif'
              }}>
                Connect your repositories and deploy AI agents for deep code analysis, optimizations, and better development workflows.
              </p>

              {/* Glass button stack */}
              <div className="relative mb-12 max-w-xs">
                {/* Back glass plate */}
                <div className="absolute inset-0 rounded-2xl" style={{
                  background: 'linear-gradient(135deg, oklch(0.49 0.09 39) 0%, oklch(0.55 0.06 220) 100%)',
                  filter: 'blur(24px)',
                  transform: 'translate(-0.1rem, -0.5rem) scaleZ(0.2rem)',
                  opacity: 0.8,
                  boxShadow: '0 18px 38px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 200, 220, 0.2)'
                }} />

                {/* Middle glass plate */}
                <div className="absolute inset-0 rounded-2xl" style={{
                  background: 'linear-gradient(115deg, oklch(0.49 0.09 39) 0%, oklch(0.55 0.06 220) 100%)',
                  inset: '0.55rem',
                  filter: 'blur(16px)',
                  opacity: 0.6,
                  boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.2), inset 0 -2px 4px rgba(20, 30, 60, 0.4)'
                }} />

                {/* Button */}
                <button
                  onClick={handleFolderSelect}
                  className="relative w-full px-6 py-8 rounded-2xl font-medium flex items-center justify-center gap-3 group transition-all duration-300"
                  style={{
                    minHeight: '5.4rem',
                    background: `linear-gradient(135deg, 
                      rgba(255, 255, 255, 0.12) 0%,
                      rgba(0, 200, 220, 0.08) 25%,
                      rgba(255, 150, 80, 0.06) 50%,
                      rgba(0, 200, 220, 0.08) 75%,
                      rgba(255, 255, 255, 0.12) 100%)`,
                    border: '1.5px solid rgba(255, 255, 255, 0.35)',
                    color: 'oklch(0.15 0.012 230)',
                    textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
                    boxShadow: `
                      inset 0 1px 1px rgba(255, 255, 255, 0.35),
                      inset 0 -1px 2px rgba(0, 0, 0, 0.2),
                      inset 1px 0 1px rgba(255, 150, 80, 0.15),
                      inset -1px 0 1px rgba(0, 150, 200, 0.1),
                      0 8px 32px rgba(0, 0, 0, 0.3),
                      0 0 40px rgba(0, 200, 220, 0.2),
                      0 0 60px rgba(255, 150, 80, 0.1)
                    `,
                    backdropFilter: 'blur(32px) saturate(180%) contrast(110%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%) contrast(110%)',
                    transform: 'translateY(0)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = `
                      inset 0 1px 1px rgba(255, 255, 255, 0.45),
                      inset 0 -1px 2px rgba(0, 0, 0, 0.3),
                      inset 1px 0 1px rgba(255, 150, 80, 0.25),
                      inset -1px 0 1px rgba(0, 150, 200, 0.15),
                      0 12px 48px rgba(0, 0, 0, 0.4),
                      0 0 50px rgba(0, 200, 220, 0.35),
                      0 0 80px rgba(255, 150, 80, 0.15)
                    `;
                    e.currentTarget.style.border = '1.5px solid rgba(255, 255, 255, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `
                      inset 0 1px 1px rgba(255, 255, 255, 0.35),
                      inset 0 -1px 2px rgba(0, 0, 0, 0.2),
                      inset 1px 0 1px rgba(255, 150, 80, 0.15),
                      inset -1px 0 1px rgba(0, 150, 200, 0.1),
                      0 8px 32px rgba(0, 0, 0, 0.3),
                      0 0 40px rgba(0, 200, 220, 0.2),
                      0 0 60px rgba(255, 150, 80, 0.1)
                    `;
                    e.currentTarget.style.border = '1.5px solid rgba(255, 255, 255, 0.35)';
                  }}
                >
                  {/* Shine sweep */}
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 pointer-events-none" style={{
                    background: 'linear-gradient(105deg, rgba(255, 255, 255, 0.4), rgba(0, 200, 220, 0.2), transparent)',
                    transform: 'translateX(-75%)',
                    transition: 'transform 600ms ease-in-out'
                  }} />

                  <span style={{ fontFamily: '"DM Sans", sans-serif', position: 'relative', zIndex: 2 }}>
                    {selectedFolder ? `Change Folder (${selectedFolder})` : 'Select Codebase Folder'}
                  </span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" style={{ position: 'relative', zIndex: 2 }}>
                    <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm3 2h10v4H5V8z" />
                  </svg>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  aria-label="Select codebase folder"
                />
              </div>

              {/* Status pill */}
              <div className="inline-flex items-center gap-2 text-xs mb-8" style={{
                background: 'rgba(255, 150, 80, 0.1)',
                color: 'oklch(0.72 0.018 74)',
                padding: '0.4rem 0.8rem',
                borderRadius: '999px'
              }}>
                <div className="relative w-2 h-2">
                  <div className="absolute inset-0 rounded-full" style={{
                    background: 'oklch(0.9 0.035 197)',
                    animation: 'pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                  }} />
                  <div className="absolute inset-0 rounded-full" style={{
                    background: 'oklch(0.9 0.035 197)',
                    opacity: 0.75,
                    animation: 'pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    animationDelay: '0.3s'
                  }} />
                </div>
                <span>Fetta Agents: Active (Ready to deploy)</span>
              </div>

              {/* Testimonial */}
              <blockquote>
                <p className="font-serif text-xl mb-2" style={{
                  color: 'oklch(0.965 0.008 83)',
                  fontSize: '1.28rem'
                }}>
                  "Fetta transformed our engineering team's code review process. The results are undeniable."
                </p>
                <cite className="text-xs not-italic" style={{
                  color: 'oklch(0.49 0.09 39)',
                  fontFamily: '"DM Sans", sans-serif'
                }}>
                  — Sarah @ TechCorp
                </cite>
              </blockquote>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap');

        * {
          font-family: 'DM Sans', sans-serif;
        }

        .font-serif {
          font-family: 'Instrument Serif', serif;
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes shine {
          0% {
            transform: translateX(-75%);
          }
          100% {
            transform: translateX(85%);
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.5);
            opacity: 0.5;
          }
        }

        @media (max-width: 760px) {
          div[style*="gridTemplateColumns"] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
            transition: none !important;
          }
        }

        button:focus-visible {
          outline: 2px solid oklch(0.9 0.035 197);
          outline-offset: 4px;
        }
      `}</style>
    </div>
  );
}

export default App;
