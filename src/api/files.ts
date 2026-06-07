import { request } from './client';
import type { FileResponseDto, FileStatusDto } from '../types';

export function getFile(fileId: number): Promise<FileResponseDto> {
  return request(`/files/${fileId}`);
}

export function getFileStatus(fileUuid: string): Promise<FileStatusDto> {
  return request(`/files/${fileUuid}/status`);
}

export async function uploadFile(
  folderId: number,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('lastModified', new Date(file.lastModified).toISOString());
  formData.append('folderId', String(folderId));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v2/files');
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const { fileUuid } = JSON.parse(xhr.responseText);
        resolve(fileUuid);
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload error'));
    xhr.send(formData);
  });
}

export async function moveFile(fileId: number, folderId?: number, originUpdatedAt?: string): Promise<FileResponseDto> {
  return request(`/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ folderId, originUpdatedAt }),
  });
}

export async function deleteFile(fileId: number): Promise<void> {
  return request(`/files/${fileId}`, { method: 'DELETE' });
}

export function getFileContentUrl(fileId: number, download: boolean): string {
  return `/api/v2/files/${fileId}/content?download=${download}`;
}

export function getFileStreamUrl(fileId: number, start = 0): string {
  return `/api/v2/files/${fileId}/stream?start=${start}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
