import { request } from './client';

export interface SystemStatusDto {
  timestamp: string;
  osName: string;
  uptimeSecond: number;
  cpuIdleTimeMillis: number;
  cpuTotalTimeMillis: number;
  logicalCoreCount: number;
  physicalCoreCount: number;
  ramTotalBytes: number;
  ramUsedBytes: number;
  ramAvailableBytes: number;
  ramUsagePercent: number;
  ramSwapTotalBytes: number;
  ramSwapUsedBytes: number;
  mountPoint: string;
  diskTotalBytes: number;
  diskUsedBytes: number;
  diskAvailableBytes: number;
  diskUsagePercent: number;
  netInterfaceName: string;
  netBytesSent: number;
  netBytesReceived: number;
}

export function getSystemStatus(): Promise<SystemStatusDto> {
  return request('/system/status');
}
