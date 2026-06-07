import { useState } from 'react';
import { Icon } from '../components/Icon';

const SHARE_LINKS = [
  { name: '가족여행_2025.zip',  url: 'fshs.local/s/x7Kp2a9', password: true,  expires: '7일 후',  downloads: 12, status: 'active' },
  { name: '제주도_사진모음',    url: 'fshs.local/s/m3Nq8bR', password: false, expires: '2일 후',  downloads: 28, status: 'active' },
  { name: '발표자료_최종.pdf',  url: 'fshs.local/s/yA1zF4t', password: true,  expires: '무제한',  downloads: 4,  status: 'active' },
  { name: '연말정산자료',       url: 'fshs.local/s/qWe5dHj', password: true,  expires: '만료됨',  downloads: 7,  status: 'expired' },
  { name: '회의녹화.mp4',       url: 'fshs.local/s/oP9bN3v', password: false, expires: '14일 후', downloads: 0,  status: 'active' },
];

const stats = [
  { v: 5,  l: '활성 링크',     ic: 'link' },
  { v: 51, l: '총 다운로드',   ic: 'download' },
  { v: 3,  l: '비밀번호 보호', ic: 'lock' },
  { v: 1,  l: '만료된 링크',   ic: 'warn' },
];

export function ShareScreen() {
  const [copied, setCopied] = useState<number | null>(null);

  function copyUrl(url: string, i: number) {
    navigator.clipboard.writeText('https://' + url).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <>
      <style>{shareStyles}</style>
      <div className="content">
        <div className="page-h">
          <div>
            <h1>공유 링크</h1>
            <div className="sub">외부 사용자가 접근할 수 있는 공유 링크를 관리합니다.</div>
          </div>
          <div className="actions">
            <button className="btn primary"><Icon name="plus" size={14} color="var(--accent-fg)" /> 새 링크</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {stats.map((s, i) => (
            <div key={i} className="share-stat">
              <div className="ic"><Icon name={s.ic} size={18} /></div>
              <div>
                <div className="v">{s.v}</div>
                <div className="l">{s.l}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="share-grid">
          <div className="card">
            <div className="share-row head">
              <div>파일</div>
              <div>링크</div>
              <div>만료</div>
              <div style={{ textAlign: 'right' }}>다운로드</div>
              <div>상태</div>
              <div />
            </div>
            {SHARE_LINKS.map((s, i) => (
              <div key={i} className="share-row">
                <div className="share-name">
                  <div className="ic"><Icon name="link" size={14} color="#fff" /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{s.name}</div>
                    {s.password && (
                      <div className="pw"><Icon name="lock" size={10} /> 비밀번호 보호</div>
                    )}
                  </div>
                </div>
                <div className="share-url">
                  <Icon name="globe" size={12} color="var(--fg-3)" />
                  <span className="u">{s.url}</span>
                  <button title={copied === i ? '복사됨!' : '복사'} onClick={() => copyUrl(s.url, i)}>
                    <Icon name={copied === i ? 'check' : 'copy'} size={13} />
                  </button>
                </div>
                <div style={{ fontSize: 12.5, color: s.status === 'expired' ? 'var(--bad)' : 'var(--fg-2)' }}>
                  {s.expires}
                </div>
                <div style={{ fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {s.downloads}회
                </div>
                <div>
                  {s.status === 'expired'
                    ? <span className="pill bad"><span className="dot" /> 만료</span>
                    : <span className="pill good"><span className="dot" /> 활성</span>
                  }
                </div>
                <button className="row-action" style={{ opacity: 1 }}><Icon name="more" size={14} /></button>
              </div>
            ))}
          </div>

          <div className="share-detail">
            <div className="detail-card">
              <div className="detail-head">
                <div className="hi">
                  <div className="preview" />
                  <div>
                    <div className="t">제주도_사진모음</div>
                    <div className="s">128개 항목 · 2.4 GB</div>
                  </div>
                </div>
              </div>
              <div className="share-link-out">
                <div className="qr-mock" />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-3)' }}>공유 URL</div>
                  <div className="u mono" style={{ fontSize: 12.5, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>https://fshs.local/s/m3Nq8bR</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" style={{ height: 26, fontSize: 12 }}>
                      <Icon name="copy" size={12} /> 복사
                    </button>
                    <button className="btn" style={{ height: 26, fontSize: 12 }}>
                      <Icon name="qr" size={12} /> QR
                    </button>
                  </div>
                </div>
              </div>
              <hr className="hr" />
              <div className="detail-body">
                <div className="opt-row">
                  <label>비밀번호 보호 <button className="toggle"><i /></button></label>
                  <div className="input">
                    <Icon name="lock" size={13} color="var(--fg-3)" />
                    <input placeholder="자동 생성됨" defaultValue="aB3xK9" style={{ fontFamily: 'JetBrains Mono, monospace' }} />
                  </div>
                </div>
                <div className="opt-row">
                  <label>만료일</label>
                  <div className="input">
                    <Icon name="bell" size={13} color="var(--fg-3)" />
                    <input defaultValue="2일 후 (2025년 11월 28일)" />
                  </div>
                </div>
                <div className="opt-row">
                  <label>다운로드 횟수 제한 <button className="toggle on"><i /></button></label>
                  <div className="input">
                    <Icon name="download" size={13} color="var(--fg-3)" />
                    <input defaultValue="50회" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const shareStyles = `
  .share-stat{
    background:var(--bg-2); border:.5px solid var(--border);
    border-radius:var(--radius-lg); padding:16px;
    display:flex; gap:14px; align-items:center;
  }
  .share-stat .ic{
    width:38px; height:38px; border-radius:10px;
    display:grid; place-items:center;
    background:var(--accent-soft); color:var(--accent);
  }
  .share-stat .v{font-size:22px; font-weight:700; letter-spacing:-0.01em}
  .share-stat .l{font-size:12px; color:var(--fg-3); margin-top:2px}

  .share-grid{display:grid; grid-template-columns:1fr; gap:18px; margin-bottom:20px;}

  .share-row{
    display:grid;
    grid-template-columns: minmax(0,2.2fr) minmax(0,2.2fr) 100px 100px 80px 32px;
    align-items:center; gap:14px;
    padding:12px 16px;
    border-top:.5px solid var(--hairline);
  }
  .share-row.head{
    border-top:0; padding-top:0; padding-bottom:10px;
    color:var(--fg-3); font-size:11.5px; font-weight:600;
    text-transform:uppercase; letter-spacing:0.04em;
  }
  .share-name{display:flex; align-items:center; gap:10px; min-width:0}
  .share-name .ic{
    width:32px; height:32px; border-radius:7px;
    background:linear-gradient(135deg, hsl(195 60% 50%), hsl(220 65% 35%));
    display:grid; place-items:center; flex-shrink:0;
  }
  .share-name .nm{font-weight:500; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .share-name .pw{font-size:11px; color:var(--fg-3); margin-top:1px; display:flex; align-items:center; gap:4px}
  .share-url{
    display:flex; align-items:center; gap:8px;
    background:var(--bg-3); padding:6px 10px;
    border-radius:7px; font-family:'JetBrains Mono',monospace;
    font-size:11.5px; color:var(--fg-2); min-width:0;
  }
  .share-url .u{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1}
  .share-url button{background:transparent; border:0; color:var(--fg-3); padding:0; display:grid; place-items:center;}
  .share-url button:hover{color:var(--fg)}

  .share-detail{max-width:520px;}
  .detail-card{
    background:var(--bg-2); border:.5px solid var(--border);
    border-radius:var(--radius-lg); overflow:hidden;
  }
  .detail-head{padding:18px; background:var(--bg-2); border-bottom:1px solid var(--hairline);}
  .detail-head .hi{display:flex; align-items:center; gap:10px;}
  .detail-head .preview{
    width:52px; height:52px; border-radius:10px;
    background:linear-gradient(135deg, hsl(210 45% 60%), hsl(232 48% 46%));
    flex-shrink:0;
  }
  .detail-head .t{font-weight:600; font-size:14.5px}
  .detail-head .s{font-size:12px; color:var(--fg-3); margin-top:2px}

  .share-link-out{
    margin:6px 16px 16px; padding:14px;
    background:var(--bg-3); border-radius:10px;
    display:flex; align-items:center; gap:10px;
  }
  .qr-mock{
    width:88px; height:88px; border-radius:8px;
    background:
      radial-gradient(circle at 20% 20%, var(--fg) 20%, transparent 21%),
      radial-gradient(circle at 80% 20%, var(--fg) 20%, transparent 21%),
      radial-gradient(circle at 20% 80%, var(--fg) 20%, transparent 21%),
      repeating-conic-gradient(var(--fg) 0deg 90deg, transparent 90deg 180deg);
    background-size: 12% 12%, 12% 12%, 12% 12%, 14% 14%;
    background-color: var(--bg-2);
    background-repeat: no-repeat, no-repeat, no-repeat, repeat;
    background-position: 4px 4px, calc(100% - 4px) 4px, 4px calc(100% - 4px), 0 0;
    padding:6px; flex-shrink:0;
  }

  .detail-body{padding:18px; display:flex; flex-direction:column; gap:14px}
  .opt-row{display:flex; flex-direction:column; gap:6px}
  .opt-row > label{font-size:12px; font-weight:600; color:var(--fg-2); display:flex; align-items:center; justify-content:space-between}
  .opt-row > label .toggle{
    position:relative; width:32px; height:18px; border:0; border-radius:99px;
    background:rgba(0,0,0,0.15); padding:0; cursor:pointer;
  }
  [data-theme="dark"] .opt-row > label .toggle{background:rgba(255,255,255,0.15)}
  .opt-row > label .toggle.on{background:var(--accent)}
  .opt-row > label .toggle i{
    position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%;
    background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.25); transition:transform .15s;
  }
  .opt-row > label .toggle.on i{transform:translateX(14px)}
  .opt-row .input{
    display:flex; align-items:center; gap:8px;
    height:34px; padding:0 10px;
    background:var(--bg-3); border:.5px solid var(--border); border-radius:8px;
  }
  .opt-row .input input{
    flex:1; border:0; background:transparent; color:var(--fg);
    font:inherit; outline:none; font-size:13px;
  }
`;
