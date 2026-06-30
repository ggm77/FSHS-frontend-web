import { BASE, request } from './client';
import { downloadUrl, type DownloadProgress } from './download';
import type { FileResponseDto } from '../types';

function encodeShareKey(shareKey: string): string {
  return encodeURIComponent(shareKey);
}

export function getSharedFile(shareKey: string): Promise<FileResponseDto> {
  return request(`/auth/files/${encodeShareKey(shareKey)}`);
}

export function getSharedFileContentUrl(shareKey: string, download = false): string {
  return `${BASE}/auth/files/${encodeShareKey(shareKey)}/content?download=${download}`;
}

export function getSharedFileStreamUrl(shareKey: string, start = 0): string {
  const base = `${BASE}/auth/files/${encodeShareKey(shareKey)}/stream`;
  return start === 0 ? base : `${base}?start=${start}`;
}

export function getSharedFileHlsUrl(shareKey: string, hlsFile = 'index.m3u8'): string {
  return `${BASE}/auth/files/${encodeShareKey(shareKey)}/stream/${encodeURIComponent(hlsFile)}`;
}

export function getSharedFileThumbnailUrl(shareKey: string): string {
  return `${BASE}/auth/files/${encodeShareKey(shareKey)}/thumbnail`;
}

export function downloadSharedFileContent(
  shareKey: string,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  return downloadUrl(getSharedFileContentUrl(shareKey, true), filename, { onProgress });
}
