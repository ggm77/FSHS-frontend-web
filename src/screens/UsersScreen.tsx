import { useState, useEffect, useRef } from 'react';
import { getFolder } from '../api/folders';
import { createUser, getUser, updateUser } from '../api/users';
import { Icon } from '../components/Icon';
import type { CreateUserResponseDto, FolderResponseDto, SimpleFolderResponseDto, UserResponseDto } from '../types';

interface Props {
  currentUserId?: number | null;
  onUserUpdate?: (user: UserResponseDto) => void;
  allowUserCreation?: boolean;
}

type FolderPathItem = Pick<SimpleFolderResponseDto, 'id' | 'name'>;

function parsePositiveId(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatFolderPath(folder: Pick<SimpleFolderResponseDto, 'name' | 'relativePath'>): string {
  const path = folder.relativePath?.trim();
  if (!path) return `/${folder.name}`;
  return path.startsWith('/') ? path : `/${path}`;
}

export function UsersScreen({ currentUserId, onUserUpdate, allowUserCreation = false }: Props) {
  const [user, setUser] = useState<UserResponseDto | null>(null);
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRootFolderId, setCreateRootFolderId] = useState('');
  const [selectedRootFolderLabel, setSelectedRootFolderLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<CreateUserResponseDto | null>(null);
  const [folderPickerFolder, setFolderPickerFolder] = useState<FolderResponseDto | null>(null);
  const [folderPickerPath, setFolderPickerPath] = useState<FolderPathItem[]>([]);
  const [folderPickerLoading, setFolderPickerLoading] = useState(false);
  const [folderPickerError, setFolderPickerError] = useState<string | null>(null);
  const folderPickerRequestRef = useRef(0);
  const canCreateUsers = allowUserCreation && user?.role === 'ADMIN';

  useEffect(() => {
    if (!currentUserId) return;
    setLoading(true);
    getUser(currentUserId)
      .then(u => {
        setUser(u);
        setUsername(u.username);
      })
      .catch(() => {
        setError('사용자 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentUserId]);

  useEffect(() => {
    if (!canCreateUsers || !user?.rootFolderId) {
      setFolderPickerFolder(null);
      setFolderPickerPath([]);
      return;
    }

    loadFolderForPicker(user.rootFolderId);
  }, [canCreateUsers, user?.rootFolderId]);

  async function loadFolderForPicker(folderId: number, nextPath?: FolderPathItem[]) {
    const requestId = folderPickerRequestRef.current + 1;
    folderPickerRequestRef.current = requestId;
    setFolderPickerLoading(true);
    setFolderPickerError(null);

    try {
      const folder = await getFolder(folderId);
      if (folderPickerRequestRef.current !== requestId) return;

      setFolderPickerFolder(folder);
      setFolderPickerPath(nextPath ?? [{ id: folder.id, name: folder.name }]);
      setCreateRootFolderId(current => current || String(folder.id));
      setSelectedRootFolderLabel(current => current || formatFolderPath(folder));
    } catch (err: unknown) {
      if (folderPickerRequestRef.current !== requestId) return;
      setFolderPickerError(err instanceof Error && err.message ? err.message : '폴더 목록을 불러오지 못했습니다.');
    } finally {
      if (folderPickerRequestRef.current === requestId) {
        setFolderPickerLoading(false);
      }
    }
  }

  function selectRootFolder(folder: Pick<SimpleFolderResponseDto, 'id' | 'name' | 'relativePath'>) {
    setCreateRootFolderId(String(folder.id));
    setSelectedRootFolderLabel(formatFolderPath(folder));
    setCreateError(null);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    const nextUsername = createUsername.trim();
    const nextPassword = createPassword.trim();
    const rootFolderId = parsePositiveId(createRootFolderId);

    if (!nextUsername || !nextPassword) {
      setCreateError('아이디와 비밀번호를 입력하세요.');
      setCreatedUser(null);
      return;
    }

    if (!rootFolderId) {
      setCreateError('루트 폴더를 선택하세요.');
      setCreatedUser(null);
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreatedUser(null);

    try {
      const created = await createUser({
        username: nextUsername,
        password: nextPassword,
        rootFolderId,
      });
      setCreatedUser(created);
      setCreateUsername('');
      setCreatePassword('');
    } catch (err: unknown) {
      setCreateError(err instanceof Error && err.message ? err.message : '사용자 생성 중 오류가 발생했습니다.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const nextUsername = username.trim();
    const nextCurrentPassword = currentPassword.trim();
    const nextNewPassword = newPassword.trim();

    if (!currentUserId || !nextUsername) return;
    if (!nextCurrentPassword || !nextNewPassword) {
      setError('현재 비밀번호와 새 비밀번호를 입력하세요.');
      setSuccess(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updated = await updateUser(currentUserId, {
        username: nextUsername,
        currentPassword: nextCurrentPassword,
        newPassword: nextNewPassword,
      });
      const updatedUser: UserResponseDto = {
        id: updated.id ?? user?.id ?? currentUserId,
        username: updated.username,
        role: updated.role,
        rootFolderId: updated.rootFolderId,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };

      setUser(updatedUser);
      setUsername(updatedUser.username);
      setCurrentPassword('');
      setNewPassword('');
      setSuccess(true);

      // Update localStorage to sync with App state
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      // Update parent component state immediately
      onUserUpdate?.(updatedUser);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : '사용자 정보 수정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content">
      <style>{userScreenStyles}</style>
      <div className="page-h">
        <div>
          <h1>사용자 정보 수정</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--fg-3)', fontSize: 13 }}>내 프로필 정보와 비밀번호를 변경할 수 있습니다.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--fg-3)' }}>
          <Icon name="spinner" size={24} className="spin-icon" />
        </div>
      ) : user ? (
        <div className="users-layout">
          <div className="profile-card">
            <form onSubmit={handleSave}>
              <div className="avatar-section">
                <div className="large-avatar">
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="avatar-meta">
                  <div className="name">{user.username}</div>
                  <div className="role-badge">{user.role}</div>
                </div>
              </div>

              <div className="form-group">
                <label>아이디</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  placeholder="아이디를 입력하세요"
                />
              </div>

              <div className="form-group">
                <label>현재 비밀번호</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  placeholder="현재 비밀번호 입력"
                />
              </div>

              <div className="form-group">
                <label>새 비밀번호</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  placeholder="새 비밀번호 입력"
                />
              </div>

              {error && <div className="status-message error">{error}</div>}
              {success && <div className="status-message success">정보가 성공적으로 수정되었습니다.</div>}

              <div className="form-actions">
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? (
                    <>
                      <Icon name="spinner" size={14} className="spin-icon" style={{ marginRight: 6 }} />
                      저장 중...
                    </>
                  ) : '변경사항 저장'}
                </button>
              </div>
            </form>
          </div>

          {canCreateUsers && (
            <div className="profile-card create-user-card">
              <div className="card-title-row">
                <div>
                  <h2>일반 유저 추가</h2>
                </div>
                <span className="role-badge">USER</span>
              </div>

              <form onSubmit={handleCreateUser}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>아이디</label>
                    <input
                      type="text"
                      value={createUsername}
                      onChange={e => setCreateUsername(e.target.value)}
                      required
                      placeholder="새 사용자 아이디"
                    />
                  </div>

                  <div className="form-group">
                    <label>비밀번호</label>
                    <input
                      type="password"
                      value={createPassword}
                      onChange={e => setCreatePassword(e.target.value)}
                      required
                      placeholder="초기 비밀번호"
                    />
                  </div>
                </div>

                <div className="folder-picker">
                  <div className="folder-picker-selected">
                    <span>선택된 루트 폴더</span>
                    <strong>{selectedRootFolderLabel || '선택 필요'}</strong>
                  </div>

                  <div className="folder-picker-toolbar">
                    <div className="folder-breadcrumbs">
                      {folderPickerPath.map((item, index) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => loadFolderForPicker(item.id, folderPickerPath.slice(0, index + 1))}
                          disabled={folderPickerLoading}
                        >
                          {index === 0 ? '루트' : item.name}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn picker-select-current"
                      onClick={() => folderPickerFolder && selectRootFolder(folderPickerFolder)}
                      disabled={!folderPickerFolder || folderPickerLoading}
                    >
                      현재 폴더 선택
                    </button>
                  </div>

                  <div className="folder-picker-list-wrap" aria-busy={folderPickerLoading}>
                    <div className="folder-picker-list">
                      {folderPickerError && !folderPickerFolder ? (
                        <div className="folder-picker-empty error">{folderPickerError}</div>
                      ) : folderPickerFolder && folderPickerFolder.folders.length > 0 ? (
                        folderPickerFolder.folders.map(folder => (
                          <div className="folder-picker-row" key={folder.id}>
                            <button
                              type="button"
                              className="folder-row-main"
                              onClick={() => selectRootFolder(folder)}
                            >
                              <Icon name="folder" size={17} color="var(--c-folder)" stroke={1.7} />
                              <span>
                                <strong>{folder.name}</strong>
                                <small>{formatFolderPath(folder)}</small>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="folder-open-btn"
                              onClick={() => loadFolderForPicker(folder.id, [...folderPickerPath, { id: folder.id, name: folder.name }])}
                            >
                              열기
                            </button>
                          </div>
                        ))
                      ) : folderPickerFolder ? (
                        <div className="folder-picker-empty">하위 폴더가 없습니다.</div>
                      ) : (
                        <div className="folder-picker-empty">선택할 수 있는 폴더를 불러오지 못했습니다.</div>
                      )}
                    </div>
                    {folderPickerLoading && (
                      <div className="folder-picker-loading">
                        <Icon name="spinner" size={16} className="spin-icon" />
                        폴더를 불러오는 중...
                      </div>
                    )}
                  </div>
                </div>

                {createError && <div className="status-message error">{createError}</div>}
                {createdUser && (
                  <div className="status-message success">
                    {createdUser.username} 사용자를 생성했습니다.
                  </div>
                )}

                <div className="form-actions">
                  <button type="submit" className="btn primary" disabled={creating}>
                    {creating ? (
                      <>
                        <Icon name="spinner" size={14} className="spin-icon" style={{ marginRight: 6 }} />
                        생성 중...
                      </>
                    ) : '일반 유저 생성'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--bad)', padding: 20 }}>사용자 정보를 불러올 수 없습니다. 로그인이 필요합니다.</div>
      )}
    </div>
  );
}

const userScreenStyles = `
  .users-layout {
    display: grid;
    grid-template-columns: minmax(320px, 480px) minmax(360px, 620px);
    gap: 20px;
    align-items: start;
  }

  .profile-card {
    background: var(--bg-2);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 26px;
    max-width: 480px;
    margin-top: 20px;
    box-shadow: var(--shadow-sm);
    animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .create-user-card {
    max-width: 620px;
  }

  .card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 22px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--hairline);
  }

  .card-title-row h2 {
    margin: 0;
    color: var(--fg);
    font-size: 18px;
    line-height: 1.25;
  }

  .card-title-row p {
    margin: 5px 0 0;
    color: var(--fg-3);
    font-size: 12.5px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(15px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .avatar-section {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--hairline);
  }

  .large-avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), #5d7cff);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 22px;
    font-weight: 700;
    box-shadow: 0 10px 24px rgba(49, 88, 255, 0.20);
  }

  .avatar-meta .name {
    font-size: 16px;
    font-weight: 600;
    color: var(--fg);
  }

  .role-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 650;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 3px 8px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .avatar-meta .role-badge {
    margin-top: 4px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 20px;
  }

  .form-group label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--fg-2);
  }

  .form-group label .hint {
    font-weight: normal;
    color: var(--fg-3);
    font-size: 11.5px;
    margin-left: 4px;
  }

  .form-group input {
    height: 42px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--fg);
    padding: 0 12px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: all 0.2s ease;
  }

  .form-group input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .folder-picker {
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--surface-1);
    margin: 0 0 20px;
    overflow: hidden;
  }

  .folder-picker-selected {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--hairline);
    background: var(--bg);
  }

  .folder-picker-selected span {
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 650;
  }

  .folder-picker-selected strong {
    min-width: 0;
    color: var(--fg);
    font-size: 12.5px;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-picker-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--hairline);
  }

  .folder-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
  }

  .folder-breadcrumbs button {
    height: 28px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--fg-2);
    padding: 0 8px;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }

  .folder-breadcrumbs button:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .picker-select-current {
    height: 30px;
    padding: 0 10px;
    font-size: 12px;
    flex-shrink: 0;
  }

  .folder-picker-list-wrap {
    position: relative;
    min-height: 260px;
  }

  .folder-picker-list {
    height: 260px;
    max-height: 260px;
    overflow: auto;
  }

  .folder-picker-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--fg-2);
    font-size: 12.5px;
    font-weight: 650;
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    backdrop-filter: blur(1px);
    pointer-events: none;
  }

  .folder-picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--hairline);
  }

  .folder-picker-row:last-child {
    border-bottom: 0;
  }

  .folder-row-main {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    background: transparent;
    color: var(--fg);
    text-align: left;
    padding: 6px;
    border-radius: 8px;
  }

  .folder-row-main:hover {
    background: var(--bg);
  }

  .folder-row-main span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .folder-row-main strong,
  .folder-row-main small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-row-main strong {
    color: var(--fg);
    font-size: 13px;
  }

  .folder-row-main small {
    color: var(--fg-3);
    font-size: 11.5px;
  }

  .folder-open-btn {
    height: 30px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg-2);
    padding: 0 10px;
    font-size: 12px;
    font-weight: 650;
  }

  .folder-open-btn:hover {
    background: var(--surface-2);
    color: var(--accent);
  }

  .folder-picker-empty {
    min-height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: var(--fg-3);
    font-size: 12.5px;
    text-align: center;
  }

  .folder-picker-empty.error {
    color: var(--bad);
  }

  .status-message {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 20px;
    animation: fadeIn 0.2s ease;
  }

  .status-message.success {
    background: rgba(46, 204, 113, 0.12);
    color: #27ae60;
    border: 1px solid rgba(46, 204, 113, 0.2);
  }

  .status-message.error {
    background: rgba(231, 76, 60, 0.12);
    color: #c0392b;
    border: 1px solid rgba(231, 76, 60, 0.2);
  }

  .form-actions {
    margin-top: 10px;
  }

  .form-actions button {
    width: 100%;
    height: 42px;
    font-weight: 600;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spin-icon {
    animation: spin 1s linear infinite;
  }

  @media (max-width: 1120px) {
    .users-layout {
      grid-template-columns: minmax(0, 620px);
    }
  }

  @media (max-width: 640px) {
    .profile-card {
      padding: 18px;
      border-radius: 10px;
      max-width: none;
    }

    .form-grid {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .folder-picker-selected,
    .folder-picker-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .folder-picker-selected strong {
      text-align: left;
    }

    .picker-select-current {
      width: 100%;
      justify-content: center;
    }
  }
`;
