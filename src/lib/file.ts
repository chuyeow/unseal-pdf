export function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function makeUnlockedFileName(originalName: string): string {
  return originalName.replace(/\.pdf$/i, "") + "_unlocked.pdf";
}

export function saveArrayBuffer(fileBytes: ArrayBuffer, fileName: string): void {
  const blob = new Blob([fileBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
