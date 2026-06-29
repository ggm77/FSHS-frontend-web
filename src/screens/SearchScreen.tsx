import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import {
  formatBytes,
  getFileThumbnailUrl,
  searchFiles,
  type FileSearchOrder,
  type FileSearchSortKey,
} from '../api/files';
import type { FileCategory, FileResponseDto } from '../types';

interface Props {
  rootFolderId?: number | null;
  onOpenVideo?: (fileId: number, fileData?: FileResponseDto) => void;
  onOpenFile: (fileId: number) => void;
  initialQuery?: string;
}

type SearchMode = 'replace' | 'append';
type SearchMenu = 'category' | 'sort' | 'order';

const PAGE_SIZE = 50;

const CATEGORY_OPTIONS: { value: '' | FileCategory; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'IMAGE', label: '이미지' },
  { value: 'VIDEO', label: '동영상' },
  { value: 'AUDIO', label: '오디오' },
  { value: 'DOCUMENT', label: '문서' },
  { value: 'ARCHIVE', label: '압축' },
  { value: 'ETC', label: '기타' },
  { value: 'UNKNOWN', label: '알 수 없음' },
];

const SORT_OPTIONS: { value: FileSearchSortKey; label: string }[] = [
  { value: 'originUpdatedAt', label: '수정일' },
  { value: 'name', label: '이름' },
  { value: 'size', label: '크기' },
  { value: 'updatedAt', label: '등록 수정일' },
];

const ORDER_OPTIONS: { value: FileSearchOrder; label: string }[] = [
  { value: 'desc', label: '내림차순' },
  { value: 'asc', label: '오름차순' },
];

const CATEGORY_LABEL: Record<FileCategory, string> = {
  IMAGE: '이미지',
  VIDEO: '동영상',
  AUDIO: '오디오',
  DOCUMENT: '문서',
  ARCHIVE: '압축',
  ETC: '기타',
  UNKNOWN: '알 수 없음',
};

const CATEGORY_ICON: Record<FileCategory, string> = {
  IMAGE: 'image',
  VIDEO: 'videoFile',
  AUDIO: 'audioFile',
  DOCUMENT: 'doc',
  ARCHIVE: 'archive',
  ETC: 'doc',
  UNKNOWN: 'doc',
};

function getFileIconName(file: FileResponseDto): string {
  const extension = file.extension.toLowerCase();
  if (extension === 'pdf') return 'pdf';
  if (extension === 'zip' || extension === 'rar' || extension === '7z') return 'archive';
  if (extension === 'tsx' || extension === 'ts' || extension === 'js') return 'code';
  if (extension === 'pptx' || extension === 'pptm' || extension === 'ppt') return 'presentation';
  if (extension === 'docx' || extension === 'docm' || extension === 'doc') return 'doc';
  return CATEGORY_ICON[file.category] || 'doc';
}

function getFileIconColor(file: FileResponseDto): string {
  const extension = file.extension.toLowerCase();
  if (extension === 'pdf') return 'var(--c-pdf)';
  if (file.category === 'IMAGE') return 'var(--c-image)';
  if (file.category === 'VIDEO') return 'var(--c-video)';
  if (file.category === 'AUDIO') return 'var(--c-audio)';
  if (file.category === 'ARCHIVE') return 'var(--c-folder)';
  return 'var(--c-doc)';
}

