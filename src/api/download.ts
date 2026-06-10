import { getCookie } from './client';

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number | null;
}

interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
}

type WritableFile = {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

type SaveFilePicker = (options?: { suggestedName?: string }) => Promise<{
  createWritable: () => Promise<WritableFile>;
}>;

type PickedFile = Awaited<ReturnType<SaveFilePicker>>;

function parseFilename(contentDisposition: string | null): string | undefined {
  if (!contentDisposition) return undefined;

  const encodedMatch = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return encodedMatch[1].trim().replace(/^"|"$/g, '');
    }
  }

  const filenameMatch = contentDisposition.match(/filename=([^;]+)/i);
  return filenameMatch?.[1]?.trim().replace(/^"|"$/g, '');
}

function getTotalBytes(res: Response): number | null {
  const contentLength = res.headers.get('Content-Length');
  if (!contentLength) return null;

  const total = Number(contentLength);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function getSaveFilePicker(): SaveFilePicker | undefined {
  return (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

async function pickDownloadFile(filename: string): Promise<PickedFile | null> {
  const saveFilePicker = getSaveFilePicker();
  if (!saveFilePicker) return null;

  try {
    return await saveFilePicker({ suggestedName: filename });
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new Error('다운로드가 취소되었습니다.');
    }
    return null;
  }
}

async function streamToPickedFile(
  body: ReadableStream<Uint8Array>,
  fileHandle: PickedFile,
  totalBytes: number | null,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  let writable: WritableFile | null = null;
  try {
    writable = await fileHandle.createWritable();
    const reader = body.getReader();
    let loadedBytes = 0;

    onProgress?.({ loadedBytes, totalBytes });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      await writable.write(value);
      loadedBytes += value.byteLength;
      onProgress?.({ loadedBytes, totalBytes });
    }

    await writable.close();
  } catch (err: unknown) {
    await writable?.abort?.().catch(() => {});
    if (isAbortError(err)) {
      throw new Error('다운로드가 취소되었습니다.');
    }
    throw err;
  }
}

async function streamToBlobDownload(
  res: Response,
  filename: string,
  totalBytes: number | null,
  onProgress?: (progress: DownloadProgress) => void,
) {
  const chunks: BlobPart[] = [];
  let loadedBytes = 0;

  onProgress?.({ loadedBytes, totalBytes });
  if (!res.body) {
    const blob = await res.blob();
    onProgress?.({ loadedBytes: blob.size, totalBytes: totalBytes ?? blob.size });
    saveBlob(blob, filename);
    return;
  }

  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress?.({ loadedBytes, totalBytes });
  }

  saveBlob(new Blob(chunks, {
    type: res.headers.get('Content-Type') || 'application/octet-stream',
  }), filename);
}

export async function downloadUrl(
  url: string,
  fallbackFilename: string,
  options: DownloadOptions = {},
): Promise<void> {
  const pickedFile = await pickDownloadFile(fallbackFilename);
  const xsrfToken = getCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {};
  if (xsrfToken) {
    headers['X-XSRF-TOKEN'] = xsrfToken;
  }

  const res = await fetch(url, {
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(message || `다운로드 실패: HTTP ${res.status}`);
  }

  const filename = parseFilename(res.headers.get('Content-Disposition')) || fallbackFilename;
  const totalBytes = getTotalBytes(res);

  if (res.body && pickedFile) {
    await streamToPickedFile(res.body, pickedFile, totalBytes, options.onProgress);
    return;
  }

  await streamToBlobDownload(res, filename, totalBytes, options.onProgress);
}
