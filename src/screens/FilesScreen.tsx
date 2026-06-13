import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Icon } from '../components/Icon';
import { getFolder, createFolder, deleteFolder, renameFolder, downloadFolderContent } from '../api/folders';
import { uploadFile, deleteFile, formatBytes, getFileStatus, moveFile, downloadFileContent, getFileThumbnailUrl } from '../api/files';
import type { FolderResponseDto, SimpleFolderResponseDto, FileResponseDto } from '../types';
import type { DownloadProgress } from '../api/download';

interface Props {
  rootFolderId: number | null;
  onOpenVideo: (fileId: number, fileData?: FileResponseDto) => void;
  onOpenFile: (fileId: number) => void;
}

const CATEGORY_ICON: Record<string, string> = {
  IMAGE: 'image', VIDEO: 'videoFile', AUDIO: 'audioFile',
  DOCUMENT: 'doc', ARCHIVE: 'archive', ETC: 'doc', UNKNOWN: 'doc',
};

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  title?: string;
  ellipsis?: boolean;
}

type FolderPathItem = { id: number; name: string };
type HistoryMode = 'push' | 'replace' | 'none';
type FileSortKey = 'name' | 'originUpdatedAt' | 'size';
type SortDirection = 'asc' | 'desc';
type SortableFileItem = Pick<SimpleFolderResponseDto, 'id' | 'name' | 'originUpdatedAt'> & {
  size?: number;
};

const SORT_OPTIONS: { key: FileSortKey; label: string }[] = [
  { key: 'name', label: '이름순' },
  { key: 'originUpdatedAt', label: '수정일순' },
  { key: 'size', label: '크기순' },
];

const WINDOWS_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function getFolderIdFromHash(): number | null {
  let hash = '';
  try {
    hash = decodeURIComponent(window.location.hash.slice(1).trim());
  } catch {
    return null;
  }

  if (!hash) return null;

  const match = hash.match(/^(?:folder\/|folder=)?(\d+)$/);
  if (!match) return null;

  const folderId = Number(match[1]);
  return Number.isSafeInteger(folderId) && folderId > 0 ? folderId : null;
}

function getFolderHashUrl(folderId: number, rootFolderId: number | null): string {
  const baseUrl = `${window.location.pathname}${window.location.search}`;
  return rootFolderId != null && folderId === rootFolderId ? baseUrl : `${baseUrl}#${folderId}`;
}

function FileIcon({ file, size = 20 }: { file: FileResponseDto; size?: number }) {
  const iconName = file.extension === 'pdf' ? 'pdf'
    : file.extension === 'zip' || file.extension === 'rar' || file.extension === '7z' ? 'archive'
    : file.extension === 'tsx' || file.extension === 'ts' || file.extension === 'js' ? 'code'
    : file.extension === 'docx' || file.extension === 'doc' ? 'doc'
    : CATEGORY_ICON[file.category] || 'doc';

  const color = file.extension === 'pdf' ? 'var(--c-pdf)'
    : file.category === 'IMAGE' ? 'var(--c-image)'
    : file.category === 'VIDEO' ? 'var(--c-video)'
    : file.category === 'AUDIO' ? 'var(--c-audio)'
    : file.category === 'ARCHIVE' ? 'var(--c-folder)'
    : 'var(--c-doc)';

  return <Icon name={iconName} size={size} color={color} stroke={1.7} />;
}

function FileThumbnail({ file, size = 20 }: { file: FileResponseDto; size?: number }) {
  const [failed, setFailed] = useState(false);
  const hasThumbnail = file.category === 'IMAGE' || file.category === 'VIDEO';
  if (!hasThumbnail || failed) return <FileIcon file={file} size={size} />;
  return (
    <img
      src={getFileThumbnailUrl(file.uuid)}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 'inherit' }}
      onError={() => setFailed(true)}
    />
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getOriginUpdatedTime(item: SortableFileItem): number {
  const time = Date.parse(item.originUpdatedAt);
  return Number.isNaN(time) ? 0 : time;
}

function getSortSize(item: SortableFileItem): number | null {
  return typeof item.size === 'number' ? item.size : null;
}

function compareSortableItems(
  a: SortableFileItem,
  b: SortableFileItem,
  sortKey: FileSortKey,
  direction: SortDirection,
): number {
  let primary = 0;

  if (sortKey === 'name') {
    primary = WINDOWS_NAME_COLLATOR.compare(a.name, b.name);
  } else if (sortKey === 'originUpdatedAt') {
    primary = getOriginUpdatedTime(a) - getOriginUpdatedTime(b);
  } else {
    const aSize = getSortSize(a);
    const bSize = getSortSize(b);
    primary = aSize != null && bSize != null ? aSize - bSize : 0;
  }

  if (primary !== 0) return direction === 'asc' ? primary : -primary;

  const byName = WINDOWS_NAME_COLLATOR.compare(a.name, b.name);
  if (byName !== 0) return byName;
  return a.id - b.id;
}

