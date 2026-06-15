import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '../components/Icon';
import { getFolder } from '../api/folders';
import { getFileThumbnailUrl } from '../api/files';
import type { FileResponseDto, FolderResponseDto, SimpleFolderResponseDto } from '../types';

interface Props {
  rootFolderId: number | null;
  onOpenVideo?: (fileId: number, fileData?: FileResponseDto) => void;
  onOpenFile: (fileId: number) => void;
}

interface DayGroup {
  label: string;
  items: FileResponseDto[];
}

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  title?: string;
  ellipsis?: boolean;
}

type FolderPathItem = { id: number; name: string };
type HistoryMode = 'push' | 'replace' | 'none';

const NAME_COLLATOR = new Intl.Collator(undefined, {
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

function groupByDate(files: FileResponseDto[]): DayGroup[] {
  const map = new Map<string, FileResponseDto[]>();
  files.forEach(f => {
    const date = f.originUpdatedAt.slice(0, 10);
    const label = new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(f);
  });
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function sortFolders(folders: SimpleFolderResponseDto[]): SimpleFolderResponseDto[] {
  return [...folders].sort((a, b) => {
    const byName = NAME_COLLATOR.compare(a.name, b.name);
    return byName !== 0 ? byName : a.id - b.id;
  });
}

function sortMediaFiles(files: FileResponseDto[]): FileResponseDto[] {
  return [...files]
    .filter(file => file.category === 'IMAGE' || file.category === 'VIDEO')
    .sort((a, b) => {
      const byDate = Date.parse(b.originUpdatedAt) - Date.parse(a.originUpdatedAt);
      if (byDate !== 0 && !Number.isNaN(byDate)) return byDate;
      const byName = NAME_COLLATOR.compare(a.name, b.name);
      return byName !== 0 ? byName : a.id - b.id;
    });
}

export function GalleryScreen({ rootFolderId, onOpenFile, onOpenVideo }: Props) {
  const [folder, setFolder] = useState<FolderResponseDto | null>(null);
  const [path, setPath] = useState<FolderPathItem[]>([]);
  const [zoom, setZoom] = useState<'s' | 'm' | 'l'>('m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sortedFolders = useMemo(
    () => folder ? sortFolders(folder.folders) : [],
    [folder],
  );
  const mediaFiles = useMemo(
    () => folder ? sortMediaFiles(folder.files) : [],
    [folder],
  );
  const days = useMemo(() => groupByDate(mediaFiles), [mediaFiles]);

  const syncGalleryHistory = useCallback((folderId: number, mode: HistoryMode) => {
    if (mode === 'none') return;

    const state = folderId === rootFolderId
      ? { screen: 'gallery' }
      : { type: 'folder', screen: 'gallery', folderId };
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
    if (rootFolderId == null) {
      setFolder(null);
      setPath([]);
      setError('');
      return;
    }

    const folderId = getFolderIdFromHash() ?? rootFolderId;
    const data = await loadFolder(folderId, folderId === rootFolderId);
    if (!data) return;

    try {
      const nextPath = await buildPathToFolder(data);
      setPath(nextPath);
      syncGalleryHistory(data.id, historyMode);
    } catch {
      const nextPath = data.id === rootFolderId || data.isRoot ? [] : [{ id: data.id, name: data.name }];
      setPath(nextPath);
      syncGalleryHistory(data.id, historyMode);
    }
  }, [buildPathToFolder, loadFolder, rootFolderId, syncGalleryHistory]);

  useEffect(() => {
    void loadFolderFromLocation('replace');
  }, [loadFolderFromLocation]);

  useEffect(() => {
    const handleLocationChange = () => {
      void loadFolderFromLocation('replace');
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [loadFolderFromLocation]);

  function navigateTo(folderItem: SimpleFolderResponseDto) {
    const nextPath = [...path, { id: folderItem.id, name: folderItem.name }];
    setPath(nextPath);
    void loadFolder(folderItem.id, false, nextPath);
    syncGalleryHistory(folderItem.id, 'push');
  }

  function navigateBreadcrumb(idx: number) {
    if (idx < 0) {
      if (rootFolderId == null) return;
      setPath([]);
      void loadFolder(rootFolderId, true);
      syncGalleryHistory(rootFolderId, 'push');
      return;
    }

    const nextPath = path.slice(0, idx + 1);
    const target = nextPath[idx];
    setPath(nextPath);
    void loadFolder(target.id, false, nextPath);
    syncGalleryHistory(target.id, 'push');
  }

  const crumbItems: BreadcrumbItem[] = [
    { label: '내 저장소', onClick: () => navigateBreadcrumb(-1) },
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
  const currentFolderName = path.length > 0 ? path[path.length - 1].name : '내 저장소';

  return (
    <>
      <style>{galleryStyles}</style>
      <div className="content gallery-content">
        {error && <div className="gallery-error">{error}</div>}

        <div className="gallery-page-head">
          <div>
            <h1>갤러리</h1>
            <p>
              {currentFolderName}
              {folder ? ` · 미디어 ${mediaFiles.length}개 · 하위 폴더 ${sortedFolders.length}개` : ' · 불러오는 중'}
            </p>
          </div>
        </div>

        {path.length > 0 && (
          <div className="gallery-breadcrumbs">
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

        <div className="gallery-toolbar">
          <span>현재 폴더의 사진·동영상만 표시</span>
          <div className="spacer" />
          <div className="seg">
            <button className={zoom === 's' ? 'on' : ''} onClick={() => setZoom('s')}>S</button>
            <button className={zoom === 'm' ? 'on' : ''} onClick={() => setZoom('m')}>M</button>
            <button className={zoom === 'l' ? 'on' : ''} onClick={() => setZoom('l')}>L</button>
          </div>
        </div>

        {rootFolderId == null ? (
          <div className="gallery-empty">
            <div className="empty-icon"><Icon name="folder" size={32} stroke={1.4} /></div>
            <div className="empty-title">루트 폴더가 설정되지 않았습니다</div>
          </div>
        ) : loading ? (
          <div className="gallery-loading">
            <Icon name="spinner" size={24} />
          </div>
        ) : (
          <>
            {sortedFolders.length > 0 && (
              <section className="gallery-folder-section">
                <div className="gallery-section-title">하위 폴더</div>
                <div className="gallery-folder-grid">
                  {sortedFolders.map(folderItem => (
                    <button className="gallery-folder-card" key={folderItem.id} onClick={() => navigateTo(folderItem)}>
                      <Icon name="folder" size={22} color="var(--c-folder)" stroke={1.7} />
                      <span>{folderItem.name}</span>
                      <Icon name="chevronR" size={14} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {days.length === 0 ? (
              <div className="gallery-empty">
                <div className="empty-icon"><Icon name="gallery" size={32} stroke={1.4} /></div>
                <div className="empty-title">이 폴더에 사진이나 동영상이 없습니다</div>
              </div>
            ) : days.map((day, di) => (
              <div className="gallery-day" key={di}>
                <div className="gallery-day-h">
                  <div className="d">{day.label}</div>
                  <div className="c">{day.items.length}개</div>
                </div>
                <div className={'gallery-grid zoom-' + zoom}>
                  {day.items.map(f => (
                    <button key={f.id}
                      className="gphoto"
                      onClick={() => f.category === 'VIDEO' ? onOpenVideo?.(f.id, f) : onOpenFile(f.id)}>
                      <img
                        src={getFileThumbnailUrl(f.uuid)}
                        alt={f.name}
                        className="gphoto-img"
                        loading="lazy"
                      />
                      {f.category === 'VIDEO' && (
                        <div className="gphoto-video-badge">
                          <Icon name="play" size={14} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

const galleryStyles = `
  .gallery-content{
    padding-top:24px;
  }
  .gallery-error{
    padding:12px 16px;
    background:rgba(220,75,62,0.1);
    border-radius:10px;
    color:var(--bad);
    margin-bottom:16px;
  }
  .gallery-page-head{
    display:flex;
    align-items:flex-end;
    justify-content:space-between;
    gap:16px;
    margin-bottom:14px;
  }
  .gallery-page-head h1{
    margin:0;
    font-size:22px;
    font-weight:800;
    color:var(--fg);
  }
  .gallery-page-head p{
    margin:5px 0 0;
    font-size:13px;
    color:var(--fg-3);
  }
  .gallery-breadcrumbs{
    display:flex;
    align-items:center;
    gap:6px;
    margin-bottom:12px;
    font-size:13px;
    color:var(--fg-3);
    overflow-x:auto;
  }
  .gallery-toolbar{
    display:flex;
    align-items:center;
    gap:10px;
    padding:0 0 14px;
    color:var(--fg-3);
    font-size:13px;
  }
  .gallery-toolbar .spacer{flex:1}
  .gallery-loading{
    display:flex;
    justify-content:center;
    padding:60px;
    color:var(--fg-3);
  }
  .gallery-empty{
    display:flex;
    flex-direction:column;
    align-items:center;
    padding:80px 24px;
    color:var(--fg-3);
    text-align:center;
  }
  .gallery-empty .empty-icon{
    width:72px;
    height:72px;
    border-radius:18px;
    background:var(--surface-1);
    display:grid;
    place-items:center;
    margin-bottom:16px;
  }
  .gallery-empty .empty-title{
    font-size:16px;
    font-weight:600;
    color:var(--fg);
  }
  .gallery-folder-section{
    margin-bottom:24px;
  }
  .gallery-section-title{
    font-size:13px;
    font-weight:700;
    color:var(--fg);
    margin-bottom:10px;
  }
  .gallery-folder-grid{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));
    gap:8px;
  }
  .gallery-folder-card{
    min-width:0;
    display:flex;
    align-items:center;
    gap:10px;
    height:46px;
    padding:0 12px;
    border:1px solid var(--border);
    border-radius:8px;
    background:var(--bg);
    color:var(--fg);
    cursor:pointer;
    text-align:left;
  }
  .gallery-folder-card:hover{
    background:var(--surface-1);
  }
  .gallery-folder-card span{
    flex:1;
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:13px;
    font-weight:600;
  }

  .gallery-day{ margin-bottom:28px; }
  .gallery-day-h{
    display:flex;
    align-items:baseline;
    justify-content:space-between;
    margin-bottom:10px;
  }
  .gallery-day-h .d{font-size:15px; font-weight:600; letter-spacing:-0.01em; white-space:nowrap}
  .gallery-day-h .c{font-size:12px; color:var(--fg-3); white-space:nowrap}

  .gallery-grid{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(168px, 1fr));
    gap:6px;
  }
  .gallery-grid.zoom-s{grid-template-columns:repeat(auto-fill, minmax(116px, 1fr))}
  .gallery-grid.zoom-l{grid-template-columns:repeat(auto-fill, minmax(240px, 1fr))}

  .gphoto{
    position:relative;
    aspect-ratio:1;
    border:0;
    padding:0;
    border-radius:10px;
    overflow:hidden;
    cursor:pointer;
    background:var(--surface-2);
  }
  .gphoto-video-badge{
    position:absolute;
    bottom:6px;
    left:6px;
    display:flex;
    align-items:center;
    justify-content:center;
    width:26px;
    height:26px;
    border-radius:50%;
    background:rgba(0,0,0,0.55);
    color:#fff;
    pointer-events:none;
  }
  .gphoto .gphoto-img{
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
  }
  .gphoto:hover{transform:scale(0.985); transition:transform .12s ease}
`;
