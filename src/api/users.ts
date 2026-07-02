import { request } from './client';
import type { UpdateUserRequestDto, UpdateUserResponseDto, UserResponseDto } from '../types';

export function getUser(userId: number): Promise<UserResponseDto> {
  return request(`/users/${userId}`);
}

export async function createUser(username: string, password: string): Promise<UserResponseDto> {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function updateUser(
  userId: number,
  data: UpdateUserRequestDto,
): Promise<UpdateUserResponseDto> {
  return request(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(userId: number): Promise<void> {
  return request(`/users/${userId}`, { method: 'DELETE' });
}

export async function setRootFolder(userId: number, folderId: number): Promise<void> {
  return request(`/users/${userId}/root-folder`, {
    method: 'POST',
    body: JSON.stringify({ folderId }),
  });
}
