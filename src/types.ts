export interface UserResponseDto {
  id: number;
  username: string;
  role: 'USER' | 'ADMIN';
  rootFolderId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleFolderResponseDto {
  id: number;
  ownerId: number | null;
  parentFolderId: number;
  relativePath: string;
  name: string;
  originUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  isRoot: boolean;
}

export interface FolderResponseDto extends SimpleFolderResponseDto {
  folders: SimpleFolderResponseDto[];
  files: FileResponseDto[];
}

export type FileCategory = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'ARCHIVE' | 'ETC' | 'UNKNOWN';

export interface FileResponseDto {
  id: number;
  uuid: string;
  ownerId: number;
  name: string;
  baseName: string;
  extension: string;
  relativePath: string;
  parentPath: string;
  mimeType: string;
  size: number;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  bitrate: number | null;
  orientation: number | null;
  lat: number | null;
  lon: number | null;
  fps: number | null;
  format: string | null;
  capturedAt: string | null;
  originUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  category: FileCategory;
  isShared: boolean;
  shareKeys: string[];
}

export interface ShareResponseDto {
  id: number;
  fileId: number;
  shareKey: string;
}

export interface UserSharesResponseDto {
  shares: ShareResponseDto[];
}

export interface FileStatusDto {
  status: 'PROCESSING' | 'COMPLETE' | 'ERROR';
  id: number | null;
}

export interface FolderSyncResponseDto {
  createdFolders: string[];
  createdFiles: string[];
  updatedFiles: string[];
  deletedFolders: string[];
  deletedFiles: string[];
  skipped: string[];
  errors: string[];
}