function SearchFilePreview({ file }: { file: FileResponseDto }) {
  const [failed, setFailed] = useState(false);
  const hasThumbnail = file.category === 'IMAGE' || file.category === 'VIDEO';

  if (hasThumbnail && !failed) {
    return (
      <span className="search-file-preview media">
        <img src={getFileThumbnailUrl(file.uuid)} alt="" loading="lazy" onError={() => setFailed(true)} />
        {file.category === 'VIDEO' && (
          <span className="search-video-badge">
            <Icon name="play" size={10} color="#fff" stroke={1.5} />
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="search-file-preview">
      <Icon name={getFileIconName(file)} size={21} color={getFileIconColor(file)} stroke={1.7} />
    </span>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatParentPath(file: FileResponseDto): string {
  const path = file.parentPath.trim();
  if (!path || path === '/') return '내 보관함';
  return path.replace(/^[/\\]+|[/\\]+$/g, '').replace(/[/\\]+/g, ' / ');
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function SearchScreen({ onOpenVideo, onOpenFile, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<'' | FileCategory>('');
  const [sort, setSort] = useState<FileSearchSortKey>('originUpdatedAt');
  const [order, setOrder] = useState<FileSearchOrder>('desc');
  const [items, setItems] = useState<FileResponseDto[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [openMenu, setOpenMenu] = useState<SearchMenu | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const requestSeqRef = useRef(0);
  const categoryBtnRef = useRef<HTMLButtonElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const orderBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const trimmedQuery = query.trim();

  const runSearch = useCallback(async (nextPage: number, mode: SearchMode) => {
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    if (!trimmedQuery) {
      setItems([]);
      setPage(0);
      setHasNext(false);
      setError('');
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (mode === 'append') setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const result = await searchFiles({
        query: trimmedQuery,
        category: category || undefined,
        sort,
        order,
        size: PAGE_SIZE,
        page: nextPage,
      });

      if (requestSeqRef.current !== requestId) return;
      setItems(prev => mode === 'append' ? [...prev, ...result.items] : result.items);
      setPage(nextPage);
      setHasNext(result.hasNext);
    } catch (err) {
      if (requestSeqRef.current !== requestId) return;
      setError(getErrorMessage(err, '검색 결과를 불러올 수 없습니다.'));
      if (mode === 'replace') {
        setItems([]);
        setHasNext(false);
        setPage(0);
      }
    } finally {
      if (requestSeqRef.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [category, order, sort, trimmedQuery]);

  useEffect(() => {
    if (!trimmedQuery) {
      requestSeqRef.current += 1;
      setItems([]);
      setPage(0);
      setHasNext(false);
      setError('');
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(0, 'replace');
    }, 280);
    return () => window.clearTimeout(timer);
  }, [runSearch, trimmedQuery]);

  useEffect(() => {
    if (!openMenu) return;

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      const activeButton = openMenu === 'category'
        ? categoryBtnRef.current
        : openMenu === 'sort'
          ? sortBtnRef.current
          : orderBtnRef.current;
      if (menuRef.current?.contains(target) || activeButton?.contains(target)) return;
      setOpenMenu(null);
    }

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openMenu]);

  function toggleMenu(menu: SearchMenu, button: HTMLButtonElement | null) {
    if (openMenu === menu) {
      setOpenMenu(null);
      return;
    }

    const rect = button?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setOpenMenu(menu);
  }

  function handleOpenFile(file: FileResponseDto) {
    if (file.category === 'VIDEO' && onOpenVideo) {
      onOpenVideo(file.id, file);
      return;
    }
    onOpenFile(file.id);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void runSearch(0, 'replace');
  }

  const showInitialEmpty = !trimmedQuery;
  const showNoResults = trimmedQuery && !loading && !error && items.length === 0;
  const categoryLabel = CATEGORY_OPTIONS.find(option => option.value === category)?.label ?? '전체';
  const sortLabel = SORT_OPTIONS.find(option => option.value === sort)?.label ?? '정렬';
  const orderLabel = ORDER_OPTIONS.find(option => option.value === order)?.label ?? '정렬 방향';

  return (
    <>
      <style>{searchStyles}</style>
      <div className="content search-content">
        <div className="search-page-head">
          <div>
            <h1>검색</h1>
            <p>파일명과 경로를 기준으로 전체 보관함에서 검색합니다</p>
          </div>
        </div>

        <form className="search-toolbar" onSubmit={handleSubmit}>
          <label className="search-input-wrap">
            <Icon name="search" size={17} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="파일명 검색"
              autoFocus
            />
          </label>
          <div className="search-custom-wrap">
            <button
              ref={categoryBtnRef}
              type="button"
              className="search-custom-btn"
              onClick={() => toggleMenu('category', categoryBtnRef.current)}
              aria-label="카테고리"
            >
              {categoryLabel}
              <Icon name="chevronD" size={11} />
            </button>
          </div>
          <div className="search-custom-wrap">
            <button
              ref={sortBtnRef}
              type="button"
              className="search-custom-btn"
              onClick={() => toggleMenu('sort', sortBtnRef.current)}
              aria-label="정렬 기준"
            >
              {sortLabel}
              <Icon name={order === 'asc' ? 'chevronU' : 'chevronD'} size={11} />
            </button>
          </div>
          <div className="search-custom-wrap">
            <button
              ref={orderBtnRef}
              type="button"
              className="search-custom-btn"
              onClick={() => toggleMenu('order', orderBtnRef.current)}
              aria-label="정렬 방향"
            >
              {orderLabel}
              <Icon name={order === 'asc' ? 'chevronU' : 'chevronD'} size={11} />
            </button>
          </div>
          <button type="submit" className="btn primary search-submit-btn">
            <Icon name="search" size={15} color="var(--accent-fg)" />
            검색
          </button>
          {openMenu && menuPos && (
            <div
              ref={menuRef}
              className="search-custom-menu"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              {openMenu === 'category' && CATEGORY_OPTIONS.map(option => (
                <button
                  key={option.value || 'all'}
                  type="button"
                  className={`search-custom-item${option.value === category ? ' active' : ''}`}
                  onClick={() => { setCategory(option.value); setOpenMenu(null); }}
                >
                  {option.label}
                  {option.value === category && <Icon name="check" size={13} />}
                </button>
              ))}
              {openMenu === 'sort' && SORT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`search-custom-item${option.value === sort ? ' active' : ''}`}
                  onClick={() => { setSort(option.value); setOpenMenu(null); }}
                >
                  {option.label}
                  {option.value === sort && <Icon name="check" size={13} />}
                </button>
              ))}
              {openMenu === 'order' && ORDER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`search-custom-item${option.value === order ? ' active' : ''}`}
                  onClick={() => { setOrder(option.value); setOpenMenu(null); }}
                >
                  {option.label}
                  {option.value === order && <Icon name={option.value === 'asc' ? 'chevronU' : 'chevronD'} size={13} />}
                </button>
              ))}
            </div>
          )}
        </form>

        {error && <div className="search-error">{error}</div>}

        {showInitialEmpty ? (
          <div className="search-empty">
            <div className="search-empty-icon"><Icon name="search" size={32} stroke={1.4} /></div>
            <div className="search-empty-title">검색어를 입력하세요</div>
          </div>
        ) : loading ? (
          <div className="search-loading">
            <Icon name="spinner" size={24} className="spin-icon" />
          </div>
        ) : showNoResults ? (
          <div className="search-empty">
            <div className="search-empty-icon"><Icon name="files" size={32} stroke={1.4} /></div>
            <div className="search-empty-title">검색 결과가 없습니다</div>
          </div>
        ) : (
          <div className="search-results">
            <div className="search-results-head">
              <span>{items.length}개 결과</span>
              {hasNext && <span>더 많은 결과가 있습니다</span>}
            </div>
            <div className="search-list">
              {items.map(file => (
                <button key={file.id} className="search-row" onClick={() => handleOpenFile(file)}>
                  <SearchFilePreview file={file} />
                  <span className="search-row-main">
                    <span className="search-file-name">{file.name}</span>
                    <span className="search-file-path">{formatParentPath(file)}</span>
                  </span>
                  <span className="search-row-meta">
                    <span>{CATEGORY_LABEL[file.category]}</span>
                    <span>{formatBytes(file.size)}</span>
                    <span>{formatDate(file.originUpdatedAt)}</span>
                  </span>
                  <Icon name="chevronR" size={15} />
                </button>
              ))}
            </div>
            {hasNext && (
              <div className="search-more">
                <button className="btn" onClick={() => void runSearch(page + 1, 'append')} disabled={loadingMore}>
                  {loadingMore ? <Icon name="spinner" size={15} className="spin-icon" /> : <Icon name="plus" size={15} />}
                  더 보기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const searchStyles = `
  .search-content{
    padding-top:24px;
  }
  .search-page-head{
    display:flex;
    align-items:flex-end;
    justify-content:space-between;
    gap:16px;
    margin-bottom:14px;
  }
  .search-page-head h1{
    margin:0;
    font-size:22px;
    font-weight:800;
    color:var(--fg);
  }
  .search-page-head p{
    margin:5px 0 0;
    font-size:13px;
    color:var(--fg-3);
  }
  .search-toolbar{
    display:flex;
    align-items:center;
    gap:8px;
    padding:0 0 16px;
  }
  .search-input-wrap{
    flex:1;
    min-width:220px;
    height:38px;
    display:flex;
    align-items:center;
    gap:9px;
    padding:0 12px;
    border:1px solid var(--border);
    border-radius:8px;
    background:var(--bg);
    color:var(--fg-3);
  }
  .search-input-wrap:focus-within{
    border-color:var(--accent);
    box-shadow:0 0 0 3px rgba(49, 88, 255, .12);
  }
  .search-input-wrap input{
    width:100%;
    min-width:0;
    border:0;
    outline:0;
    background:transparent;
    color:var(--fg);
    font:inherit;
    font-size:14px;
  }
  .search-custom-wrap{
    display:block;
    position:relative;
    flex:0 0 auto;
  }
  .search-custom-btn{
    height:38px;
    display:flex;
    align-items:center;
    gap:5px;
    padding:0 10px;
    border:1px solid var(--border-soft);
    border-radius:8px;
    background:var(--bg);
    color:var(--fg-2);
    font:inherit;
    font-size:13px;
    font-weight:650;
    white-space:nowrap;
  }
  .search-custom-btn:hover{
    background:var(--surface-1);
    color:var(--accent);
  }
  .search-custom-menu{
    position:fixed;
    background:var(--bg);
    border:1px solid var(--border-soft);
    border-radius:10px;
    box-shadow:var(--shadow-md);
    z-index:200;
    overflow:hidden;
    min-width:140px;
  }
  .search-custom-item{
    width:100%;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding:9px 14px;
    border:0;
    background:transparent;
    font:inherit;
    font-size:13px;
    font-weight:600;
    color:var(--fg-2);
    text-align:left;
    cursor:pointer;
  }
  .search-custom-item:hover{
    background:var(--surface-1);
    color:var(--fg);
  }
  .search-custom-item.active{
    color:var(--accent);
    background:var(--accent-soft);
  }
  .search-submit-btn{
    height:38px;
  }
  .search-error{
    padding:12px 16px;
    background:rgba(220,75,62,0.1);
    border-radius:10px;
    color:var(--bad);
    margin-bottom:16px;
  }
  .search-loading{
    display:flex;
    justify-content:center;
    padding:60px;
    color:var(--fg-3);
  }
  .search-empty{
    display:flex;
    flex-direction:column;
    align-items:center;
    padding:80px 24px;
    color:var(--fg-3);
    text-align:center;
  }
  .search-empty-icon{
    width:72px;
    height:72px;
    border-radius:18px;
    background:var(--surface-1);
    display:grid;
    place-items:center;
    margin-bottom:16px;
  }
  .search-empty-title{
    font-size:16px;
    font-weight:600;
    color:var(--fg);
  }
  .search-results-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    margin:0 0 10px;
    color:var(--fg-3);
    font-size:12.5px;
    font-weight:650;
  }
  .search-list{
    border:1px solid var(--border-soft);
    border-radius:12px;
    overflow:hidden;
    background:var(--bg);
    box-shadow:var(--shadow-sm);
  }
  .search-row{
    width:100%;
    display:grid;
    grid-template-columns:42px minmax(0, 1fr) auto 20px;
    align-items:center;
    gap:12px;
    min-height:62px;
    padding:10px 14px;
    border:0;
    border-bottom:1px solid var(--hairline);
    background:transparent;
    color:var(--fg);
    text-align:left;
    font:inherit;
  }
  .search-row:last-child{
    border-bottom:0;
  }
  .search-row:hover{
    background:var(--surface-1);
  }
  .search-file-preview{
    position:relative;
    width:40px;
    height:40px;
    border-radius:10px;
    display:grid;
    place-items:center;
    overflow:hidden;
    background:var(--accent-soft);
  }
  .search-file-preview.media{
    background:var(--surface-2);
  }
  .search-file-preview img{
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
  }
  .search-video-badge{
    position:absolute;
    right:4px;
    bottom:4px;
    width:18px;
    height:18px;
    border-radius:50%;
    display:grid;
    place-items:center;
    padding-left:1px;
    background:rgba(15, 16, 21, .72);
  }
  .search-row-main{
    min-width:0;
    display:flex;
    flex-direction:column;
    gap:4px;
  }
  .search-file-name{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:13.5px;
    font-weight:750;
  }
  .search-file-path{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--fg-3);
    font-size:12px;
    font-weight:500;
  }
  .search-row-meta{
    display:flex;
    align-items:center;
    gap:10px;
    color:var(--fg-3);
    font-size:12px;
    font-variant-numeric:tabular-nums;
    white-space:nowrap;
  }
  .search-more{
    display:flex;
    justify-content:center;
    padding:14px 0 0;
  }
  @media (max-width: 900px) {
    .search-toolbar{
      flex-wrap:wrap;
    }
    .search-input-wrap{
      flex-basis:100%;
    }
    .search-submit-btn{
      flex:1 1 0;
      min-width:0;
    }
    .search-custom-wrap{
      flex:0 0 auto;
    }
  }
  @media (max-width: 768px) {
    .search-content{
      padding-top:14px;
    }
    .search-row{
      grid-template-columns:40px minmax(0, 1fr) 18px;
      gap:10px;
      padding:10px;
    }
    .search-row-meta{
      display:none;
    }
    .search-results-head{
      flex-direction:column;
      align-items:flex-start;
      gap:4px;
    }
  }
`;
