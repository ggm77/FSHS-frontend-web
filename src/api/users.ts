import { request } from './client';
import type {
  CreateUserRequestDto,
  CreateUserResponseDto,
  UpdateUserRequestDto,
  UpdateUserResponseDto,
  UserResponseDto,
} from '../types';

export function getUser(userId: number): Promise<UserResponseDto> {
  return request(`/users/${userId}`);
}

export function getCurrentUser(): Promise<UserResponseDto> {
  return request('/users/me');
}

export async function createUser(data: CreateUserRequestDto): Promise<CreateUserResponseDto> {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(data),
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
