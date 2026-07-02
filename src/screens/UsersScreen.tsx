import { useState, useEffect } from 'react';
import { getUser, updateUser } from '../api/users';
import { Icon } from '../components/Icon';
import type { UserResponseDto } from '../types';

interface Props {
  currentUserId?: number | null;
  onUserUpdate?: (user: UserResponseDto) => void;
}

export function UsersScreen({ currentUserId, onUserUpdate }: Props) {
  const [user, setUser] = useState<UserResponseDto | null>(null);
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      ) : (
        <div style={{ color: 'var(--bad)', padding: 20 }}>사용자 정보를 불러올 수 없습니다. 로그인이 필요합니다.</div>
      )}
    </div>
  );
}

const userScreenStyles = `
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

  .avatar-meta .role-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 650;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 3px 8px;
    border-radius: 6px;
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
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
`;
