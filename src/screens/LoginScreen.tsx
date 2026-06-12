import { useState } from 'react';
import { Icon } from '../components/Icon';
import { login } from '../api/auth';

interface Props {
  onSignIn: (username: string) => void;
}

export function LoginScreen({ onSignIn }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username || !password) { setError('아이디와 비밀번호를 입력하세요.'); return; }
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      onSignIn(username);
    } catch {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <style>{loginStyles}</style>
      <div className="login-card">
        <div className="login-left">
          <div className="logo">
            <Icon name="cube" size={48} color="currentColor" stroke={2} />
          </div>
          {mode === 'login' ? (
            <>
              <h2>FSHS</h2>
              <div className="lead">My Private NAS</div>
            </>
          ) : (
            <>
              <h2>NAS 초기 설정</h2>
              <div className="lead">3단계만 거치면 바로 사용할 수 있어요.</div>
            </>
          )}
          <div className="feat-list">
            <div className="it">
              <div className="ic"><Icon name="zap" size={16} /></div>
              실시간 트랜스코딩으로 모든 코덱 재생
            </div>
            <div className="it">
              <div className="ic"><Icon name="sync" size={16} /></div>
              OS 폴더를 그대로 인식해 동기화
            </div>
            <div className="it">
              <div className="ic"><Icon name="shield" size={16} /></div>
              로컬 우선 · 데이터는 내 서버에만
            </div>
          </div>
        </div>

        {mode === 'login' ? (
          <div className="login-right">
            <div className="field">
              <div className="input">
                <span className="lbl">사용자 이름</span>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  autoFocus
                />
              </div>
            </div>
            <div className="field">
              <div className="input">
                <span className="lbl">비밀번호</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <button className="eye" onClick={() => setShowPw(v => !v)}>
                  <Icon name={showPw ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
            </div>
            {error && <div style={{ fontSize: 13, color: 'var(--bad)', marginBottom: 8 }}>{error}</div>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--fg-2)', margin: '4px 0 8px' }}>
              <input type="checkbox" defaultChecked /> 30일 동안 로그인 유지
            </label>
            <div className="login-actions">
              <button className="link-btn" onClick={() => setMode('setup')}>초기 설정</button>
              <button className="btn primary" onClick={handleLogin} disabled={loading}>
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </div>
            <div className="session-host">
              <div className="dot" />
              fshs2.seohamin.com
            </div>
          </div>
        ) : (
          <div className="login-right">
            <div className="setup-steps">
              <div className="num done"><Icon name="check" size={13} color="#fff" stroke={2.5} /></div>
              <div className="line done" />
              <div className="num done"><Icon name="check" size={13} color="#fff" stroke={2.5} /></div>
              <div className="line" />
              <div className="num cur">3</div>
            </div>
            <div className="field">
              <div className="input">
                <span className="lbl">관리자 이름</span>
                <input />
              </div>
            </div>
            <div className="field">
              <div className="input">
                <span className="lbl">저장소 루트 경로</span>
                <input defaultValue="/Volumes/Storage/FSHS" className="mono" style={{ fontSize: 14 }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 8, lineHeight: 1.5 }}>
                이미 파일이 있어도 괜찮아요. 자동으로 인식해 NAS처럼 사용합니다.
              </div>
            </div>
            <div className="field">
              <div className="input">
                <span className="lbl">비밀번호</span>
                <input type="password" />
              </div>
            </div>
            <div className="login-actions">
              <button className="link-btn" onClick={() => setMode('login')}>뒤로</button>
              <button className="btn primary">설정 완료</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const loginStyles = `
  .login-shell{
    min-height:100vh;
    width:100%;
    display:grid; place-items:center;
    background:
      radial-gradient(circle at 50% 0%, rgba(49, 88, 255, 0.10), transparent 34%),
      var(--bg-shell);
    padding:24px;
    box-sizing:border-box;
  }
  .login-card{
    width:100%;
    max-width:390px;
    min-height:0;
    background:var(--bg);
    border:1px solid var(--border-soft);
    border-radius:16px;
    box-shadow:var(--shadow-lg);
    display:grid;
    grid-template-columns:1fr;
    overflow:hidden;
  }
  .login-left{
    padding:54px 32px 18px;
    display:flex; flex-direction:column;
    align-items:center;
    text-align:center;
    background:var(--bg);
    color:var(--fg);
  }
  .login-left .logo{
    width:92px;
    height:92px;
    border-radius:26px;
    color:var(--accent);
    display:grid;
    place-items:center;
    margin-bottom:22px;
    background:
      linear-gradient(var(--bg), var(--bg)) padding-box,
      linear-gradient(135deg, rgba(49, 88, 255, .75), rgba(49, 88, 255, .20)) border-box;
    border:1px solid transparent;
    box-shadow:0 18px 44px rgba(49, 88, 255, .16);
  }
  .login-left h2{
    font-size:32px;
    font-weight:850;
    margin:0;
    line-height:1.1;
    color:var(--fg);
  }
  .login-left .lead{
    font-size:13.5px;
    line-height:1.55;
    color:var(--fg-3);
    margin-top:6px;
    max-width:260px;
  }
  .login-left .feat-list{
    display:none;
  }
  .login-left .feat-list .it{
    display:flex; align-items:center; gap:12px;
    font-size:13.5px; color:var(--fg);
  }
  .login-left .feat-list .it .ic{
    width:34px; height:34px; border-radius:10px;
    background:var(--accent-soft); color:var(--accent);
    display:grid; place-items:center; flex-shrink:0;
  }

  .login-right{
    min-width:0;
    padding:12px 28px 34px;
    display:flex; flex-direction:column; justify-content:center;
    background:var(--bg);
  }

  @media (max-width: 640px) {
    .login-shell{
      padding:14px;
      align-items:flex-start;
      justify-items:stretch;
      padding-top:env(safe-area-inset-top, 16px);
    }
    .login-card{
      width:100%;
      grid-template-columns:1fr;
      border-radius:16px;
    }
    .login-left{
      padding:48px 24px 18px;
    }
    .login-left .logo{
      width:88px;
      height:88px;
      border-radius:24px;
      margin-bottom:20px;
    }
    .login-left h2{
      font-size:31px;
    }
    .login-left .lead{
      font-size:13px;
    }
    .login-right{
      padding:10px 20px 28px;
    }
  }

  .field{margin-bottom:18px}
  .field .input{
    position:relative; min-width:0;
    display:flex; align-items:center;
    height:52px; padding:0 15px;
    background:var(--surface-1);
    border:1px solid var(--border);
    border-radius:8px;
    transition:border-color .15s, box-shadow .15s, background .15s;
  }
  .field .input:focus-within{
    background:var(--bg);
    border-color:var(--accent);
    box-shadow:0 0 0 3px rgba(49, 88, 255, .12);
  }
  .field .input input{
    flex:1; min-width:0; border:0; background:transparent; color:var(--fg);
    font:inherit; font-size:15px; outline:none;
  }
  .field .input .lbl{
    position:absolute;
    top:-9px;
    left:10px;
    background:var(--bg);
    padding:0 6px;
    white-space:nowrap;
    font-size:12px;
    color:var(--fg-3);
    font-weight:650;
  }
  .field .input .eye{background:transparent; border:0; color:var(--fg-3)}

  .login-actions{
    display:flex; align-items:center; justify-content:space-between;
    margin-top:8px;
  }
  .link-btn{
    background:transparent; border:0; color:var(--accent);
    font:inherit; font-size:14px; font-weight:600; white-space:nowrap;
    padding:8px 12px; border-radius:8px;
  }
  .link-btn:hover{background:var(--accent-soft)}
  .login-actions .btn.primary{height:40px; padding:0 24px; border-radius:8px}

  .session-host{
    margin-top:22px; padding-top:16px;
    border-top:1px solid var(--hairline);
    display:flex; align-items:center; gap:8px; color:var(--fg-4);
    font-size:12px;
  }
  .session-host .dot{width:7px; height:7px; border-radius:50%; background:var(--good)}

  .setup-steps{display:flex; gap:8px; margin-bottom:28px; align-items:center}
  .setup-steps .num{
    width:26px; height:26px; border-radius:50%;
    display:grid; place-items:center; font-size:12px; font-weight:600;
    background:var(--surface-2); color:var(--fg-3); flex-shrink:0;
  }
  .setup-steps .num.done{background:var(--accent); color:#fff}
  .setup-steps .num.cur{background:var(--accent-soft); color:var(--accent)}
  .setup-steps .line{flex:1; height:2px; background:var(--hairline)}
  .setup-steps .line.done{background:var(--accent)}
`;
