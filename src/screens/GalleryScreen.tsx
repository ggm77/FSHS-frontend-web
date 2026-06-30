import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { getGalleryFiles, getFileThumbnailUrl, type FileSearchOrder } from '../api/files';
import type { FileResponseDto } from '../types';

interface Props {
  onOpenVideo?: (fileId: number, fileData?: FileResponseDto) => void;
  onOpenFile: (fileId: number) => void;
}

interface DayGroup {
  key: string;
  label: string;
  items: FileResponseDto[];
}

type Zoom = 's' | 'm' | 'l';

const PAGE_SIZE = 90;

function getErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : '갤러리를 불러오지 못했습니다.';
}

function getGalleryDate(file: FileResponseDto): string {
  return file.capturedAt || file.originUpdatedAt || file.createdAt || file.updatedAt;
}

function getDateKey(file: FileResponseDto): string {
  const source = getGalleryDate(file);
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source.slice(0, 10) || 'unknown';
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(key: string): string {
  if (key === 'unknown') return '날짜 없음';
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function groupByDate(files: FileResponseDto[]): DayGroup[] {
  const groups = new Map<string, FileResponseDto[]>();

  for (const file of files) {
    const key = getDateKey(file);
    const group = groups.get(key);
    if (group) group.push(file);
    else groups.set(key, [file]);
  }

  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: formatDateLabel(key),
    items,
  }));
}

function mergeUniqueFiles(prev: FileResponseDto[], next: FileResponseDto[]): FileResponseDto[] {
  if (prev.length === 0) return next;

  const seen = new Set(prev.map(file => file.id));
  const merged = [...prev];
  for (const file of next) {
    if (seen.has(file.id)) continue;
    seen.add(file.id);
    merged.push(file);
  }
  return merged;
}

