import { request } from './client';
import { downloadUrl } from './download';
import type { FolderResponseDto } from '../types';

export function getFolder(folderId: number): Promise<FolderResponseDto> {
  return request(`/folders/${folderId}`);
}

export async function createFolder(parentFolderId: number, name: string): Promise<FolderResponseDto> {
  return request('/folders', {
    method: 'POST',
    body: JSON.stringify({ parentFolderId, name }),
  });
}

export async function renameFolder(folderId: number, name?: string, parentFolderId?: number): Promise<FolderResponseDto> {
  return request(`/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, parentFolderId }),
  });
}

export async function deleteFolder(folderId: number): Promise<void> {
  return request(`/folders/${folderId}`, { method: 'DELETE' });
}

export function getFolderDownloadUrl(folderId: number): string {
  return `/api/v2/folders/${folderId}/content`;
}

export function downloadFolderContent(folderId: number, filename: string): Promise<void> {
  return downloadUrl(getFolderDownloadUrl(folderId), filename);
}
