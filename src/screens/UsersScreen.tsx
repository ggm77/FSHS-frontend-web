import { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { getUser, createUser, deleteUser } from '../api/users';
import type { UserResponseDto } from '../types';

interface Props {
  currentUserId: number | null;
}

function Avatar({ username, size = 34 }: { username: string; size?: number }) {
  const hue = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 9,
      display: 'grid', placeItems: 'center',
      color: '#fff', fontWeight: 600, fontSize: size * 0.38, flexShrink: 0,
      background: `hsl(${hue} 46% 48%)`,
    }}>
      {initials}
    </div>
  );
}

export function UsersScreen({ currentUserId }: Props) {
  const [users, setUsers] = useState<UserResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [darkMode, setDarkMode] = useState(document.body.getAttribute('data-theme') === 'dark');

  useEffect(() => {
    loadUsers();
  }, [currentUserId]);

  async function loadUsers() {
    if (currentUserId == null) return;
    setLoading(true);
    const loaded: UserResponseDto[] = [];
    for (let i = 1; i <= 20; i++) {
      try {
        const u = await getUser(i);
        loaded.push(u);
      } catch {
        if (loaded.length > 0) break;
      }
    }
    setUsers(loaded);
    setLoading(false);
  }

  async function handleAddUser() {
    if (!newUsername || !newPassword) return;
    setAdding(true);
    try {
      await createUser(newUsername, newPassword);
      setShowAdd(false);
      setNewUsername('');
      setNewPassword('');
      loadUsers();
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!confirm('사용자를 삭제하시겠습니까?')) return;
    await deleteUser(userId);
    loadUsers();
  }

  return (
    <>
      <style>{usersStyles}</style>
      <div className="content">
        <div className="page-h">
          <div>
            <h1>사용자</h1>
            <div className="sub">NAS에 접근할 수 있는 계정을 관리합니다.</div>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => setShowAdd(v => !v)}>
              <Icon name="plus" size={14} color="var(--accent-fg)" /> 사용자 추가
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="card card-pad" style={{ marginBottom: 20, maxWidth: 400 }}>
            <div style={{ fontWeight: 600, marginBottom: 14 }}>새 사용자</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                placeholder="사용자 이름"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', font: 'inherit', background: 'var(--bg)', color: 'var(--fg)', outline: 'none' }}
              />
              <input
                type="password"
                placeholder="비밀번호"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', font: 'inherit', background: 'var(--bg)', color: 'var(--fg)', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={handleAddUser} disabled={adding}>
                  {adding ? '추가 중...' : '추가'}
                </button>
                <button className="btn" onClick={() => setShowAdd(false)}>취소</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--fg-3)' }}>
            <Icon name="spinner" size={24} />
          </div>
        ) : (
          <div className="users-grid">
            {users.map((u) => (
              <div className="user-card" key={u.id}>
                <button className="more" onClick={() => handleDeleteUser(u.id)}>
                  <Icon name="trash" size={14} />
                </button>
                <div className="top">
                  <Avatar username={u.username} size={44} />
                  <div style={{ minWidth: 0 }}>
                    <div className="n">
                      {u.username}
                      {u.role === 'ADMIN' && <span className="pill info" style={{ fontSize: 10 }}>관리자</span>}
                    </div>
                    <div className="e">{u.role}</div>
                  </div>
                </div>
                <div className="stats">
                  <div>
                    <div className="k">루트 폴더 ID</div>
                    <div className="v">{u.rootFolderId ?? '미설정'}</div>
                  </div>
                  <div>
                    <div className="k">생성일</div>
                    <div className="v">{u.createdAt.slice(0, 10)}</div>
                  </div>
                </div>
              </div>
            ))}

            {users.length === 0 && !loading && (
              <div style={{ color: 'var(--fg-3)', padding: 40 }}>
                사용자를 불러오지 못했습니다. 관리자 권한이 필요할 수 있습니다.
              </div>
            )}
          </div>
        )}

        <div className="page-h" style={{ marginTop: 8 }}>
          <div><h1 style={{ fontSize: 18 }}>일반 설정</h1></div>
        </div>

        <div className="settings-card">
          {[
            {
              ic: 'moon', t: '외관', d: '라이트 / 다크 모드',
              ctrl: (
                <div className="seg">
                  <button className={!darkMode ? 'on' : ''} onClick={() => { setDarkMode(false); document.body.setAttribute('data-theme', 'light'); }}>라이트</button>
                  <button className={darkMode ? 'on' : ''} onClick={() => { setDarkMode(true); document.body.setAttribute('data-theme', 'dark'); }}>다크</button>
                </div>
              ),
            },
            { ic: 'lock', t: '2단계 인증', d: '추가 보안 레이어를 활성화합니다', ctrl: <button className="stoggle on"><i /></button> },
            { ic: 'zap', t: '하드웨어 가속', d: 'GPU를 사용해 트랜스코딩을 가속합니다', ctrl: <button className="stoggle on"><i /></button> },
            { ic: 'cast', t: '원격 접근', d: '외부 네트워크에서 접근을 허용합니다', ctrl: <button className="stoggle"><i /></button> },
            { ic: 'power', t: 'UPS 연동', d: '무정전 전원 장치와 연결되어 안전한 종료를 수행합니다', ctrl: <span className="pill warn"><span className="dot" />연결 안 됨</span> },
          ].map((r, i) => (
            <div className="settings-row" key={i}>
              <div className="ic"><Icon name={r.ic} size={16} /></div>
              <div>
                <div className="t">{r.t}</div>
                <div className="d">{r.d}</div>
              </div>
              <div className="ctrl">{r.ctrl}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const usersStyles = `
  .users-grid{
    display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px; margin-bottom:24px;
  }
  .user-card{
    background:var(--bg-2); border:.5px solid var(--border);
    border-radius:var(--radius-lg); padding:18px; position:relative;
  }
  .user-card .top{display:flex; align-items:center; gap:12px;}
  .user-card .n{font-weight:600; font-size:14px; letter-spacing:-0.005em; display:flex; align-items:center; gap:6px}
  .user-card .e{font-size:11.5px; color:var(--fg-3); margin-top:2px}
  .user-card .more{
    position:absolute; top:14px; right:14px;
    width:28px; height:28px; border-radius:7px;
    background:transparent; border:0; color:var(--fg-3);
    display:grid; place-items:center;
  }
  .user-card .more:hover{background:rgba(220,75,62,0.1); color:var(--bad)}
  .user-card .stats{
    margin-top:14px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:11.5px;
  }
  .user-card .stats .k{color:var(--fg-3); margin-bottom:2px}
  .user-card .stats .v{font-weight:600; font-size:13px}

  .settings-card{
    background:var(--bg-2); border:.5px solid var(--border);
    border-radius:var(--radius-lg); padding:0;
  }
  .settings-row{
    display:flex; align-items:center; gap:14px;
    padding:14px 18px; border-top:.5px solid var(--hairline);
  }
  .settings-row:first-child{border-top:0}
  .settings-row .ic{
    width:32px; height:32px; border-radius:8px;
    background:var(--bg-3); display:grid; place-items:center; color:var(--fg-2);
  }
  .settings-row .t{font-weight:500; font-size:13.5px}
  .settings-row .d{font-size:11.5px; color:var(--fg-3); margin-top:2px}
  .settings-row .ctrl{margin-left:auto}
  .stoggle{
    position:relative; width:36px; height:22px; border:0; border-radius:99px;
    background:rgba(0,0,0,0.15); padding:0; cursor:pointer;
  }
  [data-theme="dark"] .stoggle{background:rgba(255,255,255,0.15)}
  .stoggle.on{background:var(--accent)}
  .stoggle i{
    position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%;
    background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.2); transition:transform .15s;
  }
  .stoggle.on i{transform:translateX(14px)}
`;
