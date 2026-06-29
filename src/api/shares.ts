import { request, BASE } from './client';
import type { ShareResponseDto, UserSharesResponseDto } from '../types';

export function createFileShare(fileId: number): Promise<ShareResponseDto> {
  return request(`/files/${fileId}/shares`, { method: 'POST' });
}

export function getUserShares(userId: number): Promise<UserSharesResponseDto> {
  return request(`/users/${userId}/shares`);
}

export function deleteShare(shareId: number): Promise<void> {
  return request(`/shares/${shareId}`, { method: 'DELETE' });
}

export function getSharedFileUrl(shareKey: string): string {
  return `${BASE}/auth/files/${encodeURIComponent(shareKey)}`;
}
