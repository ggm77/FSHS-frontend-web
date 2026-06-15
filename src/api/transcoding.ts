import { request } from './client';

export interface TranscodingSettings {
  hwAccel: string;
  h264Encoder: string;
  quality: string;
  availableHwAccels: string[];
  availableEncoders: string[];
  availableQualities: string[];
}

export interface TranscodingUpdateRequest {
  hwAccel: string;
  h264Encoder: string;
  quality: string;
}

export function getTranscodingSettings(): Promise<TranscodingSettings> {
  return request<TranscodingSettings>('/transcoding/settings');
}

export function updateTranscodingSettings(data: TranscodingUpdateRequest): Promise<TranscodingSettings> {
  return request<TranscodingSettings>('/transcoding/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
