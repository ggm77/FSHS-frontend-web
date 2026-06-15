import { useState, useEffect, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import './styles.css';
import { Icon } from './components/Icon';
import { LoginScreen } from './screens/LoginScreen';
import { FilesScreen } from './screens/FilesScreen';
import { GalleryScreen } from './screens/GalleryScreen';
import { VideoScreen } from './screens/VideoScreen';
import { ViewerScreen } from './screens/ViewerScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ShareScreen } from './screens/ShareScreen';
import { UsersScreen } from './screens/UsersScreen';
import { AdminScreen } from './screens/AdminScreen';
import { TranscodingScreen } from './screens/TranscodingScreen';
import { logout } from './api/auth';
import { getUser } from './api/users';
import { ApiError } from './api/client';
import type { UserResponseDto, FileResponseDto } from './types';

type Screen = 'files' | 'gallery' | 'search' | 'share' | 'users' | 'settings' | 'admin' | 'transcoding';

// 미디어 재생 하위 페이지 라우트: /video/:fileId, /viewer/:fileId
// 경로형 URL이므로 정적 서버에 SPA fallback이 필요하다. (nginx: try_files $uri /index.html;)
type MediaRoute = { type: 'video' | 'viewer'; fileId: number } | null;
const LOGIN_PATH = '/login';
const LIGHT_THEME_COLOR = '#ffffff';
const DARK_THEME_COLOR = '#151922';
const VIDEO_THEME_COLOR = '#10131d';
const VIEWER_THEME_COLOR = '#0f1015';
let shellChromeUpdateId = 0;

function isLoginRoute(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`;
}

function getCurrentLocationPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getHistoryRedirectTo(): string {
  const state = window.history.state as { redirectTo?: unknown } | null;
  const redirectTo = typeof state?.redirectTo === 'string' ? state.redirectTo : '/';
  return isLoginRoute(redirectTo.split(/[?#]/, 1)[0]) ? '/' : redirectTo;
}

function parseMediaRoute(pathname: string): MediaRoute {
  const m = pathname.match(/^\/(video|viewer)\/(\d+)\/?$/);
  return m ? { type: m[1] as 'video' | 'viewer', fileId: Number(m[2]) } : null;
}

function setMetaContent(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function getBaseThemeColor(dark: boolean): string {
  return dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}

function getMediaThemeColor(type: NonNullable<MediaRoute>['type']): string {
  return type === 'video' ? VIDEO_THEME_COLOR : VIEWER_THEME_COLOR;
}

function getInitialDarkMode(): boolean {
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme === 'dark') return true;
  if (storedTheme === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function applyShellChrome(
  color: string,
  routeType: NonNullable<MediaRoute>['type'] | null,
  repeat = false,
) {
  const updateId = ++shellChromeUpdateId;

  const commit = () => {
    if (updateId !== shellChromeUpdateId) return;

    const root = document.getElementById('root');
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    document.documentElement.style.colorScheme = routeType || color === DARK_THEME_COLOR ? 'dark' : 'light';
    if (root) root.style.backgroundColor = color;

    if (routeType) {
      document.documentElement.dataset.mediaRoute = routeType;
      document.body.dataset.mediaRoute = routeType;
    } else {
      delete document.documentElement.dataset.mediaRoute;
      delete document.body.dataset.mediaRoute;
    }

    setMetaContent('theme-color', color);
    setMetaContent(
      'apple-mobile-web-app-status-bar-style',
      routeType || color === DARK_THEME_COLOR ? 'black-translucent' : 'default',
    );
  };

  commit();
  if (!repeat) return;

  window.requestAnimationFrame(commit);
  window.setTimeout(commit, 80);
  window.setTimeout(commit, 250);
}

function MediaShell({
  type,
  dark,
  children,
}: {
  type: NonNullable<MediaRoute>['type'];
  dark: boolean;
  children: ReactNode;
}) {
  const color = getMediaThemeColor(type);

  useLayoutEffect(() => {
    applyShellChrome(color, type, true);
    return () => applyShellChrome(getBaseThemeColor(dark), null, true);
  }, [color, dark, type]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5, background: color }}>
      {children}
    </div>
  );
}

// localStorage에 캐시된 사용자 정보를 안전하게 읽는다.
function loadCachedUser(): UserResponseDto | null {
  try {
    const stored = localStorage.getItem('user');
    return stored ? (JSON.parse(stored) as UserResponseDto) : null;
  } catch {
    return null;
  }
}

const NAV = [
  { group: '라이브러리', items: [
    { id: 'files',   label: '파일',   icon: 'files' },
    { id: 'gallery', label: '갤러리', icon: 'gallery' },
  ]},
  { group: '도구', items: [
    { id: 'search', label: '검색',   icon: 'search' },
    { id: 'share',  label: '공유',   icon: 'share' },
  ]},
  { group: '시스템', items: [
    { id: 'admin',        label: '대시보드',   icon: 'admin' },
    { id: 'users',        label: '사용자',     icon: 'users' },
    { id: 'transcoding',  label: '트랜스코딩', icon: 'cpu' },
  ]},
];

function Avatar({ username, size = 32 }: { username: string; size?: number }) {
  const hue = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      display: 'grid', placeItems: 'center',
      color: '#fff', fontWeight: 600, fontSize: size * 0.38, flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue} 78% 58%), #3158ff)`,
    }}>
      {initials}
    </div>
  );
}

