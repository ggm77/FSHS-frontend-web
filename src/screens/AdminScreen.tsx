import { Icon } from '../components/Icon';

function mkSeries(n: number, base: number, jitter: number, trend = 0): number[] {
  return Array.from({ length: n }, (_, i) => {
    const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.43)) * jitter;
    return Math.max(0, base + noise + trend * i);
  });
}

const METRICS = {
  cpu:    mkSeries(48, 28, 12, 0.1),
  mem:    mkSeries(48, 54, 8, 0.05),
  netIn:  mkSeries(48, 18, 14, 0),
  netOut: mkSeries(48, 12, 10, 0),
  disk: [
    { label: 'System (SSD)',   used: 42,  total: 256,  temp: 41 },
    { label: 'Storage (HDD)',  used: 412, total: 1024, temp: 38 },
    { label: 'Backup (HDD)',   used: 187, total: 2048, temp: 36 },
  ],
};

function Sparkline({ data, color = 'var(--accent)', height = 40 }: { data: number[]; color?: string; height?: number }) {
  const w = 200, h = height;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const dFill = d + ` L${w},${h} L0,${h} Z`;
  const gid = 'spark-' + Math.random().toString(36).slice(2, 8);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={dFill} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NetGraph() {
  const w = 600, h = 200;
  const inS = METRICS.netIn;
  const outS = METRICS.netOut;
  const max = Math.max(...inS, ...outS, 30);
  function buildPath(data: number[], color: string) {
    const pts = data.map((v, i) => [
      (i / (data.length - 1)) * w,
      h - (v / max) * (h - 20) - 10,
    ]);
    const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
    return (
      <>
        <path d={d + ` L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </>
    );
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', flex: 1 }}>
      {[0.25, 0.5, 0.75].map((p, i) => (
        <line key={i} x1="0" y1={h * p} x2={w} y2={h * p}
          stroke="currentColor" strokeOpacity="0.06" strokeDasharray="2 4" />
      ))}
      {buildPath(inS, '#5b50e8')}
      {buildPath(outS, '#0d9488')}
    </svg>
  );
}

export function AdminScreen() {
  return (
    <>
      <style>{adminStyles}</style>
      <div className="content">
        <div className="page-h">
          <div>
            <h1>대시보드</h1>
            <div className="sub">시스템 가동 시간 14일 7시간 · 마지막 백업 2시간 전</div>
          </div>
          <div className="actions">
            <span className="pill good"><span className="dot" /> 모든 서비스 정상</span>
            <button className="btn"><Icon name="refresh" size={14} /> 새로고침</button>
          </div>
        </div>

        <div className="kpi-grid">
          {[
            { l: 'CPU', icon: 'cpu', v: '34', unit: '%', delta: '↗ 4%', data: METRICS.cpu, color: '#5b50e8' },
            { l: '메모리', icon: 'cpu', v: '11.2', unit: '/16 GB', delta: '→ 안정', data: METRICS.mem, color: '#a855f7' },
            { l: '전송 속도', icon: 'network', v: '42', unit: ' MB/s', delta: '↗ 18%', data: METRICS.netOut, color: '#0d9488' },
            { l: '활성 세션', icon: 'users', v: '2', unit: '/ 5 유저', delta: '→ 안정', data: [1,1,2,2,1,1,2,2,2,3,2,2,2,2], color: '#d98a00' },
          ].map((k, i) => (
            <div className="kpi" key={i}>
              <div className="l"><Icon name={k.icon} size={12} /> {k.l}</div>
              <div className="v">{k.v}<small>{k.unit}</small></div>
              <div className="delta">{k.delta}</div>
              <div className="spark"><Sparkline data={k.data} color={k.color} height={38} /></div>
            </div>
          ))}
        </div>

        <div className="panel-grid">
          <div className="panel">
            <div className="ph">
              <div className="t">네트워크 트래픽</div>
              <div className="seg" style={{ height: 26 }}>
                <button>1h</button>
                <button className="on">24h</button>
                <button>7d</button>
              </div>
            </div>
            <div className="net-graph">
              <div className="legend">
                <span style={{ color: 'var(--fg-2)' }}><i style={{ background: '#5b50e8' }} /> 인바운드 18 MB/s</span>
                <span style={{ color: 'var(--fg-2)' }}><i style={{ background: '#0d9488' }} /> 아웃바운드 42 MB/s</span>
              </div>
              <NetGraph />
            </div>
          </div>

          <div className="panel">
            <div className="ph">
              <div className="t">저장소</div>
              <button className="btn ghost" style={{ height: 24, padding: '0 8px', fontSize: 12, color: 'var(--fg-3)' }}>자세히</button>
            </div>
            {METRICS.disk.map((d, i) => {
              const pct = Math.round((d.used / d.total) * 100);
              return (
                <div className="disk-row" key={i}>
                  <div className="ic"><Icon name="hdd" size={15} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="h">{d.label}</div>
                    <div className="m">
                      <div className="ms">
                        <span>{d.used} / {d.total} GB</span>
                        <span>{d.temp}°C</span>
                      </div>
                      <div className="meter">
                        <i style={{ width: pct + '%', background: pct > 70 ? 'var(--warn)' : 'var(--accent)' }} />
                      </div>
                    </div>
                  </div>
                  <div />
                  <div className="pct">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel-grid">
          <div className="panel">
            <div className="ph">
              <div className="t">최근 이벤트</div>
              <button className="btn ghost" style={{ height: 24, padding: '0 8px', fontSize: 12, color: 'var(--fg-3)' }}>모두 보기</button>
            </div>
            <div className="events-list">
              {[
                { ic: 'check', cls: 'good', t: '백업 완료', d: '/Backup/snapshot_2025-11-26 (124 GB)', when: '2시간 전' },
                { ic: 'upload', cls: 'info', t: '업로드 완료', d: 'family_dinner_2025.mp4 — 847 MB', when: '2시간 전' },
                { ic: 'user', cls: 'info', t: '사용자 로그인', d: '192.168.1.31', when: '5분 전' },
                { ic: 'warn', cls: 'warn', t: '디스크 온도 경고', d: 'Storage (HDD) 38°C → 42°C', when: '3시간 전' },
                { ic: 'sync', cls: 'info', t: '동기화 완료', d: '/Photos/2025-11 — 47개 항목 추가됨', when: '4시간 전' },
                { ic: 'shield', cls: 'good', t: '보안 업데이트 설치됨', d: 'FSHS v2.1.4 → v2.1.5', when: '12시간 전' },
              ].map((e, i) => (
                <div className="event-row" key={i}>
                  <div className="ic" style={{
                    background: e.cls === 'good' ? 'var(--good)'
                      : e.cls === 'warn' ? 'var(--warn)'
                      : 'var(--accent)',
                  }}>
                    <Icon name={e.ic} size={11} color="#fff" stroke={2.5} />
                  </div>
                  <div>
                    <div className="t">{e.t}</div>
                    <div className="d">{e.d}</div>
                  </div>
                  <div className="when">{e.when}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="ph"><div className="t">서비스 상태</div></div>
            {[
              { ic: 'cloud', t: 'HTTP 서버', s: ':8085 · Spring Boot', state: 'ok' },
              { ic: 'video', t: '트랜스코더', s: 'FFmpeg · 활성 2', state: 'ok' },
              { ic: 'image', t: '썸네일 워커', s: '대기열 38개', state: 'busy' },
              { ic: 'sync', t: '파일 시스템 감시', s: '6개 루트 모니터링', state: 'ok' },
              { ic: 'shield', t: '인증 서비스', s: '세션 기반 인증', state: 'ok' },
              { ic: 'power', t: 'UPS 데몬', s: '장치 미연결', state: 'off' },
            ].map((s, i) => (
              <div className="svc-row" key={i}>
                <div className="lic"><Icon name={s.ic} size={15} /></div>
                <div>
                  <div className="lt">{s.t}</div>
                  <div className="ls">{s.s}</div>
                </div>
                <div>
                  {s.state === 'ok' && <span className="pill good"><span className="dot" />정상</span>}
                  {s.state === 'busy' && <span className="pill warn"><span className="dot" />작업 중</span>}
                  {s.state === 'off' && <span className="pill"><span className="dot" style={{ background: 'var(--fg-4)' }} />비활성</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const adminStyles = `
  .kpi-grid{
    display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px;
  }
  .kpi{
    background:var(--bg-2); border:.5px solid var(--border);
    border-radius:var(--radius-lg); padding:16px; overflow:hidden; position:relative;
  }
  .kpi .l{font-size:11.5px; color:var(--fg-3); font-weight:500; display:flex; align-items:center; gap:6px; white-space:nowrap}
  .kpi .v{font-size:28px; font-weight:700; letter-spacing:-0.015em; margin-top:4px; font-variant-numeric:tabular-nums}
  .kpi .v small{font-size:14px; color:var(--fg-3); font-weight:500}
  .kpi .delta{display:inline-flex; align-items:center; gap:3px; font-size:11.5px; font-weight:600; color:var(--good); margin-top:2px;}
  .kpi .spark{margin-top:8px; height:38px; margin-left:-4px; margin-right:-4px; margin-bottom:-4px}

  .panel-grid{display:grid; grid-template-columns: 1.6fr 1fr; gap:16px; margin-bottom:16px;}
  .panel{background:var(--bg-2); border:.5px solid var(--border); border-radius:var(--radius-lg); overflow:hidden;}
  .panel .ph{
    padding:14px 18px; display:flex; align-items:center; justify-content:space-between;
    border-bottom:.5px solid var(--hairline);
  }
  .panel .ph .t{font-weight:600; font-size:13.5px}

  .disk-row{
    display:grid; grid-template-columns: 28px 1fr 80px 60px; gap:14px; align-items:center;
    padding:14px 18px; border-top:.5px solid var(--hairline);
  }
  .disk-row:first-of-type{border-top:0}
  .disk-row .ic{
    width:28px; height:28px; border-radius:7px; background:var(--bg-3);
    display:grid; place-items:center; color:var(--fg-2);
  }
  .disk-row .h{font-weight:500; font-size:13px}
  .disk-row .m{margin-top:6px}
  .disk-row .ms{display:flex; justify-content:space-between; font-size:11px; color:var(--fg-3); margin-bottom:4px; font-variant-numeric:tabular-nums}
  .disk-row .pct{font-size:13px; font-weight:600; text-align:right; font-variant-numeric:tabular-nums}

  .net-graph{padding:18px; height:280px; display:flex; flex-direction:column;}
  .net-graph .legend{display:flex; gap:18px; margin-bottom:10px; font-size:12px;}
  .net-graph .legend i{display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px;}

  .events-list{max-height:380px; overflow-y:auto}
  .event-row{
    display:grid; grid-template-columns:24px 1fr auto; gap:12px;
    padding:10px 18px; align-items:start;
    border-top:.5px solid var(--hairline); font-size:12.5px;
  }
  .event-row:first-of-type{border-top:0}
  .event-row .ic{
    width:24px; height:24px; border-radius:50%;
    display:grid; place-items:center; color:#fff; margin-top:1px;
  }
  .event-row .t{color:var(--fg)}
  .event-row .d{color:var(--fg-3); font-size:11.5px; margin-top:1px}
  .event-row .when{color:var(--fg-3); font-size:11px; font-variant-numeric:tabular-nums; white-space:nowrap}

  .svc-row{
    display:grid; grid-template-columns:30px 1fr auto; gap:12px;
    padding:11px 18px; align-items:center;
    border-top:.5px solid var(--hairline);
  }
  .svc-row:first-of-type{border-top:0}
  .svc-row .lt{font-weight:500; font-size:13px}
  .svc-row .ls{font-size:11px; color:var(--fg-3); margin-top:1px}
  .svc-row .lic{
    width:30px; height:30px; border-radius:8px;
    background:var(--bg-3); display:grid; place-items:center; color:var(--fg-2);
  }
`;
