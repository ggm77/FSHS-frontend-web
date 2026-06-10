import { getCookie } from './client';

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

export async function downloadUrl(url: string, fallbackFilename: string): Promise<void> {
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
  const blob = await res.blob();
  saveBlob(blob, filename);
}
