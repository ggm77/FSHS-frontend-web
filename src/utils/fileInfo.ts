import { formatBytes, formatDuration } from '../api/files';
import type { FileResponseDto } from '../types';

export function toAbsoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatNumber(value: number | null | undefined, suffix = ''): string | null {
  if (value == null) return null;
  return `${Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${suffix}`;
}

export function formatBitrate(value: number | null | undefined): string | null {
  if (value == null) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mbps`;
  if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString()} Kbps`;
  return `${value.toLocaleString()} bps`;
}

export function formatCoordinates(lat: number | null, lon: number | null): string | null {
  if (lat == null || lon == null) return null;
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function formatFilePath(file: FileResponseDto): string {
  const path = file.relativePath?.trim();
  if (path) return path.startsWith('/') ? path : `/${path}`;
  return `/${file.name}`;
}

export function formatParentPath(path: string | null | undefined): string {
  const trimmed = path?.trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function getFileInfoGroups(file: FileResponseDto): Array<{ title: string; items: Array<{ label: string; value: string | null }> }> {
  return [
    {
      title: '기본 정보',
      items: [
        { label: '파일명', value: file.name },
        { label: '경로', value: formatFilePath(file) },
        { label: '상위 폴더', value: formatParentPath(file.parentPath) },
        { label: '크기', value: formatBytes(file.size) },
        { label: '종류', value: file.category },
        { label: 'MIME 타입', value: file.mimeType },
        { label: '확장자', value: file.extension || null },
      ],
    },
    {
      title: '날짜',
      items: [
        { label: '원본 수정일', value: formatDateTime(file.originUpdatedAt) },
        { label: '촬영일', value: formatDateTime(file.capturedAt) },
        { label: '등록일', value: formatDateTime(file.createdAt) },
        { label: '서버 수정일', value: formatDateTime(file.updatedAt) },
      ],
    },
    {
      title: '미디어 정보',
      items: [
        { label: '해상도', value: file.width != null && file.height != null ? `${file.width} x ${file.height}` : null },
        { label: '재생 시간', value: file.duration != null ? formatDuration(file.duration) : null },
        { label: '비디오 코덱', value: file.videoCodec },
        { label: '오디오 코덱', value: file.audioCodec },
        { label: '비트레이트', value: formatBitrate(file.bitrate) },
        { label: 'FPS', value: formatNumber(file.fps) },
        { label: '포맷', value: file.format },
        { label: '방향', value: formatNumber(file.orientation, '°') },
        { label: '좌표', value: formatCoordinates(file.lat, file.lon) },
      ],
    },
    {
      title: '공유',
      items: [
        { label: '공유 상태', value: file.isShared ? '공유 중' : '공유 안 함' },
        { label: '공유 링크 수', value: `${file.shareKeys?.length ?? 0}개` },
      ],
    },
  ];
}
