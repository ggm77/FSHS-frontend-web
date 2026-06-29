import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { getFile, getFileThumbnailUrl } from '../api/files';
import { deleteShare, getSharedFileUrl, getUserShares } from '../api/shares';
import type { FileResponseDto, ShareResponseDto } from '../types';
import { copyTextToClipboard } from '../utils/clipboard';

interface ShareScreenProps {
  currentUserId: number | null;
  onOpenVideo: (fileId: number, fileData?: FileResponseDto) => void;
  onOpenFile: (fileId: number) => void;
}

let shareScrollTop = 0;

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function toAbsoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function formatDisplayPath(path: string | null | undefined): string {
  const trimmed = path?.trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function getFileIcon(file: FileResponseDto | undefined): string {
  if (!file) return 'doc';
  const extension = file.extension.toLowerCase();
  if (extension === 'pdf') return 'pdf';
  if (extension === 'zip' || extension === 'rar' || extension === '7z') return 'archive';
  if (extension === 'pptx' || extension === 'pptm' || extension === 'ppt') return 'presentation';
  if (file.category === 'IMAGE') return 'image';
  if (file.category === 'VIDEO') return 'videoFile';
  if (file.category === 'AUDIO') return 'audioFile';
  return 'doc';
}

function getFileIconColor(file: FileResponseDto | undefined): string {
  if (!file) return 'var(--c-doc)';
  if (file.extension.toLowerCase() === 'pdf') return 'var(--c-pdf)';
  if (file.category === 'IMAGE') return 'var(--c-image)';
  if (file.category === 'VIDEO') return 'var(--c-video)';
  if (file.category === 'AUDIO') return 'var(--c-audio)';
  if (file.category === 'ARCHIVE') return 'var(--c-folder)';
  return 'var(--c-doc)';
}

function ShareFileThumb({ file }: { file: FileResponseDto | undefined }) {
  const [failed, setFailed] = useState(false);
  const hasThumbnail = !!file && (file.category === 'IMAGE' || file.category === 'VIDEO') && !failed;

  return (
    <span className="share-file-thumb">
      {hasThumbnail ? (
        <img
          src={getFileThumbnailUrl(file.uuid)}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name={getFileIcon(file)} size={20} color={getFileIconColor(file)} stroke={1.7} />
      )}
    </span>
  );
}

export function ShareScreen({ currentUserId, onOpenVideo, onOpenFile }: ShareScreenProps) {
  const [shares, setShares] = useState<ShareResponseDto[]>([]);
  const [filesById, setFilesById] = useState<Record<number, FileResponseDto>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShareResponseDto | null>(null);
  const [copiedShare, setCopiedShare] = useState<{ share: ShareResponseDto; fileName: string; copied: boolean } | null>(null);
  const shareContentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = shareContentRef.current;
    if (!el || shareScrollTop <= 0) return;
    el.scrollTop = Math.min(shareScrollTop, Math.max(0, el.scrollHeight - el.clientHeight));
  }, [loading, shares.length]);

  useEffect(() => {
    const el = shareContentRef.current;
    if (!el) return;
    const handleScroll = () => {
      shareScrollTop = el.scrollTop;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      shareScrollTop = el.scrollTop;
      el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const loadShares = useCallback(async () => {
    if (currentUserId == null) {
      setShares([]);
      setFilesById({});
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await getUserShares(currentUserId);
      setShares(data.shares);

      const fileIds = Array.from(new Set(data.shares.map(share => share.fileId)));
      const fileResults = await Promise.allSettled(fileIds.map(fileId => getFile(fileId)));
      const nextFiles: Record<number, FileResponseDto> = {};

      fileResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          nextFiles[fileIds[index]] = result.value;
        }
      });

      setFilesById(nextFiles);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '공유 링크 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  function handleOpenPreview(file: FileResponseDto | undefined) {
    if (!file) return;
    if (shareContentRef.current) shareScrollTop = shareContentRef.current.scrollTop;
    if (file.category === 'VIDEO') onOpenVideo(file.id, file);
    else onOpenFile(file.id);
  }

  async function handleCopy(share: ShareResponseDto, file: FileResponseDto | undefined, e: React.MouseEvent) {
    e.stopPropagation();
    const fileName = file?.name ?? '파일 정보를 불러오지 못했습니다';
    let copied = false;

    try {
      await copyTextToClipboard(toAbsoluteUrl(getSharedFileUrl(share.shareKey)));
      copied = true;
      setCopiedId(share.id);
      window.setTimeout(() => {
        setCopiedId(prev => prev === share.id ? null : prev);
      }, 1600);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '공유 링크를 복사하지 못했습니다.'));
    }

    setCopiedShare({ share, fileName, copied });
  }

  async function handleCopyModalLink() {
    if (!copiedShare) return;

    try {
      await copyTextToClipboard(toAbsoluteUrl(getSharedFileUrl(copiedShare.share.shareKey)));
      setCopiedId(copiedShare.share.id);
      setCopiedShare(prev => prev ? { ...prev, copied: true } : prev);
      window.setTimeout(() => {
        setCopiedId(prev => prev === copiedShare.share.id ? null : prev);
      }, 1600);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '공유 링크를 복사하지 못했습니다.'));
    }
  }

  function handleDeleteClick(share: ShareResponseDto, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTarget(share);
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;

    setDeletingId(deleteTarget.id);
    setError('');

    try {
      await deleteShare(deleteTarget.id);
      setShares(prev => prev.filter(share => share.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '공유 링크를 삭제하지 못했습니다.'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <style>{shareStyles}</style>
      <div ref={shareContentRef} className="content share-content">
        <div className="page-h">
          <div>
            <h1>공유 링크</h1>
            <div className="sub">
              {currentUserId == null ? '사용자 정보를 확인하는 중' : `${shares.length}개 공유 링크`}
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={loadShares} disabled={currentUserId == null || loading}>
              <Icon name={loading ? 'spinner' : 'refresh'} size={15} className={loading ? 'spin-icon' : undefined} />
              새로고침
            </button>
          </div>
        </div>

        {error && <div className="share-error">{error}</div>}

        {currentUserId == null ? (
          <div className="share-empty">
            <Icon name="user" size={32} stroke={1.4} />
            <strong>사용자 정보를 불러오지 못했습니다</strong>
            <span>다시 로그인한 뒤 공유 링크 목록을 확인하세요.</span>
          </div>
        ) : loading ? (
          <div className="share-loading">
            <Icon name="spinner" size={24} className="spin-icon" />
          </div>
        ) : shares.length === 0 ? (
          <div className="share-empty">
            <Icon name="share" size={32} stroke={1.4} />
            <strong>생성된 공유 링크가 없습니다</strong>
            <span>파일 목록에서 파일의 공유 버튼을 눌러 공유 링크를 만들 수 있습니다.</span>
          </div>
        ) : (
          <div className="card share-list">
            <div className="share-row share-head">
              <div>파일</div>
              <div />
            </div>
            {shares.map(share => {
              const file = filesById[share.fileId];

              return (
                <div
                  className={`share-row${file ? ' clickable' : ' unavailable'}`}
                  key={share.id}
                  onClick={() => handleOpenPreview(file)}
                >
                  <div className="share-file">
                    <ShareFileThumb file={file} />
                    <span className="share-file-text">
                      <strong>{file?.name ?? '파일 정보를 불러오지 못했습니다'}</strong>
                      <small>{formatDisplayPath(file?.parentPath)}</small>
                    </span>
                  </div>
                  <div className="share-actions" onClick={e => e.stopPropagation()}>
                    <button className="share-copy-btn" title="링크 복사" onClick={e => handleCopy(share, file, e)}>
                      <Icon name={copiedId === share.id ? 'check' : 'copy'} size={15} />
                      <span>{copiedId === share.id ? '복사됨' : '링크 복사'}</span>
                    </button>
                    <button
                      className="icon-btn danger"
                      title="공유 링크 삭제"
                      onClick={e => handleDeleteClick(share, e)}
                      disabled={deletingId !== null}
                    >
                      <Icon name={deletingId === share.id ? 'spinner' : 'trash'} size={15} className={deletingId === share.id ? 'spin-icon' : undefined} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal share-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>공유 링크 삭제</h3>
              <button className="close-btn" onClick={() => setDeleteTarget(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p>이 공유 링크를 삭제하면 더 이상 접근할 수 없습니다.</p>
              <code className="mono">{toAbsoluteUrl(getSharedFileUrl(deleteTarget.shareKey))}</code>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteTarget(null)} disabled={deletingId !== null}>취소</button>
              <button className="btn danger" onClick={handleDeleteConfirmed} disabled={deletingId !== null}>
                <Icon name={deletingId === deleteTarget.id ? 'spinner' : 'trash'} size={14} className={deletingId === deleteTarget.id ? 'spin-icon' : undefined} />
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {copiedShare && (
        <div className="modal-backdrop" onClick={() => setCopiedShare(null)}>
          <div className="modal share-created-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>공유 링크</h3>
                <p>{copiedShare.fileName}</p>
              </div>
            </div>
            <div className="modal-body">
              <label className="share-created-field">
                <span>공유 링크</span>
                <input
                  readOnly
                  value={toAbsoluteUrl(getSharedFileUrl(copiedShare.share.shareKey))}
                  onFocus={e => e.currentTarget.select()}
                />
              </label>
              <div className={copiedShare.copied ? 'share-copy-note good' : 'share-copy-note'}>
                {copiedShare.copied ? '링크를 클립보드에 복사했습니다.' : '링크 복사가 필요하면 아래 버튼을 눌러주세요.'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setCopiedShare(null)}>닫기</button>
              <button className="btn primary" onClick={handleCopyModalLink}>
                <Icon name={copiedShare.copied ? 'check' : 'copy'} size={14} color="var(--accent-fg)" />
                {copiedShare.copied ? '복사됨' : '링크 복사'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const shareStyles = `
  .share-content {
    padding-top: 18px;
  }

  .share-error {
    padding: 12px 14px;
    margin-bottom: 14px;
    border-radius: 8px;
    background: rgba(239, 68, 68, .1);
    color: var(--bad);
    font-weight: 650;
  }

  .share-loading {
    display: grid;
    place-items: center;
    padding: 64px 0;
    color: var(--fg-3);
  }

  .share-empty {
    min-height: 260px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;
    color: var(--fg-3);
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: 12px;
    background: var(--bg);
  }

  .share-empty strong {
    color: var(--fg);
    font-size: 15px;
  }

  .share-empty span {
    max-width: 320px;
    padding: 0 16px;
    line-height: 1.5;
  }

  .share-list {
    overflow: hidden;
    background: var(--bg);
    border-color: var(--border-soft);
    border-radius: 12px;
  }

  .share-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 172px;
    align-items: center;
    gap: 14px;
    min-height: 64px;
    padding: 0 14px;
    border-top: 1px solid var(--hairline);
  }

  .share-row.clickable {
    cursor: pointer;
  }

  .share-row.clickable:hover {
    background: var(--surface-1);
  }

  .share-row.unavailable {
    color: var(--fg-3);
  }

  .share-row.share-head {
    min-height: 40px;
    border-top: 0;
    background: var(--bg-3);
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 800;
  }

  .share-file {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .share-file-thumb {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--accent-soft);
  }

  .share-file-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .share-file-text {
    display: grid;
    min-width: 0;
  }

  .share-file-text strong,
  .share-file-text small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .share-file-text strong {
    color: var(--fg);
    font-size: 13px;
    font-weight: 750;
  }

  .share-file-text small {
    color: var(--fg-3);
    font-size: 12px;
  }

  .share-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .share-actions .danger:hover {
    color: var(--bad);
  }

  .share-copy-btn {
    height: 36px;
    min-width: 94px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: var(--accent-soft);
    color: var(--accent);
    font: inherit;
    font-size: 13px;
    font-weight: 750;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }

  .share-copy-btn:hover {
    background: var(--surface-1);
  }

  .share-created-modal {
    width: min(520px, calc(100vw - 32px));
    background: var(--bg);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }

  .share-created-modal .modal-header {
    padding: 18px 20px 14px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--hairline);
  }

  .share-created-modal h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: var(--fg);
  }

  .share-created-modal .modal-header p {
    margin: 4px 0 0;
    color: var(--fg-3);
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 360px;
  }

  .share-created-modal .modal-body {
    padding: 18px 20px;
    display: grid;
    gap: 12px;
  }

  .share-created-field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .share-created-field span {
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 750;
  }

  .share-created-field input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-1);
    color: var(--fg);
    padding: 9px 10px;
    font: inherit;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .share-copy-note {
    color: var(--fg-3);
    font-size: 12.5px;
  }

  .share-copy-note.good {
    color: var(--good);
    font-weight: 700;
  }

  .share-created-modal .modal-footer {
    padding: 12px 20px 18px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--hairline);
  }

  .share-confirm-modal {
    width: min(420px, calc(100vw - 32px));
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg);
  }

  .share-confirm-modal .modal-header,
  .share-confirm-modal .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--hairline);
  }

  .share-confirm-modal .modal-footer {
    justify-content: flex-end;
    border-top: 1px solid var(--hairline);
    border-bottom: 0;
  }

  .share-confirm-modal h3,
  .share-confirm-modal p {
    margin: 0;
  }

  .share-confirm-modal h3 {
    font-size: 16px;
    font-weight: 800;
  }

  .share-confirm-modal .modal-body {
    padding: 18px;
    display: grid;
    gap: 12px;
    color: var(--fg-2);
  }

  .share-confirm-modal code {
    padding: 9px 10px;
    border-radius: 8px;
    background: var(--surface-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .share-list {
      overflow-x: auto;
    }

    .share-row {
      grid-template-columns: minmax(150px, 1fr) 172px;
      min-width: 360px;
      min-height: 70px;
      padding: 10px 12px;
      gap: 8px;
    }

    .share-row.share-head {
      min-height: 40px;
    }

    .share-copy-btn {
      width: auto;
      min-width: 94px;
      padding: 0 12px;
      justify-content: center;
      gap: 7px;
    }
  }
`;
