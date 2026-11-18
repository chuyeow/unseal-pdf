import createQpdfModule, { type QpdfInstance } from "@neslinesli93/qpdf-wasm";
import qpdfWasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";
import type { InspectResult, UnlockResult, WorkerRequest, WorkerResponse } from "../types";

const workerScope = self as DedicatedWorkerGlobalScope;
const INPUT = "/in.pdf";
const OUTPUT = "/out.pdf";
let stdoutSink: string[] | null = null;
let stderrSink: string[] | null = null;

type QpdfFs = QpdfInstance["FS"] & {
  writeFile(path: string, data: Uint8Array): void;
  unlink(path: string): void;
};

// qpdf-wasm binds console.log/error when created and ignores Emscripten's print/printErr,
// so the patch must run before createQpdfModule.
function capture(original: (...messages: unknown[]) => void, sink: () => string[] | null) {
  return (...messages: unknown[]) => {
    const lines = sink();
    if (lines) {
      lines.push(messages.map(String).join(" "));
    } else {
      original(...messages);
    }
  };
}

console.log = capture(console.log.bind(console), () => stdoutSink);
console.error = capture(console.error.bind(console), () => stderrSink);

const qpdfReady = createQpdfModule({ locateFile: () => qpdfWasmUrl });

function runQpdf(qpdf: QpdfInstance, args: string[]) {
  stdoutSink = [];
  stderrSink = [];

  try {
    const code = qpdf.callMain(args);
    return { code, stdout: stdoutSink.join("\n").trim(), stderr: stderrSink.join("\n").trim() };
  } finally {
    stdoutSink = null;
    stderrSink = null;
  }
}

function getPageCount(qpdf: QpdfInstance, path: string) {
  const result = runQpdf(qpdf, ["--show-npages", path]);

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Could not read the PDF page count.");
  }

  return Number(result.stdout) || null;
}

// Each call runs synchronously after the await, so requests never share INPUT/OUTPUT.
async function withInput<T>(fileBytes: ArrayBuffer, work: (qpdf: QpdfInstance, fs: QpdfFs) => T): Promise<T> {
  const qpdf = await qpdfReady;
  const fs = qpdf.FS as QpdfFs;

  fs.writeFile(INPUT, new Uint8Array(fileBytes));

  try {
    return work(qpdf, fs);
  } finally {
    for (const path of [INPUT, OUTPUT]) {
      try {
        fs.unlink(path);
      } catch {
        // OUTPUT only exists after a successful unlock.
      }
    }
  }
}

function inspect(fileBytes: ArrayBuffer): Promise<InspectResult> {
  return withInput(fileBytes, qpdf => {
    const result = runQpdf(qpdf, ["--show-encryption", INPUT]);

    if (result.code === 0 && /file is not encrypted/i.test(result.stdout)) {
      return { encrypted: false, pageCount: getPageCount(qpdf, INPUT) };
    }

    if (result.code !== 0 && /invalid password/i.test(result.stderr)) {
      return { encrypted: true, pageCount: null };
    }

    throw new Error("This file is not a valid PDF or is too damaged to open.");
  });
}

function unlock(fileBytes: ArrayBuffer, password: string): Promise<UnlockResult> {
  return withInput(fileBytes, (qpdf, fs) => {
    const passwordArgs = password ? [`--password=${password}`] : [];
    const result = runQpdf(qpdf, [...passwordArgs, "--decrypt", INPUT, OUTPUT]);

    if (result.code !== 0) {
      throw new Error(
        /invalid password/i.test(result.stderr)
          ? "The password was incorrect. Please try again."
          : result.stderr || result.stdout || "Unseal could not unlock this PDF."
      );
    }

    return {
      fileBytes: fs.readFile(OUTPUT).buffer as ArrayBuffer,
      pageCount: getPageCount(qpdf, OUTPUT)
    };
  });
}

workerScope.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === "inspect") {
      const payload = await inspect(request.payload.fileBytes);
      workerScope.postMessage({ id: request.id, type: "result", payload } satisfies WorkerResponse);
    } else {
      const payload = await unlock(request.payload.fileBytes, request.payload.password);
      workerScope.postMessage({ id: request.id, type: "result", payload } satisfies WorkerResponse, [payload.fileBytes]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unseal could not process this PDF.";
    workerScope.postMessage({ id: request.id, type: "error", message } satisfies WorkerResponse);
  }
});
