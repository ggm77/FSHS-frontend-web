import { useState, useEffect } from 'react';
import './styles.css';
import { Icon } from './components/Icon';
import { LoginScreen } from './screens/LoginScreen';
import { FilesScreen } from './screens/FilesScreen';
import { GalleryScreen } from './screens/GalleryScreen';
import { VideoScreen } from './screens/VideoScreen';
import { ViewerScreen } from './screens/ViewerScreen';
import { SearchScreen } from './screens/SearchScreen';
import { SyncScreen } from './screens/SyncScreen';
import { ShareScreen } from './screens/ShareScreen';
import { UsersScreen } from './screens/UsersScreen';
import { AdminScreen } from './screens/AdminScreen';
import { logout } from './api/auth';
import { getUser } from './api/users';
import type { UserResponseDto } from './types';

type Screen = 'files' | 'gallery' | 'video' | 'viewer' | 'search' | 'sync' | 'share' | 'users' | 'settings' | 'admin';

const NAV = [
  { group: '라이브러리', items: [
    { id: 'files',   label: '파일',   icon: 'files' },
    { id: 'gallery', label: '갤러리', icon: 'gallery' },
  ]},
  { group: '도구', items: [
    { id: 'search', label: '검색',   icon: 'search' },
    { id: 'sync',   label: '동기화', icon: 'sync' },
    { id: 'share',  label: '공유',   icon: 'share' },
  ]},
  { group: '시스템', items: [
    { id: 'admin',  label: '대시보드', icon: 'admin' },
    { id: 'users',  label: '사용자',   icon: 'users' },
  ]},
];

const CRUMBS: Record<string, string[]> = {
  files:   ['파일', '내 보관함'],
  gallery: ['갤러리'],
  search:  ['검색'],
  sync:    ['동기화'],
  share:   ['공유'],
  users:   ['사용자'],
  settings:['설정'],
  admin:   ['대시보드'],
};

function Avatar({ username, size = 32 }: { username: string; size?: number }) {
  const hue = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '9px',
      display: 'grid', placeItems: 'center',
      color: '#fff', fontWeight: 600, fontSize: size * 0.38, flexShrink: 0,
      background: `hsl(${hue} 46% 48%)`,
    }}>
      {initials}
    </div>
  );
}