function GalleryTile({
  file,
  onOpenFile,
  onOpenVideo,
}: {
  file: FileResponseDto;
  onOpenFile: (fileId: number) => void;
  onOpenVideo?: (fileId: number, fileData?: FileResponseDto) => void;
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const isVideo = file.category === 'VIDEO';

  return (
    <button
      className="gphoto"
      title={file.name}
      onClick={() => isVideo ? onOpenVideo?.(file.id, file) : onOpenFile(file.id)}
    >
      {thumbnailFailed ? (
        <span className="gphoto-fallback">
          <Icon name={isVideo ? 'videoFile' : 'image'} size={34} stroke={1.35} />
        </span>
      ) : (
        <img
          src={getFileThumbnailUrl(file.uuid)}
          alt={file.name}
          className="gphoto-img"
          loading="lazy"
          onError={() => setThumbnailFailed(true)}
        />
      )}
      {isVideo && (
        <span className="gphoto-video-badge">
          <Icon name="play" size={14} />
        </span>
      )}
    </button>
  );
}

export function GalleryScreen({ onOpenFile, onOpenVideo }: Props) {
  const [items, setItems] = useState<FileResponseDto[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [order, setOrder] = useState<FileSearchOrder>('desc');
  const [zoom, setZoom] = useState<Zoom>('m');
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const days = useMemo(() => groupByDate(items), [items]);

  const loadPage = useCallback(async (
    pageToLoad: number,
    reset: boolean,
    orderToLoad = order,
  ) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (reset) {
      setLoadingInitial(true);
      setLoadingMore(false);
      setError('');
      setItems([]);
      setPage(0);
      setHasNext(false);
    } else {
      setLoadingMore(true);
      setError('');
    }

    try {
      const data = await getGalleryFiles({
        order: orderToLoad,
        size: PAGE_SIZE,
        page: pageToLoad,
      });

      if (requestIdRef.current !== requestId) return;

      setItems(prev => reset ? data.items : mergeUniqueFiles(prev, data.items));
      setPage(pageToLoad);
      setHasNext(data.hasNext);
    } catch (err: unknown) {
      if (requestIdRef.current !== requestId) return;
      setError(getErrorMessage(err));
    } finally {
      if (requestIdRef.current === requestId) {
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    }
  }, [order]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(0, true, order);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPage, order]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(entries => {
      const entry = entries[0];
      if (!entry?.isIntersecting || loadingInitial || loadingMore || !hasNext) return;
      void loadPage(page + 1, false, order);
    }, {
      root: null,
      rootMargin: '800px',
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadPage, loadingInitial, loadingMore, order, page]);

  function refreshGallery() {
    void loadPage(0, true, order);
  }

  return (
    <>
      <style>{galleryStyles}</style>
      <div className="content gallery-content">
        <div className="gallery-page-head">
          <div>
            <h1>갤러리</h1>
            <p>{loadingInitial ? '불러오는 중' : `${items.length}개 항목`}</p>
          </div>
          <button className="gallery-refresh" onClick={refreshGallery} disabled={loadingInitial || loadingMore}>
            <Icon name={loadingInitial ? 'spinner' : 'refresh'} size={15} className={loadingInitial ? 'spin-icon' : undefined} />
            새로고침
          </button>
        </div>

        <div className="gallery-toolbar">
          <div className="seg" aria-label="정렬 방향">
            <button className={order === 'desc' ? 'on' : ''} onClick={() => setOrder('desc')}>최신순</button>
            <button className={order === 'asc' ? 'on' : ''} onClick={() => setOrder('asc')}>오래된순</button>
          </div>
          <div className="spacer" />
          <div className="seg compact" aria-label="갤러리 크기">
            <button className={zoom === 's' ? 'on' : ''} onClick={() => setZoom('s')}>S</button>
            <button className={zoom === 'm' ? 'on' : ''} onClick={() => setZoom('m')}>M</button>
            <button className={zoom === 'l' ? 'on' : ''} onClick={() => setZoom('l')}>L</button>
          </div>
        </div>

        {error && (
          <div className="gallery-error">
            <span>{error}</span>
            <button onClick={refreshGallery}>다시 시도</button>
          </div>
        )}

        {loadingInitial ? (
          <div className="gallery-loading">
            <Icon name="spinner" size={24} className="spin-icon" />
          </div>
        ) : items.length === 0 ? (
          <div className="gallery-empty">
            <div className="empty-icon"><Icon name="gallery" size={32} stroke={1.4} /></div>
            <div className="empty-title">갤러리에 표시할 파일이 없습니다</div>
          </div>
        ) : (
          <>
            {days.map(day => (
              <section className="gallery-day" key={day.key}>
                <div className="gallery-day-h">
                  <div className="d">{day.label}</div>
                  <div className="c">{day.items.length}개</div>
                </div>
                <div className={'gallery-grid zoom-' + zoom}>
                  {day.items.map(file => (
                    <GalleryTile
                      key={file.id}
                      file={file}
                      onOpenFile={onOpenFile}
                      onOpenVideo={onOpenVideo}
                    />
                  ))}
                </div>
              </section>
            ))}

            <div ref={sentinelRef} className="gallery-sentinel">
              {loadingMore ? (
                <>
                  <Icon name="spinner" size={18} className="spin-icon" />
                  <span>불러오는 중</span>
                </>
              ) : hasNext ? (
                <button onClick={() => void loadPage(page + 1, false, order)}>더 보기</button>
              ) : (
                <span>마지막 항목입니다</span>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const galleryStyles = `
  .gallery-content {
    padding-top: 24px;
  }
  .gallery-page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .gallery-page-head h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: var(--fg);
  }
  .gallery-page-head p {
    margin: 5px 0 0;
    font-size: 13px;
    color: var(--fg-3);
  }
  .gallery-refresh {
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg-2);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
  }
  .gallery-refresh:hover:not(:disabled) {
    color: var(--accent);
    background: var(--surface-1);
  }
  .gallery-refresh:disabled {
    opacity: .62;
    cursor: wait;
  }
  .gallery-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 0 14px;
    color: var(--fg-3);
    font-size: 13px;
  }
  .gallery-toolbar .spacer {
    flex: 1;
  }
  .gallery-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    margin-bottom: 16px;
    border: 1px solid rgba(239, 68, 68, .22);
    border-radius: 8px;
    color: var(--bad);
    background: rgba(239, 68, 68, .08);
    font-size: 13px;
    font-weight: 650;
  }
  .gallery-error button {
    flex: 0 0 auto;
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 7px;
    background: rgba(239, 68, 68, .12);
    color: var(--bad);
    font: inherit;
    font-size: 12px;
    font-weight: 800;
  }
  .gallery-loading {
    display: flex;
    justify-content: center;
    padding: 60px;
    color: var(--fg-3);
  }
  .gallery-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 80px 24px;
    color: var(--fg-3);
    text-align: center;
  }
  .gallery-empty .empty-icon {
    width: 72px;
    height: 72px;
    border-radius: 18px;
    background: var(--surface-1);
    display: grid;
    place-items: center;
    margin-bottom: 16px;
  }
  .gallery-empty .empty-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--fg);
  }
  .gallery-day {
    margin-bottom: 30px;
  }
  .gallery-day-h {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    padding: 7px 0;
    background: var(--bg-shell);
  }
  .gallery-day-h .d {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 700;
    color: var(--fg);
  }
  .gallery-day-h .c {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--fg-3);
    white-space: nowrap;
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: 6px;
  }
  .gallery-grid.zoom-s {
    grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
  }
  .gallery-grid.zoom-l {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  .gphoto {
    position: relative;
    aspect-ratio: 1;
    min-width: 0;
    border: 0;
    padding: 0;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: var(--surface-2);
    color: var(--fg-3);
  }
  .gphoto:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent) 35%, transparent);
    outline-offset: 2px;
  }
  .gphoto .gphoto-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .gphoto-fallback {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--accent-soft);
  }
  .gphoto-video-badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(0, 0, 0, .56);
    color: #fff;
    pointer-events: none;
  }
  .gphoto:hover {
    transform: scale(.985);
    transition: transform .12s ease;
  }
  .gallery-sentinel {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--fg-3);
    font-size: 13px;
    font-weight: 650;
  }
  .gallery-sentinel button {
    height: 36px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg-2);
    font: inherit;
    font-size: 13px;
    font-weight: 800;
  }
  .gallery-sentinel button:hover {
    color: var(--accent);
    background: var(--surface-1);
  }
  @supports not (color: color-mix(in srgb, white, black)) {
    .gphoto:focus-visible {
      outline: 3px solid var(--accent);
    }
  }
  @media (max-width: 680px) {
    .gallery-content {
      padding-top: 16px;
    }
    .gallery-page-head {
      align-items: flex-start;
    }
    .gallery-page-head h1 {
      font-size: 20px;
    }
    .gallery-refresh {
      width: 36px;
      padding: 0;
    }
    .gallery-refresh span {
      display: none;
    }
    .gallery-toolbar {
      align-items: stretch;
      gap: 8px;
    }
    .gallery-toolbar .seg:not(.compact) {
      flex: 1;
    }
    .gallery-toolbar .seg:not(.compact) button {
      flex: 1;
      padding: 0 8px;
    }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
      gap: 4px;
    }
    .gallery-grid.zoom-s {
      grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
    }
    .gallery-grid.zoom-l {
      grid-template-columns: repeat(auto-fill, minmax(152px, 1fr));
    }
    .gallery-day-h {
      top: 0;
      margin-bottom: 6px;
    }
  }
`;
