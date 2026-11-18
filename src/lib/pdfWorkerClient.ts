import type { InspectResult, UnlockResult, WorkerRequest, WorkerResponse } from "../types";

const worker = new Worker(new URL("../workers/pdf.worker.ts", import.meta.url), {
  type: "module"
});

const pending = new Map<number, { resolve: (value: never) => void; reject: (reason: Error) => void }>();
let nextId = 0;

worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
  const message = event.data;
  const entry = pending.get(message.id);

  if (!entry) {
    return;
  }

  pending.delete(message.id);

  if (message.type === "error") {
    entry.reject(new Error(message.message));
  } else {
    entry.resolve(message.payload as never);
  }
});

function send<T>(request: Omit<WorkerRequest, "id">, fileBytes: ArrayBuffer): Promise<T> {
  const id = nextId++;

  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...request, id }, [fileBytes]);
  });
}

export function inspectPdf(fileBytes: ArrayBuffer): Promise<InspectResult> {
  return send({ type: "inspect", payload: { fileBytes } }, fileBytes);
}

export function unlockPdf(fileBytes: ArrayBuffer, password: string): Promise<UnlockResult> {
  return send({ type: "unlock", payload: { fileBytes, password } }, fileBytes);
}
