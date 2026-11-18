export type InspectResult = {
  encrypted: boolean;
  pageCount: number | null;
};

export type UnlockResult = {
  fileBytes: ArrayBuffer;
  pageCount: number | null;
};

export type WorkerRequest =
  | { id: number; type: "inspect"; payload: { fileBytes: ArrayBuffer } }
  | { id: number; type: "unlock"; payload: { fileBytes: ArrayBuffer; password: string } };

export type WorkerResponse =
  | { id: number; type: "result"; payload: InspectResult | UnlockResult }
  | { id: number; type: "error"; message: string };