function Sidebar({ active, onNav, user, className }: { active: string; onNav: (id: string) => void; user: UserResponseDto | null; className?: string }) {
  const storageUsed = 412;
  const storageTotal = 1024;
  const pct = Math.round((storageUsed / storageTotal) * 100);

  return (
    <aside className={`sidebar ${className || ''}`}>
      <div className="sb-brand">
        <div className="logo">F</div>
        <div>
          <div className="name">FSHS</div>
          <div className="host">fshs2.seohamin.com</div>
        </div>
      </div>
      <button className="sb-new" onClick={() => onNav('files')}>
        <Icon name="upload" size={18} color="currentColor" stroke={2} />
        업로드
      </button>
      <nav className="sb-nav">
        {NAV.map((g) => (
          <div className="sb-group" key={g.group}>
            <div className="gt">{g.group}</div>
            {g.items.map((item) => (
              <div key={item.id}
                className={'sb-item' + (active === item.id ? ' active' : '')}
                onClick={() => onNav(item.id)}>
                <Icon name={item.icon} size={19} stroke={1.7} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        <div className="sb-storage">
          <div className="meter"><i style={{ width: pct + '%' }} /></div>
          <div className="txt">{storageUsed} / {storageTotal} GB · {pct}%</div>
        </div>
        <div className="sb-user">
          {user && <Avatar username={user.username} size={34} />}
          <div className="meta">
            <div className="n">{user?.username || '—'}</div>
            <div className="e">{user?.role || ''}</div>
          </div>
          <button className="gear" onClick={() => onNav('settings')}>
            <Icon name="settings" size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ crumbs, onSearch, dark, onToggleDark, onLogout, onMenuClick }: {
  crumbs: string[];
  onSearch: () => void;
  dark: boolean;
  onToggleDark: () => void;
  onLogout: () => void;
  onMenuClick: () => void;
}) {
  return (
    <div className="topbar">
      <button className="tb-menu-btn" onClick={onMenuClick}>
        <Icon name="menu" size={20} stroke={2} />
      </button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {i > 0 && <span className="sep">›</span>}
            <span className={'c' + (i === crumbs.length - 1 ? ' cur' : '')}>{c}</span>
          </span>
        ))}
      </div>
      <div className="tb-search" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span className="t">검색</span>
        <kbd>⌘K</kbd>
      </div>
      <button className="tb-icon" title={dark ? '라이트 모드' : '다크 모드'} onClick={onToggleDark}>
        <Icon name={dark ? 'sun' : 'moon'} size={18} />
      </button>
      <button className="tb-icon" title="로그아웃" onClick={onLogout}>
        <Icon name="power" size={18} />
      </button>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [screen, setScreen] = useState<Screen>('files');
  const [dark, setDark] = useState(false);
  const [user, setUser] = useState<UserResponseDto | null>(null);
  const [_username, setUsername] = useState('');
  const [videoFileId, setVideoFileId] = useState<number | null>(null);
  const [viewerFileId, setViewerFileId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    // Initialize history state on mount
    if (!window.history.state) {
      window.history.replaceState({ screen: 'files' }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state && state.type === 'video') {
        setVideoFileId(state.fileId);
        setScreen('video');
      } else if (state && state.type === 'viewer') {
        setViewerFileId(state.fileId);
        setScreen('viewer');
      } else if (state && state.screen) {
        setScreen(state.screen);
        setVideoFileId(null);
        setViewerFileId(null);
      } else {
        setScreen('files');
        setVideoFileId(null);
        setViewerFileId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setScreen('search');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        const u: UserResponseDto = JSON.parse(stored);
        getUser(u.id)
          .then(verified => {
            setUser(verified);
            setAuthed(true);
            localStorage.setItem('user', JSON.stringify(verified));
          })
          .catch(() => {
            localStorage.removeItem('user');
            setAuthed(false);
            setUser(null);
          });
      } catch {
        localStorage.removeItem('user');
      }
    }
  }, []);

  async function handleSignIn(uname: string) {
    setUsername(uname);
    setAuthed(true);
    // Try to find the current user by trying sequential IDs
    for (let i = 1; i <= 20; i++) {
      try {
        const u = await getUser(i);
        if (u.username === uname) {
          setUser(u);
          localStorage.setItem('user', JSON.stringify(u));
          break;
        }
      } catch { break; }
    }
  }

  async function handleLogout() {
    await logout();
    setAuthed(false);
    setUser(null);
    setUsername('');
    localStorage.removeItem('user');
  }

  function handleNav(id: string) {
    if (id === 'logout') { handleLogout(); return; }
    setScreen(id as Screen);
    window.history.replaceState({ screen: id }, '');
    setSidebarOpen(false);
  }

  function openVideo(fileId: number) {
    setVideoFileId(fileId);
    setScreen('video');
    window.history.pushState({ type: 'video', fileId, fromScreen: screen }, '');
  }

  function openViewer(fileId: number) {
    setViewerFileId(fileId);
    setScreen('viewer');
    window.history.pushState({ type: 'viewer', fileId, fromScreen: screen }, '');
  }

  function handleBack() {
    if (window.history.state && (window.history.state.type === 'video' || window.history.state.type === 'viewer')) {
      window.history.back();
    } else {
      setScreen('files');
      setVideoFileId(null);
      setViewerFileId(null);
    }
  }

  if (!authed) {
    return <LoginScreen onSignIn={handleSignIn} />;
  }

  if (screen === 'video') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 5, background: '#000' }}>
        <VideoScreen fileId={videoFileId} onBack={handleBack} />
      </div>
    );
  }

  if (screen === 'viewer') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 5, background: '#0f1015' }}>
        <ViewerScreen fileId={viewerFileId} onBack={handleBack} />
      </div>
    );
  }

  const rootFolderId = user?.rootFolderId ?? null;

  return (
    <div className="app">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar active={screen} onNav={handleNav} user={user} className={sidebarOpen ? 'open' : ''} />
      <main className="main">
        <TopBar
          crumbs={CRUMBS[screen] || ['홈']}
          onSearch={() => setScreen('search')}
          dark={dark}
          onToggleDark={() => setDark(v => !v)}
          onLogout={handleLogout}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {screen === 'files'   && <FilesScreen rootFolderId={rootFolderId} onOpenVideo={openVideo} onOpenFile={openViewer} />}
        {screen === 'gallery' && <GalleryScreen rootFolderId={rootFolderId} onOpenVideo={openVideo} onOpenFile={openViewer} />}
        {screen === 'search'  && <SearchScreen rootFolderId={rootFolderId} onOpenVideo={openVideo} />}
        {screen === 'sync'    && <SyncScreen />}
        {screen === 'share'   && <ShareScreen />}
        {screen === 'users'   && <UsersScreen currentUserId={user?.id ?? null} />}
        {screen === 'settings'&& <UsersScreen currentUserId={user?.id ?? null} />}
        {screen === 'admin'   && <AdminScreen />}
      </main>
    </div>
  );
}