function sortFileItems<T extends SortableFileItem>(
  items: T[],
  sortKey: FileSortKey,
  direction: SortDirection,
): T[] {
  return [...items].sort((a, b) => compareSortableItems(a, b, sortKey, direction));
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function FilesScreen({ rootFolderId, onOpenVideo, onOpenFile }: Props) {
  const [folder, setFolder] = useState<FolderResponseDto | null>(null);
  const [path, setPath] = useState<FolderPathItem[]>([]);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sortKey, setSortKey] = useState<FileSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  interface UploadItem {
    name: string;
    pct: number;
    status: 'UPLOADING' | 'PROCESSING' | 'COMPLETE' | 'ERROR';
  }

  interface DialogConfig {
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }

  interface DownloadState {
    key: string;
    name: string;
    loadedBytes: number;
    totalBytes: number | null;
  }

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [movingItem, setMovingItem] = useState<{ type: 'file' | 'folder'; id: number; name: string } | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadStatus, setShowUploadStatus] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [error, setError] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMenuPos, setSortMenuPos] = useState<{ top: number; right: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showSortMenu) return;
    function handleOutside(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)
        && sortBtnRef.current && !sortBtnRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showSortMenu]);

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : rootFolderId;
  const downloadingKey = downloadState?.key ?? null;
  const sortedFolders = useMemo(
    () => folder ? sortFileItems(folder.folders, sortKey, sortDirection) : [],
    [folder, sortDirection, sortKey],
  );
  const sortedFiles = useMemo(
    () => folder ? sortFileItems(folder.files, sortKey, sortDirection) : [],
    [folder, sortDirection, sortKey],
  );

  const syncFolderHistory = useCallback((folderId: number, mode: HistoryMode) => {
    if (mode === 'none') return;

    const state = folderId === rootFolderId
      ? { screen: 'files' }
      : { type: 'folder', screen: 'files', folderId };
    const url = getFolderHashUrl(folderId, rootFolderId);

    if (mode === 'push') {
      window.history.pushState(state, '', url);
    } else {
      window.history.replaceState(state, '', url);
    }
  }, [rootFolderId]);

  const buildPathToFolder = useCallback(async (target: FolderResponseDto): Promise<FolderPathItem[]> => {
    if (rootFolderId == null || target.id === rootFolderId || target.isRoot) return [];

    const nextPath: FolderPathItem[] = [{ id: target.id, name: target.name }];
    const seen = new Set<number>([target.id]);
    let parentFolderId: number | null = target.parentFolderId ?? null;

    while (parentFolderId != null && parentFolderId !== rootFolderId && !seen.has(parentFolderId)) {
      seen.add(parentFolderId);
      const parent = await getFolder(parentFolderId);
      if (parent.id === rootFolderId || parent.isRoot) break;

      nextPath.unshift({ id: parent.id, name: parent.name });
      parentFolderId = parent.parentFolderId ?? null;
    }

    return nextPath;
  }, [rootFolderId]);

  const loadFolder = useCallback(async (
    folderId: number,
    reset = false,
    nextPath?: FolderPathItem[],
  ): Promise<FolderResponseDto | null> => {
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const data = await getFolder(folderId);
      setFolder(data);
      if (nextPath) setPath(nextPath);
      else if (reset) setPath([]);
      return data;
    } catch {
      setError('폴더를 불러오지 못했습니다.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFolderFromLocation = useCallback(async (historyMode: HistoryMode) => {
    if (rootFolderId == null) return;

    const folderId = getFolderIdFromHash() ?? rootFolderId;
    const data = await loadFolder(folderId, folderId === rootFolderId);
    if (!data) return;

    try {
      const nextPath = await buildPathToFolder(data);
      setPath(nextPath);
      syncFolderHistory(data.id, historyMode);
    } catch {
      const nextPath = data.id === rootFolderId || data.isRoot ? [] : [{ id: data.id, name: data.name }];
      setPath(nextPath);
      syncFolderHistory(data.id, historyMode);
    }
  }, [buildPathToFolder, loadFolder, rootFolderId, syncFolderHistory]);

  useEffect(() => {
    if (rootFolderId == null) return;
    loadFolderFromLocation('replace');
  }, [loadFolderFromLocation, rootFolderId]);

  useEffect(() => {
    const handleLocationChange = () => {
      if (rootFolderId == null) return;
      loadFolderFromLocation('replace');
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [loadFolderFromLocation, rootFolderId]);

  function navigateTo(f: SimpleFolderResponseDto) {
    const newPath = [...path, { id: f.id, name: f.name }];
    setPath(newPath);
    loadFolder(f.id);
    syncFolderHistory(f.id, 'push');
  }

  function navigateBreadcrumb(idx: number) {
    if (idx < 0) {
      setPath([]);
      loadFolder(rootFolderId!);
      syncFolderHistory(rootFolderId!, 'push');
    } else {
      const newPath = path.slice(0, idx + 1);
      const target = newPath[idx];
      setPath(newPath);
      loadFolder(target.id);
      syncFolderHistory(target.id, 'push');
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || currentFolderId == null) return;
    setCreatingFolder(true);
    setError('');
    try {
      await createFolder(currentFolderId, newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
      loadFolder(currentFolderId);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '폴더를 만들지 못했습니다.'));
    } finally {
      setCreatingFolder(false);
    }
  }

  function handleDeleteFolder(folderId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setDialog({
      type: 'confirm',
      title: '폴더 삭제',
      message: '폴더를 삭제하시겠습니까? 폴더 안의 모든 파일과 하위 폴더도 함께 삭제됩니다.',
      onConfirm: async () => {
        try {
          await deleteFolder(folderId);
          loadFolder(currentFolderId!);
        } catch (err: unknown) {
          setDialog({
            type: 'alert',
            title: '삭제 실패',
            message: getErrorMessage(err, '폴더를 삭제하지 못했습니다.'),
            onConfirm: () => setDialog(null)
          });
          return;
        }
        setDialog(null);
      }
    });
  }

  function handleDeleteFile(fileId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setDialog({
      type: 'confirm',
      title: '파일 삭제',
      message: '파일을 삭제하시겠습니까? 삭제된 파일은 복구할 수 없습니다.',
      onConfirm: async () => {
        try {
          await deleteFile(fileId);
          loadFolder(currentFolderId!);
        } catch (err: unknown) {
          setDialog({
            type: 'alert',
            title: '삭제 실패',
            message: getErrorMessage(err, '파일을 삭제하지 못했습니다.'),
            onConfirm: () => setDialog(null)
          });
          return;
        }
        setDialog(null);
      }
    });
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !currentFolderId) return;
    const filesArray = Array.from(files);
    
    // Initialize items
    const newItems: UploadItem[] = filesArray.map(f => ({
      name: f.name,
      pct: 0,
      status: 'UPLOADING'
    }));
    
    setUploadItems(newItems);
    setShowUploadStatus(true);
    setUploading(true);

    const pollingPromises: Promise<void>[] = [];

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        
        // 1. Upload the file
        const uuid = await uploadFile(currentFolderId, file, (pct) => {
          setUploadItems(prev => prev.map(item => 
            item.name === file.name ? { ...item, pct } : item
          ));
        });

        // 2. Upload complete, transition to PROCESSING
        setUploadItems(prev => prev.map(item => 
          item.name === file.name ? { ...item, pct: 100, status: 'PROCESSING' } : item
        ));

        // 3. Start polling in the background (non-blocking)
        const pollPromise = new Promise<void>((resolve) => {
          const interval = setInterval(async () => {
            try {
              const res = await getFileStatus(uuid);
              if (res.status === 'COMPLETE') {
                clearInterval(interval);
                setUploadItems(prev => prev.map(item => 
                  item.name === file.name ? { ...item, status: 'COMPLETE' } : item
                ));
                loadFolder(currentFolderId); // Refresh folder immediately!
                resolve();
              } else if (res.status === 'ERROR') {
                clearInterval(interval);
                setUploadItems(prev => prev.map(item => 
                  item.name === file.name ? { ...item, status: 'ERROR' } : item
                ));
                resolve();
              }
            } catch (err) {
              console.error('Error polling status:', err);
            }
          }, 1500);
        });
        
        pollingPromises.push(pollPromise);
      }
      
      // Wait for all background polling processes to complete
      await Promise.all(pollingPromises);
      loadFolder(currentFolderId);
    } catch (err) {
      console.error('Upload sequence error:', err);
      setError(getErrorMessage(err, '파일 업로드 또는 처리 중 오류가 발생했습니다.'));
    } finally {
      setUploading(false);
      setTimeout(() => {
        setShowUploadStatus(false);
        setUploadItems([]);
      }, 3000);
    }
  }

  function handleStartMove(type: 'file' | 'folder', id: number, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMovingItem({ type, id, name });
  }

  async function runDownload(
    key: string,
    name: string,
    task: (onProgress: (progress: DownloadProgress) => void) => Promise<void>,
  ) {
    if (downloadState) return;
    setError('');
    setDownloadState({ key, name, loadedBytes: 0, totalBytes: null });
    try {
      await task((progress) => {
        setDownloadState(prev => prev?.key === key ? {
          ...prev,
          loadedBytes: progress.loadedBytes,
          totalBytes: progress.totalBytes,
        } : prev);
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, '다운로드에 실패했습니다.'));
    } finally {
      setDownloadState(null);
    }
  }

  function handleDownloadFolder(folder: SimpleFolderResponseDto, e: React.MouseEvent) {
    e.stopPropagation();
    const filename = `${folder.name}.zip`;
    runDownload(`folder-${folder.id}`, filename, onProgress => downloadFolderContent(folder.id, filename, onProgress));
  }

  function handleDownloadFile(file: FileResponseDto, e: React.MouseEvent) {
    e.stopPropagation();
    runDownload(`file-${file.id}`, file.name, onProgress => downloadFileContent(file.id, file.name, onProgress));
  }

  async function handleConfirmMove() {
    if (!movingItem || currentFolderId == null) return;
    
    if (movingItem.type === 'folder' && movingItem.id === currentFolderId) {
      setDialog({
        type: 'alert',
        title: '이동 불가',
        message: '현재 폴더로 이동할 수 없습니다.',
        onConfirm: () => setDialog(null)
      });
      return;
    }

    try {
      if (movingItem.type === 'file') {
        await moveFile(movingItem.id, currentFolderId);
      } else {
        await renameFolder(movingItem.id, undefined, currentFolderId);
      }
      loadFolder(currentFolderId);
      setMovingItem(null);
    } catch (err: unknown) {
      setDialog({
        type: 'alert',
        title: '이동 실패',
        message: getErrorMessage(err, '이동에 실패했습니다.'),
        onConfirm: () => setDialog(null)
      });
    }
  }

  function handleSortOptionClick(key: FileSortKey) {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'name' ? 'asc' : 'desc');
    }
  }

  const crumbItems: BreadcrumbItem[] = [
    { label: '내 보관함', onClick: () => navigateBreadcrumb(-1) },
    ...path.map((p, i) => ({ label: p.name, onClick: () => navigateBreadcrumb(i) })),
  ];
  const visibleCrumbItems: BreadcrumbItem[] = crumbItems.length > 3
    ? [
        crumbItems[0],
        {
          label: '...',
          title: crumbItems.slice(1, -1).map(item => item.label).join(' / '),
          ellipsis: true,
        },
        crumbItems[crumbItems.length - 1],
      ]
    : crumbItems;

  return (
    <>
      <style>{filesStyles}</style>
      <div className="content files-content">
        {error && <div style={{ padding: '12px 16px', background: 'rgba(220,75,62,0.1)', borderRadius: 10, color: 'var(--bad)', marginBottom: 16 }}>{error}</div>}

        <div className="file-page-head">
          <div>
            <h1>파일 관리</h1>
            <p>
              {path.length > 0 ? path[path.length - 1].name : '내 저장소'}
              {folder ? ` · ${folder.folders.length + folder.files.length}개 항목` : ' · 불러오는 중'}
            </p>
          </div>
        </div>

        {/* Breadcrumb */}
        {path.length > 0 && (
          <div className="file-breadcrumbs">
            {visibleCrumbItems.map((c, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <Icon name="chevronR" size={12} />}
                {c.ellipsis ? (
                  <span title={c.title} style={{ padding: '0 4px', color: 'var(--fg-3)' }}>{c.label}</span>
                ) : (
                  <button className="btn ghost" style={{ height: 28, padding: '0 8px', fontSize: 13 }} onClick={c.onClick}>{c.label}</button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="files-toolbar">
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <button className="btn primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Icon name="upload" size={16} color="var(--accent-fg)" />
            <span className="upload-btn-label">{uploading ? '업로드 중...' : '업로드'}</span>
          </button>
          <button className="btn" onClick={() => { setShowNewFolder(v => !v); setNewFolderName('새 폴더'); }}>
            <Icon name="plus" size={15} /> 새 폴더
          </button>
          {showNewFolder && (
            <>
              <div className="new-folder-backdrop" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} />
              <div className="new-folder-popup">
                <div className="new-folder-title">새 폴더</div>
                <input
                  className="new-folder-input"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  autoFocus
                />
                <div className="new-folder-actions">
                  <button className="btn" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>취소</button>
                  <button className="btn primary" onClick={handleCreateFolder} disabled={creatingFolder}>만들기</button>
                </div>
              </div>
            </>
          )}
          <div className="spacer" />
          <div className="sort-controls" aria-label="파일 정렬">
            <span className="sort-label">정렬</span>
            <div className="sort-custom-wrap">
              <button
                ref={sortBtnRef}
                className="sort-custom-btn"
                onClick={() => {
                  if (showSortMenu) { setShowSortMenu(false); return; }
                  const rect = sortBtnRef.current?.getBoundingClientRect();
                  if (rect) setSortMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                  setShowSortMenu(true);
                }}
                aria-label="정렬 기준"
              >
                {SORT_OPTIONS.find(o => o.key === sortKey)?.label ?? '정렬'}
                <Icon name={sortDirection === 'asc' ? 'chevronU' : 'chevronD'} size={11} />
              </button>
              {showSortMenu && sortMenuPos && (
                <div
                  ref={sortMenuRef}
                  className="sort-custom-menu"
                  style={{ top: sortMenuPos.top, right: sortMenuPos.right }}
                >
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      className={`sort-custom-item${opt.key === sortKey ? ' active' : ''}`}
                      onClick={() => { handleSortOptionClick(opt.key); setShowSortMenu(false); }}
                    >
                      {opt.label}
                      {opt.key === sortKey && <Icon name={sortDirection === 'asc' ? 'chevronU' : 'chevronD'} size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="view-toggle">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><Icon name="list" size={18} /></button>
            <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}><Icon name="grid" size={16} /></button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--fg-3)' }}>
            <Icon name="spinner" size={24} />
          </div>
        ) : folder ? (
          <>
            {(folder.folders.length > 0 || folder.files.length > 0) ? (
              view === 'list' ? (
                <div className="card file-card">
                  <div className="file-row head">
                    <div>이름</div>
                    <div>수정일</div>
                    <div>종류</div>
                    <div style={{ textAlign: 'right' }}>크기</div>
                    <div />
                  </div>
                  {/* Folders first */}
                  {sortedFolders.map((f) => (
                    <div key={`folder-${f.id}`}
                      className="file-row"
                      onClick={() => navigateTo(f)}>
                      <div className="file-name">
                        <div className="file-thumb-sm">
                          <Icon name="folder" size={20} color="var(--c-folder)" stroke={1.7} />
                        </div>
                        <span className="nm">{f.name}</span>
                      </div>
                      <div className="file-meta">{formatDate(f.originUpdatedAt)}</div>
                      <div className="file-meta">FOLDER</div>
                      <div className="file-meta" style={{ textAlign: 'right' }}>—</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="row-action" title="폴더 다운로드" onClick={e => handleDownloadFolder(f, e)} disabled={downloadingKey !== null}>
                          <Icon name={downloadingKey === `folder-${f.id}` ? 'spinner' : 'download'} size={14} />
                        </button>
                        <button className="row-action" title="이동" onClick={e => handleStartMove('folder', f.id, f.name, e)}>
                          <Icon name="move" size={14} />
                        </button>
                        <button className="row-action" title="삭제" onClick={e => handleDeleteFolder(f.id, e)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Files next */}
                  {sortedFiles.map((f) => (
                    <div key={`file-${f.id}`}
                      className={'file-row' + (selected === f.id ? ' selected' : '')}
                      onClick={() => {
                        setSelected(f.id);
                        if (f.category === 'VIDEO') onOpenVideo(f.id, f);
                        else onOpenFile(f.id);
                      }}>
                      <div className="file-name">
                        <div className="file-thumb-sm">
                          <FileThumbnail file={f} size={20} />
                        </div>
                        <span className="nm">{f.name}</span>
                        {f.category === 'VIDEO' && f.videoCodec && (
                          <span className="badge-codec">{f.videoCodec}</span>
                        )}
                      </div>
                      <div className="file-meta">{formatDate(f.originUpdatedAt)}</div>
                      <div className="file-meta">{f.category}</div>
                      <div className="file-meta" style={{ textAlign: 'right' }}>{formatBytes(f.size)}</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="row-action" title="다운로드" onClick={e => handleDownloadFile(f, e)} disabled={downloadingKey !== null}>
                          <Icon name={downloadingKey === `file-${f.id}` ? 'spinner' : 'download'} size={14} />
                        </button>
                        <button className="row-action" title="이동" onClick={e => handleStartMove('file', f.id, f.name, e)}>
                          <Icon name="move" size={14} />
                        </button>
                        <button className="row-action" title="삭제" onClick={e => handleDeleteFile(f.id, e)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="file-grid">
                  {/* Folders first */}
                  {sortedFolders.map((f) => (
                    <div className="grid-card" key={`folder-${f.id}`} onClick={() => navigateTo(f)}>
                      <div className="gc-head">
                        <Icon name="folder" size={18} color="var(--c-folder)" stroke={1.7} />
                        <span className="nm">{f.name}</span>
                      </div>
                      <div className="gc-prev">
                        <Icon name="folder" size={40} color="var(--c-folder)" stroke={1.7} />
                      </div>
                      <div className="grid-card-actions">
                        <button className="grid-action-btn" title="폴더 다운로드" onClick={e => handleDownloadFolder(f, e)} disabled={downloadingKey !== null}>
                          <Icon name={downloadingKey === `folder-${f.id}` ? 'spinner' : 'download'} size={14} />
                        </button>
                        <button className="grid-action-btn" title="이동" onClick={e => handleStartMove('folder', f.id, f.name, e)}>
                          <Icon name="move" size={14} />
                        </button>
                        <button className="grid-action-btn" title="삭제" onClick={e => handleDeleteFolder(f.id, e)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Files next */}
                  {sortedFiles.map((f) => (
                    <div className="grid-card" key={`file-${f.id}`}
                      onClick={() => {
                        if (f.category === 'VIDEO') onOpenVideo(f.id, f);
                        else onOpenFile(f.id);
                      }}>
                      <div className="gc-head">
                        <FileIcon file={f} size={18} />
                        <span className="nm">{f.name}</span>
                      </div>
                      <div className="gc-prev" style={
                        f.category === 'VIDEO' ? { background: 'linear-gradient(135deg, #2a2730, #19171d)' } : {}
                      }>
                        {f.category === 'VIDEO'
                          ? <Icon name="play" size={34} color="#fff" stroke={1.5} />
                          : <FileIcon file={f} size={40} />
                        }
                      </div>
                      <div className="grid-card-actions">
                        <button className="grid-action-btn" title="다운로드" onClick={e => handleDownloadFile(f, e)} disabled={downloadingKey !== null}>
                          <Icon name={downloadingKey === `file-${f.id}` ? 'spinner' : 'download'} size={14} />
                        </button>
                        <button className="grid-action-btn" title="이동" onClick={e => handleStartMove('file', f.id, f.name, e)}>
                          <Icon name="move" size={14} />
                        </button>
                        <button className="grid-action-btn" title="삭제" onClick={e => handleDeleteFile(f.id, e)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 24px', color: 'var(--fg-3)', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--surface-1)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
                  <Icon name="folder" size={32} stroke={1.4} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>폴더가 비어있습니다</div>
                <div style={{ marginTop: 6 }}>파일을 업로드하거나 새 폴더를 만들어보세요.</div>
              </div>
            )}
          </>
        ) : rootFolderId == null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 24px', color: 'var(--fg-3)', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--surface-1)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
              <Icon name="cloud" size={32} stroke={1.4} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>루트 폴더가 설정되지 않았습니다</div>
            <div style={{ marginTop: 6 }}>관리자에게 루트 폴더 지정을 요청하세요.</div>
          </div>
        ) : null}
      </div>

      {showUploadStatus && (
        <div className="upload-status-widget">
          <div className="widget-header">
            <span className="title">
              {uploading && uploadItems.some(i => i.status === 'UPLOADING') ? (
                <>
                  <Icon name="spinner" size={16} className="spin-icon" style={{ marginRight: 8 }} />
                  파일 업로드 중 ({uploadItems.filter(i => i.status !== 'UPLOADING').length + 1}/{uploadItems.length})
                </>
              ) : uploadItems.some(i => i.status === 'PROCESSING') ? (
                <>
                  <Icon name="spinner" size={16} className="spin-icon" style={{ marginRight: 8 }} />
                  파일 처리 중...
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(52, 199, 89, 0.2)', color: '#34c759', marginRight: 8 }}>
                    <Icon name="check" size={11} stroke={3} />
                  </span>
                  완료 ({uploadItems.filter(i => i.status === 'COMPLETE').length}개 성공, {uploadItems.filter(i => i.status === 'ERROR').length}개 실패)
                </>
              )}
            </span>
          </div>
          <div className="widget-body" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {uploadItems.map((item, idx) => (
              <div className="widget-item" key={idx} style={{ marginBottom: idx < uploadItems.length - 1 ? 12 : 0 }}>
                <div className="file-info-row">
                  <span className="file-name-txt" title={item.name}>{item.name}</span>
                  <span className="pct-txt">
                    {item.status === 'UPLOADING' && `${item.pct}%`}
                    {item.status === 'PROCESSING' && '처리 중...'}
                    {item.status === 'COMPLETE' && '완료'}
                    {item.status === 'ERROR' && '실패'}
                  </span>
                </div>
                <div className="widget-progress-bg">
                  <div className={`widget-progress-fill ${item.status.toLowerCase()}`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {downloadState && (
        <div className="upload-status-widget download-status-widget" style={{ bottom: showUploadStatus ? 360 : 24 }}>
          <div className="widget-header">
            <span className="title">
              <Icon name="spinner" size={16} className="spin-icon" style={{ marginRight: 8 }} />
              파일 다운로드 중
            </span>
          </div>
          <div className="widget-body">
            <div className="file-info-row">
              <span className="file-name-txt" title={downloadState.name}>{downloadState.name}</span>
              <span className="pct-txt">
                {downloadState.totalBytes
                  ? `${Math.min(100, Math.floor((downloadState.loadedBytes / downloadState.totalBytes) * 100))}%`
                  : formatBytes(downloadState.loadedBytes)}
              </span>
            </div>
            <div className="widget-progress-bg">
              <div
                className={`widget-progress-fill ${downloadState.totalBytes ? '' : 'processing'}`}
                style={{
                  width: downloadState.totalBytes
                    ? `${Math.min(100, (downloadState.loadedBytes / downloadState.totalBytes) * 100)}%`
                    : '100%',
                }}
              />
            </div>
            <div className="download-byte-row">
              {downloadState.totalBytes
                ? `${formatBytes(downloadState.loadedBytes)} / ${formatBytes(downloadState.totalBytes)}`
                : `${formatBytes(downloadState.loadedBytes)} 받는 중`}
            </div>
          </div>
        </div>
      )}

      {movingItem && (
        <div className="move-banner">
          <div className="banner-content">
            <Icon name="move" size={16} color="var(--accent)" />
            <span className="msg">
              <strong>{movingItem.name}</strong>을(를) 이동하는 중... (목적지 폴더로 이동 후 붙여넣기를 누르세요)
            </span>
          </div>
          <div className="banner-actions">
            <button className="btn primary" onClick={handleConfirmMove}>
              <Icon name="check" size={14} color="var(--accent-fg)" />여기에 붙여넣기
            </button>
            <button className="btn" onClick={() => setMovingItem(null)}>
              취소
            </button>
          </div>
        </div>
      )}

      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{dialog.title}</h3>
              <button className="close-btn" onClick={() => setDialog(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p>{dialog.message}</p>
            </div>
            <div className="modal-footer">
              {dialog.type === 'confirm' && (
                <button className="btn" onClick={() => setDialog(null)}>취소</button>
              )}
              <button className="btn primary" onClick={dialog.onConfirm}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const filesStyles = `
  .files-content{
    padding-top:18px;
  }
  .file-page-head{
    display:flex;
    align-items:flex-end;
    justify-content:space-between;
    gap:16px;
    margin-bottom:14px;
  }
  .file-page-head h1{
    margin:0;
    font-size:22px;
    font-weight:800;
    color:var(--fg);
  }
  .file-page-head p{
    margin:5px 0 0;
    font-size:13px;
    color:var(--fg-3);
  }
  .file-breadcrumbs{
    display:flex;
    align-items:center;
    gap:6px;
    margin-bottom:12px;
    font-size:13px;
    color:var(--fg-3);
    overflow-x:auto;
  }
  .files-toolbar{
    display:flex; align-items:center; gap:8px; flex-wrap:wrap;
    padding:0 0 14px;
  }
  .files-toolbar .spacer{ flex:1; }
  .new-folder-backdrop{
    position:fixed; inset:0; z-index:40;
  }
  .new-folder-popup{
    position:fixed; top:50%; left:50%;
    transform:translate(-50%,-50%);
    z-index:41;
    background:var(--bg);
    border:1px solid var(--border);
    border-radius:14px;
    padding:20px;
    box-shadow:var(--shadow-lg);
    display:flex; flex-direction:column; gap:12px;
    width:min(320px, calc(100vw - 32px));
  }
  .new-folder-title{
    font-size:15px; font-weight:600; color:var(--fg);
  }
  .new-folder-input{
    border:1px solid var(--border); border-radius:8px;
    padding:8px 12px; font:inherit; font-size:15px;
    background:var(--bg-2,var(--bg)); color:var(--fg); outline:none;
    width:100%; box-sizing:border-box;
  }
  .new-folder-input:focus{ border-color:var(--accent); }
  .new-folder-actions{
    display:flex; gap:8px; justify-content:flex-end;
  }
  .sort-controls{
    display:flex; align-items:center; gap:8px;
  }
  .sort-label{
    font-size:12px;
    font-weight:750;
    color:var(--fg-3);
  }
  .sort-custom-wrap{
    display:block;
    position:relative;
  }
  .sort-custom-btn{
    height:32px;
    display:flex; align-items:center; gap:5px;
    padding:0 10px;
    border:1px solid var(--border-soft);
    border-radius:8px;
    background:var(--bg);
    color:var(--fg-2);
    font:inherit;
    font-size:12px;
    font-weight:650;
    white-space:nowrap;
  }
  .sort-custom-btn:hover{
    background:var(--surface-1);
    color:var(--accent);
  }
  .sort-custom-menu{
    position:fixed;
    background:var(--bg);
    border:1px solid var(--border-soft);
    border-radius:10px;
    box-shadow:var(--shadow-md);
    z-index:200;
    overflow:hidden;
    min-width:140px;
  }
  .sort-custom-item{
    width:100%;
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:9px 14px;
    border:0; background:transparent;
    font:inherit; font-size:13px; font-weight:600;
    color:var(--fg-2);
    text-align:left;
    cursor:pointer;
  }
  .sort-custom-item:hover{ background:var(--surface-1); color:var(--fg); }
  .sort-custom-item.active{ color:var(--accent); background:var(--accent-soft); }
  .folder-grid{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(228px, 1fr));
    gap:12px; margin-bottom:8px;
  }
  .folder-card{
    display:flex; align-items:center; gap:13px;
    padding:14px 15px;
    background:var(--bg-2);
    border:1px solid var(--border-soft);
    border-radius:14px;
    box-shadow:var(--shadow-sm);
    cursor:default;
  }
  .folder-card .txt{ flex:1; min-width:0; }
  .folder-card:hover{ box-shadow:var(--shadow-md); transform:translateY(-1px); }
  .folder-card .fi{
    width:40px; height:40px; border-radius:11px;
    display:grid; place-items:center; flex-shrink:0;
    background:var(--accent-soft);
  }
  .folder-card .nm{ font-size:13.5px; font-weight:600; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .folder-card .meta{ font-size:11.5px; color:var(--fg-3); margin-top:3px; white-space:nowrap; }
  .folder-card .more{ width:28px; height:28px; border-radius:8px; border:0; background:transparent; color:var(--fg-3); display:grid; place-items:center; }
  .folder-card .more:hover{ background:var(--surface-1); color:var(--fg); }

  .file-card{
    overflow:hidden;
    border-radius:12px;
    border-color:var(--border-soft);
    background:var(--bg);
  }
  .file-row{
    display:grid;
    grid-template-columns:minmax(0, 2.8fr) 1.05fr 0.85fr 0.85fr 96px;
    align-items:center; gap:14px;
    padding:0 14px; height:46px;
    border-top:1px solid var(--hairline);
    cursor:default;
  }
  .file-row.head{
    border-top:0; height:40px;
    font-size:12px; font-weight:750; color:var(--fg-3);
    background:var(--bg-3);
  }
  .file-row:not(.head):hover{ background:var(--surface-1); }
  .file-row.selected{ background:var(--accent-soft) !important; }

  .file-name{ display:flex; align-items:center; gap:10px; min-width:0; font-size:13px; font-weight:650; color:var(--fg); }
  .file-name .nm{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .file-thumb-sm{
    width:28px; height:28px; border-radius:8px;
    flex-shrink:0; display:grid; place-items:center; overflow:hidden;
    background:var(--accent-soft);
  }
  .file-meta{ font-size:12.5px; color:var(--fg-3); font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row-action{ width:28px; height:28px; border-radius:8px; display:grid; place-items:center; color:var(--fg-3); background:transparent; border:0; }
  .row-action:hover{ background:var(--surface-2); color:var(--accent); }
  .row-action:disabled{ opacity:.5; cursor:not-allowed; }

  .file-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:12px; }
  .grid-card{ border:1px solid var(--border-soft); border-radius:12px; overflow:hidden; cursor:default; background:var(--bg); box-shadow:var(--shadow-sm); }
  .grid-card:hover{ box-shadow:var(--shadow-md); transform:translateY(-1px); }
  .grid-card .gc-head{ display:flex; align-items:center; gap:9px; padding:12px 12px 10px; font-size:13px; font-weight:700; }
  .grid-card .gc-head .nm{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .grid-card .gc-prev{ height:124px; margin:0 12px 12px; border-radius:8px; background:var(--surface-1); display:grid; place-items:center; overflow:hidden; position:relative; }

  @media (max-width: 768px) {
    .files-toolbar .spacer{
      flex:0 0 0;
      width:0;
    }
    .sort-controls{
      flex:0 0 auto;
      min-width:0;
    }
    .sort-label{
      display:none;
    }
    .files-toolbar > .btn.primary{
      width:32px;
      min-width:32px;
      padding:0;
      justify-content:center;
    }
    .files-toolbar > .btn.primary .upload-btn-label{
      display:none;
    }
    .files-toolbar{
      flex-wrap:nowrap;
      overflow-x:auto;
    }
    .files-toolbar > *{
      flex-shrink:0;
    }
  }

  .upload-status-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  [data-theme="dark"] .upload-status-widget {
    background: rgba(25, 30, 40, 0.92);
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .upload-status-widget .widget-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .upload-status-widget .widget-header .title {
    font-size: 13.5px;
    font-weight: 750;
    color: var(--fg);
    display: flex;
    align-items: center;
  }

  .upload-status-widget .widget-body {
    padding: 16px;
  }

  .upload-status-widget .file-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    gap: 12px;
  }

  .upload-status-widget .file-name-txt {
    font-size: 12.5px;
    color: var(--fg);
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .upload-status-widget .pct-txt {
    font-size: 12px;
    color: var(--fg-3);
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    flex-shrink: 0;
  }

  .download-status-widget .download-byte-row {
    margin-top: 8px;
    font-size: 11.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
  }

  .upload-status-widget .widget-progress-bg {
    height: 6px;
    background: var(--surface-2);
    border-radius: 99px;
    overflow: hidden;
  }

  .upload-status-widget .widget-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), #5d7cff);
    border-radius: 99px;
    transition: width 0.15s ease-out;
  }
  .upload-status-widget .widget-progress-fill.processing {
    background: linear-gradient(90deg, #f39c12, #f1c40f);
    animation: pulse 1.5s infinite;
  }
  .upload-status-widget .widget-progress-fill.complete {
    background: #2ecc71;
  }
  .upload-status-widget .widget-progress-fill.error {
    background: #e74c3c;
  }
  @keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .upload-status-widget .spin-icon {
    animation: spin 1s linear infinite;
    display: inline-block;
  }

  .move-banner {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    max-width: 90%;
    width: 680px;
    animation: slideUpMove 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  [data-theme="dark"] .move-banner {
    background: rgba(25, 30, 40, 0.94);
  }
  
  @keyframes slideUpMove {
    from {
      opacity: 0;
      transform: translate(-50%, 20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  .move-banner .banner-content {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--fg);
    font-size: 13px;
    min-width: 0;
  }

  .move-banner .banner-content .msg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .move-banner .banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .move-banner .banner-actions button {
    height: 34px;
    font-size: 12.5px;
    padding: 0 12px;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .upload-status-widget {
      left: 14px;
      right: 14px;
      width: auto;
      bottom: calc(86px + env(safe-area-inset-bottom, 0px)) !important;
    }
    .download-status-widget {
      bottom: calc(86px + env(safe-area-inset-bottom, 0px)) !important;
    }
    .move-banner {
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      width: calc(100% - 32px);
      left: 16px;
      transform: none;
      bottom: calc(86px + env(safe-area-inset-bottom, 0px)) !important;
    }
    
    @keyframes slideUpMove {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    .move-banner .banner-content {
      width: 100%;
    }
    
    .move-banner .banner-actions {
      width: 100%;
      justify-content: flex-end;
    }
    
    .move-banner .banner-actions button {
      flex: 1;
    }
  }

  .confirm-modal {
    width: 360px;
    background: var(--bg-2);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }
  
  .confirm-modal .modal-header {
    padding: 18px 20px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--hairline);
  }
  
  .confirm-modal .modal-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--fg);
  }
  
  .confirm-modal .modal-header .close-btn {
    background: transparent;
    border: 0;
    color: var(--fg-3);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 4px;
    border-radius: 6px;
  }
  
  .confirm-modal .modal-header .close-btn:hover {
    background: var(--surface-1);
    color: var(--fg);
  }
  
  .confirm-modal .modal-body {
    padding: 20px;
    font-size: 13.5px;
    color: var(--fg-2);
    line-height: 1.5;
  }
  
  .confirm-modal .modal-footer {
    padding: 12px 20px 18px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    background: var(--bg);
    border-top: 1px solid var(--hairline);
  }
  
  .confirm-modal .modal-footer button {
    height: 36px;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 600;
  }

  .grid-card {
    position: relative;
  }
  .grid-card-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 10;
  }
  .grid-card:hover .grid-card-actions {
    opacity: 1;
  }
  .grid-action-btn {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: var(--fg-3);
    background: var(--bg);
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .grid-action-btn:hover {
    background: var(--surface-2);
    color: var(--accent);
    transform: scale(1.05);
  }
  .grid-action-btn:disabled {
    opacity: .55;
    cursor: not-allowed;
    transform: none;
  }
  @media (max-width: 768px) {
    .grid-card-actions {
      opacity: 1;
    }
  }
`;
