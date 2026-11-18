import { DragEvent, FormEvent, ReactNode, useRef, useState } from "react";
import { inspectPdf, unlockPdf } from "./lib/pdfWorkerClient";
import { formatFileSize, makeUnlockedFileName, saveArrayBuffer } from "./lib/file";

const MAX_FILE_MB = 50;
const SOURCE_URL = "https://github.com/chuyeow/unseal-pdf";

type SelectedFile = {
  file: File;
  encrypted: boolean;
  pageCount: number | null;
};

type Unlocked = {
  fileName: string;
  fileBytes: ArrayBuffer;
  pageCount: number | null;
  encrypted: boolean;
};

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const opRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const canUnlock = !!selectedFile && !busy && (!selectedFile.encrypted || password.trim().length > 0);

  function startOp(): () => boolean {
    const op = ++opRef.current;
    setErrorMessage("");
    setUnlocked(null);
    return () => opRef.current !== op;
  }

  function clear() {
    startOp();
    setBusy(false);
    setSelectedFile(null);
    setPassword("");
  }

  async function handleFile(file: File) {
    const isStale = startOp();
    setSelectedFile(null);
    setBusy(true);

    try {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Unseal only accepts PDF files.");
      }

      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        throw new Error(`This file is larger than the ${MAX_FILE_MB} MB limit.`);
      }

      const result = await inspectPdf(await file.arrayBuffer());

      if (isStale()) {
        return;
      }

      setSelectedFile({ file, ...result });
      setPassword("");
      setShowPassword(false);
    } catch (error) {
      if (!isStale()) {
        setErrorMessage(readableError(error));
      }
    } finally {
      if (!isStale()) {
        setBusy(false);
      }
    }
  }

  async function onUnlock(event: FormEvent) {
    event.preventDefault();

    if (!selectedFile || !canUnlock) {
      return;
    }

    const isStale = startOp();
    setBusy(true);

    try {
      const fileName = makeUnlockedFileName(selectedFile.file.name);
      const result = await unlockPdf(await selectedFile.file.arrayBuffer(), password.trim());

      if (isStale()) {
        return;
      }

      saveArrayBuffer(result.fileBytes, fileName);
      setUnlocked({ fileName, ...result, encrypted: selectedFile.encrypted });
    } catch (error) {
      if (!isStale()) {
        setErrorMessage(readableError(error));
      }
    } finally {
      if (!isStale()) {
        setBusy(false);
      }
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  return (
    <div className="page">
      <header className="column topbar">
        <span className="wordmark">Unseal</span>
        <span className="small">Works offline. Nothing is uploaded.</span>
      </header>

      <main
        className="column main"
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          id="file-input"
          className="sr-only"
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void handleFile(file);
            }
          }}
        />

        {unlocked ? (
          <>
            <div className="intro">
              <h1>{unlocked.encrypted ? "Unlocked." : "Saved."}</h1>
              <p>
                {unlocked.encrypted
                  ? "Your browser saved a new copy without the password. The original file is unchanged."
                  : "This PDF had no password, so your browser saved a fresh copy. The original file is unchanged."}
              </p>
            </div>

            <section className="card">
              <div className="file">
                <div className="icon-tile icon-tile--done">
                  <CheckIcon />
                </div>
                <div className="file__text">
                  <div className="file__name">{unlocked.fileName}</div>
                  <div className="file__meta">
                    {unlocked.pageCount !== null ? `${pluralize(unlocked.pageCount, "page")} · ` : ""}
                    Saved by your browser
                  </div>
                </div>
              </div>

              <div className="actions">
                <button type="button" className="button button--primary" onClick={clear}>
                  Unlock another PDF
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => saveArrayBuffer(unlocked.fileBytes, unlocked.fileName)}
                >
                  Download again
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="intro">
              <h1>Unlock a PDF.</h1>
              <p>
                Remove the password from a PDF. The file never leaves this device, and the original
                stays untouched.
              </p>
            </div>

            {selectedFile ? (
              <form className="card" onSubmit={(event) => void onUnlock(event)}>
                <div className="file">
                  <div className="icon-tile">{selectedFile.encrypted ? <LockIcon /> : <FileIcon />}</div>
                  <div className="file__text">
                    <div className="file__name">{selectedFile.file.name}</div>
                    <div className="file__meta">
                      {formatFileSize(selectedFile.file.size)}
                      {selectedFile.pageCount !== null ? ` · ${pluralize(selectedFile.pageCount, "page")}` : ""}
                      {selectedFile.encrypted ? " · Locked" : " · Not locked"}
                    </div>
                  </div>
                  <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>
                    Change
                  </button>
                </div>

                {selectedFile.encrypted ? (
                  <div className="field">
                    <label htmlFor="password">Password</label>
                    <div className="password">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={busy}
                        autoComplete="off"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((shown) => !shown)}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                ) : null}

                {errorMessage ? (
                  <p className="error" role="alert">
                    {errorMessage}
                  </p>
                ) : null}

                <button type="submit" className="button button--primary" disabled={!canUnlock}>
                  {busy ? "Unlocking..." : selectedFile.encrypted ? "Unlock and download" : "Download a copy"}
                </button>
              </form>
            ) : (
              <>
                <label
                  htmlFor="file-input"
                  className={`dropzone ${isDragging ? "dropzone--dragging" : ""}`}
                  aria-busy={busy}
                >
                  <div className="icon-tile">
                    <UploadIcon />
                  </div>
                  <span className="dropzone__title">{busy ? "Reading PDF..." : "Drop a PDF here"}</span>
                  <span className="dropzone__hint">
                    or <span className="dropzone__link">choose a file</span>
                  </span>
                </label>

                {errorMessage ? (
                  <p className="error" role="alert">
                    {errorMessage}
                  </p>
                ) : null}
              </>
            )}
          </>
        )}

        <p className="small">
          PDFs up to {MAX_FILE_MB} MB. You get a new copy named <span className="mono">…_unlocked.pdf</span>.
        </p>
      </main>

      <footer className="column footer">
        <div className="footer__grid">
          <div className="footer__block">
            <h2>Private by design</h2>
            <p>Decryption runs in your browser. There is no server to send files to. Don't take my word for it.</p>
            <a className="source-link" href={SOURCE_URL} target="_blank" rel="noreferrer">
              <GitHubIcon />
              Read the source on GitHub
            </a>
          </div>
          <div className="footer__block">
            <h2>Built on qpdf</h2>
            <p>
              The unlocking is done by{" "}
              <a href="https://github.com/qpdf/qpdf" target="_blank" rel="noreferrer">
                qpdf
              </a>
              , compiled to WebAssembly by{" "}
              <a href="https://github.com/neslinesli93/qpdf-wasm" target="_blank" rel="noreferrer">
                qpdf-wasm
              </a>
              .
            </p>
          </div>
        </div>
        <p className="small byline">
          Made by{" "}
          <a href="https://x.com/chuyeow" target="_blank" rel="noreferrer">
            Chu Yeow
          </a>
        </p>
      </footer>
    </div>
  );
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Unseal could not process this file.";
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const LockIcon = () => (
  <Icon>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);

const FileIcon = () => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);

const UploadIcon = () => (
  <Icon size={22}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 17v-6" />
    <path d="M9.5 13.5 12 11l2.5 2.5" />
  </Icon>
);

const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5 10 17.5 19 7" />
  </Icon>
);

const EyeIcon = () => (
  <Icon size={18}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

const EyeOffIcon = () => (
  <Icon size={18}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" />
    <path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
);

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);
