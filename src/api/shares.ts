import { request, BASE } from './client';
import type { ShareResponseDto, UserSharesResponseDto } from '../types';

export type SharedFilePageView = 'info' | 'content' | 'stream' | 'hls' | 'thumbnail';

export function createFileShare(fileId: number): Promise<ShareResponseDto> {
  return request(`/files/${fileId}/shares`, { method: 'POST' });
}

export function getUserShares(userId: number): Promise<UserSharesResponseDto> {
  return request(`/users/${userId}/shares`);
}

export function deleteShare(shareId: number): Promise<void> {
  return request(`/shares/${shareId}`, { method: 'DELETE' });
}

export function getSharedFilePageUrl(shareKey: string, view: SharedFilePageView = 'info'): string {
  const suffix = view === 'info' ? '' : `/${view}`;
  return `/s/${encodeURIComponent(shareKey)}${suffix}`;
}

export function getSharedFileUrl(shareKey: string): string {
  return getSharedFilePageUrl(shareKey);
}

export function getSharedFileApiUrl(shareKey: string): string {
  return `${BASE}/auth/files/${encodeURIComponent(shareKey)}`;
}
