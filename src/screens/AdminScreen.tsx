import { useState, useEffect, useRef } from 'react';
import { getSystemStatus } from '../api/system';
import type { SystemStatusDto } from '../api/system';
import { Icon } from '../components/Icon';

const POLL_INTERVAL_MS = 3000;

type Level = 'good' | 'warn' | 'bad';

function levelFromPercent(percent: number): Level {
  if (percent >= 90) return 'bad';
  if (percent >= 70) return 'warn';
  return 'good';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}일`);
  if (days || hours) parts.push(`${hours}시간`);
  parts.push(`${minutes}분`);
  return parts.join(' ');
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour12: false });
  } catch {
    return iso;
  }
}

interface Rates {
  cpuUsagePercent: number | null;
  netSentPerSec: number | null;
  netRecvPerSec: number | null;
}

function computeRates(prev: SystemStatusDto, next: SystemStatusDto): Rates {
  const cpuTotalDelta = next.cpuTotalTimeMillis - prev.cpuTotalTimeMillis;
  const cpuIdleDelta = next.cpuIdleTimeMillis - prev.cpuIdleTimeMillis;
  const timeDeltaSec = (new Date(next.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;

  return {
    cpuUsagePercent: cpuTotalDelta > 0
      ? Math.max(0, Math.min(100, ((cpuTotalDelta - cpuIdleDelta) / cpuTotalDelta) * 100))
      : null,
    netSentPerSec: timeDeltaSec > 0 && next.netBytesSent >= prev.netBytesSent
      ? (next.netBytesSent - prev.netBytesSent) / timeDeltaSec
      : null,
    netRecvPerSec: timeDeltaSec > 0 && next.netBytesReceived >= prev.netBytesReceived
      ? (next.netBytesReceived - prev.netBytesReceived) / timeDeltaSec
      : null,
  };
}

function StatCard({
  icon, label, percent, valueText, sub,
}: {
  icon: string;
  label: string;
  percent: number | null;
  valueText: string;
  sub: string;
}) {
  const level = percent !== null ? levelFromPercent(percent) : null;
  return (
    <div className="card card-pad stat-card">
      <div className="stat-card-h">
        <Icon name={icon} size={16} />
        <span>{label}</span>
        {level && <span className={`pill ${level}`}>{percent!.toFixed(0)}%</span>}
      </div>
      <div className="stat-card-value">{valueText}</div>
      {percent !== null && (
        <div className="meter">
          <i className={level ?? ''} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      )}
      <div className="stat-card-sub">{sub}</div>
    </div>
  );
}

export function AdminScreen() {
  const [status, setStatus] = useState<SystemStatusDto | null>(null);
  const [rates, setRates] = useState<Rates>({ cpuUsagePercent: null, netSentPerSec: null, netRecvPerSec: null });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const prevRef = useRef<SystemStatusDto | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const next = await getSystemStatus();
        if (cancelled) return;

        const prev = prevRef.current;
        if (prev) setRates(computeRates(prev, next));
        prevRef.current = next;

        setStatus(next);
        setError(null);
      } catch {
        if (!cancelled) setError('시스템 상태를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="content">
      <style>{styles}</style>
      <div className="page-h">
        <div>
          <h1>대시보드</h1>
          {status && (
            <p className="sub">
              {status.osName} · 마지막 갱신 {formatTime(status.timestamp)}
            </p>
          )}
        </div>
      </div>

      {loading && !status ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--fg-3)' }}>
          <Icon name="spinner" size={24} className="spin-icon" />
        </div>
      ) : error && !status ? (
        <div style={{ color: 'var(--bad)', padding: 20 }}>{error}</div>
      ) : status ? (
        <>
          {error && <div className="dash-warn">{error} (마지막으로 확인된 값을 표시 중)</div>}

          <div className="stat-grid">
            <StatCard
              icon="cpu"
              label="CPU"
              percent={rates.cpuUsagePercent}
              valueText={rates.cpuUsagePercent !== null ? `${rates.cpuUsagePercent.toFixed(1)}%` : '—'}
              sub={`논리 코어 ${status.logicalCoreCount}개 · 물리 코어 ${status.physicalCoreCount}개`}
            />
            <StatCard
              icon="zap"
              label="메모리"
              percent={status.ramUsagePercent}
              valueText={formatBytes(status.ramUsedBytes)}
              sub={`${formatBytes(status.ramUsedBytes)} / ${formatBytes(status.ramTotalBytes)}${status.ramSwapTotalBytes > 0 ? ` · 스왑 ${formatBytes(status.ramSwapUsedBytes)}` : ''}`}
            />
            <StatCard
              icon="hdd"
              label="디스크"
              percent={status.diskUsagePercent}
              valueText={formatBytes(status.diskUsedBytes)}
              sub={`${formatBytes(status.diskUsedBytes)} / ${formatBytes(status.diskTotalBytes)} · ${status.mountPoint}`}
            />
            <div className="card card-pad stat-card">
              <div className="stat-card-h">
                <Icon name="network" size={16} />
                <span>네트워크</span>
              </div>
              <div className="stat-card-value">{status.netInterfaceName || '—'}</div>
              <div className="net-rows">
                <div className="net-row">
                  <Icon name="upload" size={13} />
                  <span>{rates.netSentPerSec !== null ? formatRate(rates.netSentPerSec) : '—'}</span>
                </div>
                <div className="net-row">
                  <Icon name="download" size={13} />
                  <span>{rates.netRecvPerSec !== null ? formatRate(rates.netRecvPerSec) : '—'}</span>
                </div>
              </div>
              <div className="stat-card-sub">
                누적 송신 {formatBytes(status.netBytesSent)} · 누적 수신 {formatBytes(status.netBytesReceived)}
              </div>
            </div>
          </div>

          <div className="section-h">
            <div className="t">시스템 정보</div>
          </div>
          <div className="card card-pad info-grid">
            <div className="info-item">
              <span className="k">운영체제</span>
              <span className="v">{status.osName}</span>
            </div>
            <div className="info-item">
              <span className="k">가동 시간</span>
              <span className="v">{formatUptime(status.uptimeSecond)}</span>
            </div>
            <div className="info-item">
              <span className="k">CPU 코어</span>
              <span className="v">논리 {status.logicalCoreCount} / 물리 {status.physicalCoreCount}</span>
            </div>
            <div className="info-item">
              <span className="k">마운트 위치</span>
              <span className="v mono">{status.mountPoint}</span>
            </div>
            <div className="info-item">
              <span className="k">네트워크 인터페이스</span>
              <span className="v mono">{status.netInterfaceName}</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const styles = `
  .dash-warn {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
    background: rgba(216, 137, 22, 0.12);
    color: var(--warn);
    border: 1px solid rgba(216, 137, 22, 0.2);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
    margin-top: 4px;
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stat-card-h {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-3);
    font-size: 12.5px;
    font-weight: 700;
  }

  .stat-card-h .pill {
    margin-left: auto;
  }

  .stat-card-value {
    font-size: 22px;
    font-weight: 780;
    color: var(--fg);
    line-height: 1.2;
  }

  .stat-card-sub {
    font-size: 12px;
    color: var(--fg-3);
  }

  .meter > i.good { background: var(--good); }
  .meter > i.warn { background: var(--warn); }
  .meter > i.bad { background: var(--bad); }

  .net-rows {
    display: flex;
    gap: 16px;
  }

  .net-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--fg-2);
    font-weight: 650;
  }

  .info-grid {
    margin-top: 4px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px 24px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .info-item .k {
    font-size: 11.5px;
    color: var(--fg-3);
    font-weight: 700;
  }

  .info-item .v {
    font-size: 13.5px;
    color: var(--fg);
    font-weight: 600;
  }

  .info-item .v.mono {
    font-family: ui-monospace, monospace;
    font-size: 12.5px;
  }
`;
