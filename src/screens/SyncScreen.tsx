import { Icon } from '../components/Icon';

function Ring({ value, size = 88, stroke = 6, color = 'var(--accent)' }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
    </svg>
  );
}

const SYNC_RECENT = [
  { type: 'add',    path: '/Photos/2025-11/IMG_4821.HEIC', at: '방금 전' },
  { type: 'add',    path: '/Photos/2025-11/IMG_4820.HEIC', at: '방금 전' },
  { type: 'change', path: '/Documents/설계서_v2.docx',    at: '2분 전' },
  { type: 'add',    path: '/Movies/family_dinner_2025.mp4', at: '17분 전' },
  { type: 'delete', path: '/Backup/.cache/thumb_2891.jpg', at: '34분 전' },
  { type: 'add',    path: '/Projects/fshs-v2/.git/objects/4f/...', at: '1시간 전' },
];

export function SyncScreen() {
  return (
    <>
      <style>{syncStyles}</style>
      <div className="content">
        <div className="page-h">
          <div>
            <h1>동기화</h1>
            <div className="sub">OS 파일 시스템과 실시간으로 연결되어 있습니다.</div>
          </div>
          <div className="actions">
            <button className="btn"><Icon name="refresh" size={14} /> 폴더 동기화</button>
            <button className="btn danger"><Icon name="refresh" size={14} /> 전체 재스캔</button>
          </div>
        </div>

        <div className="sync-hero">
          <div>
            <div className="h">자동 동기화 켜짐</div>
            <div className="s">
              파일 시스템 이벤트를 직접 감시하여 외부 변경 사항을 즉시 반영합니다.
              운영체제에서 폴더에 직접 파일을 넣어도 됩니다.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="pill good"><span className="dot" /> 감시 중 6개 루트</span>
              <span className="pill"><Icon name="hdd" size={11} /> /Volumes/Storage/FSHS</span>
              <span className="pill"><Icon name="cpu" size={11} /> 색인 최신</span>
            </div>
          </div>
          <div className="status-ring">
            <Ring value={0.78} size={88} stroke={7} />
            <div className="v">78%</div>
          </div>
        </div>

        <div className="sync-grid">
          <div className="progress-card">
            <div className="label">현재 업로드</div>
            <div className="big">2.4 GB <span style={{ fontSize: 14, color: 'var(--fg-3)', fontWeight: 500 }}>/ 3.1 GB</span></div>
            <div className="meter"><i style={{ width: '77%' }} /></div>
            <div className="sub">family_dinner_2025.mp4 · 124 MB/s · 5초 남음</div>
          </div>
          <div className="progress-card">
            <div className="label">썸네일 생성 대기열</div>
            <div className="big">38 <span style={{ fontSize: 14, color: 'var(--fg-3)', fontWeight: 500 }}>/ 412</span></div>
            <div className="meter"><i style={{ width: '91%', background: 'var(--c-audio)' }} /></div>
            <div className="sub">이미지 24개, 비디오 14개 대기 중</div>
          </div>
        </div>

        <div className="sync-cols">
          <div className="activity-card">
            <div className="card-h">
              <div className="t">최근 동기화 활동</div>
              <div className="live">실시간</div>
            </div>
            {SYNC_RECENT.map((a, i) => (
              <div className="activity-row" key={i}>
                <div className={'ico ' + a.type}>
                  <Icon
                    name={a.type === 'add' ? 'plus' : a.type === 'change' ? 'refresh' : 'minus'}
                    size={12} color="#fff" stroke={2.5}
                  />
                </div>
                <div className="p">{a.path}</div>
                <div className="when">{a.at}</div>
              </div>
            ))}
          </div>

          <div className="scan-card">
            <div className="card-h">
              <div className="t">/Photos 스캔 중</div>
              <button className="btn ghost" style={{ height: 24, padding: '0 8px', fontSize: 12, color: 'var(--fg-3)' }}>일시중지</button>
            </div>
            <div className="scan-progress">
              <div className="ring">
                <Ring value={0.62} size={160} stroke={10} color="var(--c-audio)" />
                <div className="v">62<small>%</small></div>
              </div>
              <div className="info">
                <div className="h">파일 정보 읽는 중</div>
                <div className="d">/Photos/2025-11/IMG_4821.HEIC</div>
              </div>
              <div className="stats">
                <div className="s"><div className="v">2,348</div><div className="l">스캔 완료</div></div>
                <div className="s"><div className="v">1,464</div><div className="l">남음</div></div>
                <div className="s"><div className="v">42s</div><div className="l">예상</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const syncStyles = `
  .sync-hero{
    background:linear-gradient(135deg, var(--accent-soft), transparent 70%), var(--bg-2);
    border:.5px solid var(--border);
    border-radius:var(--radius-xl);
    padding:24px 28px;
    margin-bottom:20px;
    display:grid; grid-template-columns: 1fr auto; gap:20px; align-items:center;
  }
  .sync-hero .h{font-size:22px; font-weight:700; letter-spacing:-0.015em}
  .sync-hero .s{font-size:13px; color:var(--fg-3); margin-top:4px; max-width:580px; line-height:1.55}
  .sync-hero .status-ring{width:88px; height:88px; position:relative; display:grid; place-items:center;}
  .sync-hero .status-ring .v{position:absolute; font-weight:700; font-size:17px; font-variant-numeric:tabular-nums;}

  .sync-grid{display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:20px;}
  .progress-card{
    background:var(--bg-2); border:.5px solid var(--border);
    border-radius:var(--radius-lg); padding:18px;
  }
  .progress-card .label{font-size:12.5px; color:var(--fg-3); font-weight:500}
  .progress-card .big{font-size:24px; font-weight:700; margin-top:4px; letter-spacing:-0.01em}
  .progress-card .sub{font-size:12px; color:var(--fg-3); margin-top:6px}
  .progress-card .meter{margin-top:12px}

  .sync-cols{display:grid; grid-template-columns: 1.4fr 1fr; gap:16px;}
  .activity-card, .scan-card{
    background:var(--bg-2); border:.5px solid var(--border);
    border-radius:var(--radius-lg); overflow:hidden;
  }
  .card-h{
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px; border-bottom:.5px solid var(--hairline);
  }
  .card-h .t{font-weight:600; font-size:13.5px}
  .card-h .live{
    display:inline-flex; align-items:center; gap:5px;
    font-size:11px; color:var(--good); font-weight:500;
  }
  .card-h .live::before{
    content:''; width:6px; height:6px; border-radius:50%;
    background:var(--good); box-shadow:0 0 6px var(--good);
    animation:pulseDot 1.6s infinite;
  }
  @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.4}}

  .activity-row{
    display:grid; grid-template-columns: 24px 1fr auto;
    gap:12px; align-items:center;
    padding:9px 16px; border-top:.5px solid var(--hairline); font-size:12.5px;
  }
  .activity-row .ico{
    width:22px; height:22px; border-radius:50%; display:grid; place-items:center; color:#fff;
  }
  .activity-row .ico.add{background:var(--good)}
  .activity-row .ico.change{background:var(--warn)}
  .activity-row .ico.delete{background:var(--bad)}
  .activity-row .p{
    font-family:'JetBrains Mono',monospace;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--fg-2);
  }
  .activity-row .when{color:var(--fg-3); font-size:11.5px; font-variant-numeric:tabular-nums}

  .scan-progress{padding:18px}
  .scan-progress .ring{
    width:160px; height:160px; margin:0 auto;
    position:relative; display:grid; place-items:center;
  }
  .scan-progress .ring .v{
    position:absolute; font-size:30px; font-weight:700;
    letter-spacing:-0.02em; font-variant-numeric:tabular-nums;
  }
  .scan-progress .ring .v small{font-size:14px; color:var(--fg-3); font-weight:500}
  .scan-progress .info{margin-top:18px; text-align:center}
  .scan-progress .info .h{font-size:13.5px; font-weight:600}
  .scan-progress .info .d{
    font-size:11.5px; color:var(--fg-3); margin-top:4px;
    font-family:'JetBrains Mono',monospace;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .scan-progress .stats{
    display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:18px;
  }
  .scan-progress .stats .s{
    background:var(--bg-3); border-radius:8px; padding:8px 10px; text-align:center;
  }
  .scan-progress .stats .s .v{font-size:15px; font-weight:700; font-variant-numeric:tabular-nums}
  .scan-progress .stats .s .l{font-size:10.5px; color:var(--fg-3); margin-top:2px}
`;