function Sidebar({
  active,
  onNav,
  onRootClick,
  user,
  className,
}: {
  active: string;
  onNav: (id: string) => void;
  onRootClick: () => void;
  user: UserResponseDto | null;
  className?: string;
}) {
  return (
    <aside className={`sidebar ${className || ''}`}>
      <button
        type="button"
        className="sb-brand"
        onClick={onRootClick}
        title="루트 디렉토리로 이동"
        aria-label="루트 디렉토리로 이동"
      >
        <img src="/logo.png" alt="FSHS" className="sb-logo-img" />
        <div>
          <div className="name">FSHS</div>
          <div className="host">fshs.seohamin.com</div>
        </div>
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

function TopBar({ onSearch, dark, onToggleDark, onLogout, onMenuClick }: {
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
      <div className="mobile-title">FSHS</div>
      <div className="tb-spacer" />
      <div className="tb-search" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span className="t">전체 폴더 검색</span>
        <kbd>⌘K</kbd>
      </div>
      <button className="tb-icon" title={dark ? '라이트 모드' : '다크 모드'} onClick={onToggleDark}>
        <Icon name={dark ? 'sun' : 'moon'} size={18} />
      </button>
      <button className="tb-icon" title="로그아웃" onClick={onLogout}>
        <Icon name="logout" size={18} />
      </button>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => loadCachedUser() !== null);
  const [screen, setScreen] = useState<Screen>('files');
  const [dark, setDark] = useState(getInitialDarkMode);
  const [user, setUser] = useState<UserResponseDto | null>(() => loadCachedUser());
  const [mediaRoute, setMediaRoute] = useState<MediaRoute>(() => parseMediaRoute(window.location.pathname));
  const [loginRoute, setLoginRoute] = useState(() => isLoginRoute(window.location.pathname));
  // 목록에서 이미 받아 둔 파일 정보. 비디오 페이지가 메타데이터 재요청 없이 바로 재생을 시작하게 해준다.
  const [videoFile, setVideoFile] = useState<FileResponseDto | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useLayoutEffect(() => {
    if (mediaRoute) return;
    applyShellChrome(getBaseThemeColor(dark), null, true);
  }, [dark, mediaRoute]);

  useEffect(() => {
    // Initialize history state on mount
    if (!window.history.state) {
      window.history.replaceState(
        loginRoute ? { screen: 'login', redirectTo: '/' } : { screen: 'files' },
        '',
      );
    }

    // 주소(경로)와 history state를 화면에 동기화한다.
    // 경로가 미디어 라우트면 하위 페이지를 띄우고, 아니면 항목에 기록된 메인 화면을 복원한다.
    const syncFromLocation = () => {
      const isLogin = isLoginRoute(window.location.pathname);
      setLoginRoute(isLogin);
      if (isLogin) {
        setMediaRoute(null);
        setVideoFile(null);
        return;
      }

      const route = parseMediaRoute(window.location.pathname);
      setMediaRoute(route);
      if (!route) {
        setVideoFile(null);
        const state = window.history.state;
        if (state && state.screen) {
          setScreen(state.screen as Screen);
        } else if (state && state.type === 'folder') {
          // FilesScreen이 push한 폴더 탐색 항목
          setScreen('files');
        }
      }
    };

    // 미디어 하위 페이지 진입/이탈(뒤로·앞으로)과 폴더 탐색 항목 이동 모두 popstate로 돌아온다.
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [loginRoute]);

  useEffect(() => {
    const isLogin = isLoginRoute(window.location.pathname);

    if (authed) {
      if (!isLogin) return;

      const target = getHistoryRedirectTo();
      window.history.replaceState({ screen: 'files' }, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }

    if (isLogin) return;

    const redirectTo = getCurrentLocationPath();
    window.history.replaceState({ screen: 'login', redirectTo }, '', LOGIN_PATH);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [authed]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // 미디어 하위 페이지에서는 메인 화면이 보이지 않으므로 무시한다.
        if (parseMediaRoute(window.location.pathname)) return;
        setScreen('search');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const cached = loadCachedUser();
    if (!cached) return;

    // 캐시된 정보로 이미 로그인 상태를 보여주고 있으므로,
    // 백그라운드에서 세션이 유효한지만 조용히 확인한다.
    getUser(cached.id)
      .then(verified => {
        setUser(verified);
        localStorage.setItem('user', JSON.stringify(verified));
      })
      .catch(err => {
        // 세션이 실제로 만료/무효일 때(401·403)에만 로그아웃한다.
        // 네트워크 끊김이나 서버 일시 오류(5xx 등)로는 로그인을 풀지 않는다.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          localStorage.removeItem('user');
          setAuthed(false);
          setUser(null);
        }
      });
  }, []);

  // 로그인 상태에서 페이지가 열려 있는 동안 주기적으로 세션을 갱신한다.
  // 잠시 자리를 비워도 서버 세션 타임아웃으로 로그인이 풀리지 않게 해준다.
  // (모바일에서 앱을 장시간 백그라운드로 두면 타이머가 멈춰 효과가 제한적이다.)
  useEffect(() => {
    if (!authed || !user) return;
    const userId = user.id;
    const timer = setInterval(() => {
      getUser(userId).catch(err => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          localStorage.removeItem('user');
          setAuthed(false);
          setUser(null);
        }
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [authed, user]);

  async function handleSignIn(uname: string) {
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
    localStorage.removeItem('user');
    setLoginRoute(true);
    setMediaRoute(null);
    setVideoFile(null);
    setSidebarOpen(false);
    window.history.replaceState({ screen: 'login', redirectTo: '/' }, '', LOGIN_PATH);
  }

  function handleNav(id: string) {
    if (id === 'logout') { handleLogout(); return; }
    if (id === 'files') { handleRootClick(); return; }
    setScreen(id as Screen);
    window.history.replaceState({ screen: id }, '');
    setSidebarOpen(false);
  }

  function handleRootClick() {
    const alreadyAtRootDirectory = screen === 'files'
      && window.location.pathname === '/'
      && window.location.search === ''
      && window.location.hash === '';

    setScreen('files');
    setSidebarOpen(false);
    if (alreadyAtRootDirectory) {
      window.history.replaceState({ screen: 'files' }, '', '/');
    } else {
      window.history.pushState({ screen: 'files' }, '', '/');
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  // 미디어 하위 페이지로 이동한다. 떠나기 전에 현재 화면 이름을 현재 항목에 기록해 둔다.
  function openMediaPage(path: string) {
    const currentState = { ...((window.history.state || {}) as Record<string, unknown>) };
    delete currentState.path;
    window.history.replaceState({ ...currentState, screen }, '');
    // fromApp: 앱 내부에서 진입했다는 표시(뒤로가기 처리용).
    // pushState는 popstate를 발생시키지 않으므로 라우트 상태를 직접 갱신한다.
    window.history.pushState({ fromApp: true }, '', path);
    setMediaRoute(parseMediaRoute(path));
  }

  function openVideo(fileId: number, fileData?: FileResponseDto) {
    setVideoFile(fileData || null);
    openMediaPage(`/video/${fileId}`);
  }

  function openViewer(fileId: number) {
    openMediaPage(`/viewer/${fileId}`);
  }

  function handleBack() {
    if (window.history.state && window.history.state.fromApp) {
      window.history.back();
    } else {
      // 공유 링크 등으로 미디어 페이지에 바로 들어온 경우: 돌아갈 항목이 없으니 메인으로 교체한다.
      window.history.replaceState({ screen }, '', '/');
      setMediaRoute(null);
      setVideoFile(null);
    }
  }

  if (!authed) {
    return <LoginScreen onSignIn={handleSignIn} />;
  }

  if (loginRoute) {
    return null;
  }

  if (mediaRoute?.type === 'video') {
    return (
      <MediaShell type="video" dark={dark}>
        <VideoScreen fileId={mediaRoute.fileId} initialFile={videoFile} onBack={handleBack} />
      </MediaShell>
    );
  }

  if (mediaRoute?.type === 'viewer') {
    return (
      <MediaShell type="viewer" dark={dark}>
        <ViewerScreen fileId={mediaRoute.fileId} onBack={handleBack} />
      </MediaShell>
    );
  }

  const rootFolderId = user?.rootFolderId ?? null;

  return (
    <div className="app">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar active={screen} onNav={handleNav} onRootClick={handleRootClick} user={user} className={sidebarOpen ? 'open' : ''} />
      <main className="main">
        <TopBar
          onSearch={() => setScreen('search')}
          dark={dark}
          onToggleDark={() => setDark(v => !v)}
          onLogout={handleLogout}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {screen === 'files'   && <FilesScreen rootFolderId={rootFolderId} onOpenVideo={openVideo} onOpenFile={openViewer} />}
        {screen === 'gallery' && <GalleryScreen rootFolderId={rootFolderId} onOpenVideo={openVideo} onOpenFile={openViewer} />}
        {screen === 'search'  && <SearchScreen rootFolderId={rootFolderId} onOpenVideo={openVideo} />}
        {screen === 'share'   && <ShareScreen />}
        {screen === 'users'   && <UsersScreen currentUserId={user?.id ?? null} onUserUpdate={(u) => setUser(u)} />}
        {screen === 'settings'     && <UsersScreen currentUserId={user?.id ?? null} onUserUpdate={(u) => setUser(u)} />}
        {screen === 'admin'        && <AdminScreen />}
        {screen === 'transcoding'  && <TranscodingScreen />}
      </main>
    </div>
  );
}
