import { DragEvent, useRef, useState } from "react";
import { inspectPdf, unlockPdf } from "./lib/pdfWorkerClient";
import { formatFileSize, makeUnlockedFileName, saveArrayBuffer } from "./lib/file";

const MAX_FILE_MB = 50;

type SelectedFile = {
  file: File;
  encrypted: boolean;
  pageCount: number | null;
};

type SuccessState = {
  fileName: string;
  pageCount: number | null;
  encrypted: boolean;
};

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const opRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const canUnlock = !!selectedFile && !busy && (!selectedFile.encrypted || password.trim().length > 0);

  function startOp(): () => boolean {
    const op = ++opRef.current;
    setErrorMessage("");
    setSuccess(null);
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
        throw new Error(`This file is larger than the ${MAX_FILE_MB} MB limit for v1.`);
      }

      const result = await inspectPdf(await file.arrayBuffer());

      if (isStale()) {
        return;
      }

      setSelectedFile({ file, ...result });
      setPassword("");
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

  async function onUnlockClick() {
    if (!selectedFile) {
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
      setSuccess({ fileName, pageCount: result.pageCount, encrypted: selectedFile.encrypted });
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
    <main className="shell">
      <section className="hero">
        <div className="hero__eyebrow">Local-first PDF unlocker</div>
        <h1>Unseal</h1>
        <p className="hero__copy">
          Remove PDF password protection locally in your browser. Files never leave
          your device, and every export is a fresh unlocked copy.
        </p>
      </section>

      <section
        className={`panel ${isDragging ? "panel--dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
      >
        <div className="panel__header">
          <div>
            <h2>Unlock a PDF</h2>
            <p>Choose a file, enter the password if needed, and download a new copy.</p>
          </div>
          <button className="ghost-button" onClick={() => inputRef.current?.click()}>
            Choose file
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
            }}
          />
        </div>

        <button className="dropzone" onClick={() => inputRef.current?.click()}>
          <span className="dropzone__title">Drag and drop a PDF here</span>
          <span className="dropzone__subtitle">
            or browse from Files / Explorer
          </span>
        </button>

        {selectedFile ? (
          <div className="file-card">
            <div>
              <div className="file-card__name">{selectedFile.file.name}</div>
              <div className="file-card__meta">
                {formatFileSize(selectedFile.file.size)}
                {selectedFile.pageCount !== null ? ` · ${selectedFile.pageCount} pages` : ""}
                {selectedFile.encrypted ? " · password required" : " · already unlocked"}
              </div>
            </div>
            <button className="ghost-button" onClick={clear}>
              Clear
            </button>
          </div>
        ) : null}

        <label className="password-block">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={
              selectedFile?.encrypted
                ? "Enter the PDF password"
                : "No password needed for unlocked PDFs"
            }
            disabled={!selectedFile?.encrypted || busy}
          />
        </label>

        <div className="actions">
          <button className="primary-button" onClick={() => void onUnlockClick()} disabled={!canUnlock}>
            {busy
              ? selectedFile
                ? "Unlocking PDF..."
                : "Inspecting PDF..."
              : selectedFile?.encrypted
                ? "Remove password protection"
                : "Download unlocked copy"}
          </button>
          <p className="actions__hint">
            v1 limit: {MAX_FILE_MB} MB per file. The original file is never overwritten.
          </p>
        </div>

        {errorMessage ? <div className="status status--error">{errorMessage}</div> : null}
        {success ? (
          <div className="status status--success">
            Saved <strong>{success.fileName}</strong>
            {success.pageCount !== null ? ` with ${success.pageCount} pages.` : "."}
            {success.encrypted ? " Password protection was removed." : " The file was already unlocked."}
          </div>
        ) : null}
      </section>

      <section className="compliance">
        <div className="compliance__block">
          <h3>Privacy</h3>
          <p>
            Unseal processes PDFs entirely in your browser with qpdf running in a
            WebAssembly worker. No file upload is required.
          </p>
        </div>
        <div className="compliance__block">
          <h3>Engine</h3>
          <p>
            Unseal uses qpdf for PDF decryption and rewriting through a browser-ready
            WASM wrapper.
          </p>
          <p className="compliance__links">
            <a href="https://github.com/qpdf/qpdf" target="_blank" rel="noreferrer">
              qpdf source
            </a>
            <a href="https://github.com/neslinesli93/qpdf-wasm" target="_blank" rel="noreferrer">
              WASM wrapper
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Unseal could not process this file.";
}
