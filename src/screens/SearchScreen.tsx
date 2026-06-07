import { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { getFolder } from '../api/folders';
import { getFileContentUrl, formatBytes } from '../api/files';
import type { FileResponseDto } from '../types';

interface Props {
  rootFolderId: number | null;
  onOpenVideo: (fileId: number) => void;
  initialQuery?: string;
}

const CATEGORY_ICON: Record<string, string> = {
  IMAGE: 'image', VIDEO: 'videoFile', AUDIO: 'audioFile',
  DOCUMENT: 'doc', ARCHIVE: 'archive', ETC: 'doc', UNKNOWN: 'doc',
};

export function SearchScreen({ rootFolderId, onOpenVideo, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [allFiles, setAllFiles] = useState<FileResponseDto[]>([]);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rootFolderId) return;
    loadAllFiles(rootFolderId);
  }, [rootFolderId]);

  async function loadAllFiles(folderId: number, depth = 0): Promise<FileResponseDto[]> {
    if (depth > 3) return [];
    if (depth === 0) setLoading(true);
    try {
      const folder = await getFolder(folderId);
      const subFiles: FileResponseDto[][] = await Promise.all(
        folder.folders.map(sf => loadAllFiles(sf.id, depth + 1))
      );
      const all: FileResponseDto[] = [...folder.files, ...subFiles.flat()];
      if (depth === 0) {
        setAllFiles(all);
        setLoading(false);
      }
      return all;
    } catch {
      if (depth === 0) setLoading(false);
      return [];
    }
  }

  const filtered = allFiles.filter(f => {
    const matchesQuery = !query || f.name.toLowerCase().includes(query.toLowerCase());
    const matchesCat = filterCat === 'all' || f.category === filterCat;
    return matchesQuery && matchesCat;
  });

  const grouped = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'ARCHIVE', 'ETC', 'UNKNOWN'].map(cat => ({
    cat,
    items: filtered.filter(f => f.category === cat),
  })).filter(g => g.items.length > 0);

  const catLabels: Record<string, string> = {
    IMAGE: '이미지', VIDEO: '비디오', AUDIO: '오디오', DOCUMENT: '문서',
    ARCHIVE: '압축파일', ETC: '기타', UNKNOWN: '미분류',
  };

  function highlight(text: string) {
    if (!query) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return <>{text}</>;
    return <>
      {text.slice(0, idx)}
      <span style={{ background: 'rgba(255,213,79,0.35)', padding: '0 2px', borderRadius: 3 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>;
  }

  return (
    <>
      <style>{searchStyles}</style>
      <div className="search-hero">
        <div className="search-input focus">
          <Icon name="search" size={18} color="var(--fg-3)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            placeholder="파일 이름으로 검색..."
          />
          {query && (
            <button style={{ background: 'transparent', border: 0, color: 'var(--fg-3)' }} onClick={() => setQuery('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="filter-pills">
          {['all', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'ARCHIVE'].map(cat => (
            <button key={cat}
              className={'filter-pill' + (filterCat === cat ? ' on' : '')}
              onClick={() => setFilterCat(cat)}>
              {cat !== 'all' && <Icon name={CATEGORY_ICON[cat] || 'doc'} size={12} />}
              {cat === 'all' ? '전체' : catLabels[cat]}
              {filterCat === cat && cat !== 'all' && <Icon name="close" size={11} style={{ marginLeft: 2, opacity: 0.7 }} />}
            </button>
          ))}
        </div>
      </div>

      <div className="result-meta">
        <div><strong style={{ color: 'var(--fg)', fontWeight: 600 }}>{filtered.length}개</strong> 결과{query && ` · "${query}"`}</div>
      </div>

      <div className="content" style={{ paddingTop: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--fg-3)' }}>
            <Icon name="spinner" size={24} /> 파일 목록 불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--fg-3)' }}>
            {query ? `"${query}"에 대한 결과가 없습니다.` : '검색어를 입력하세요.'}
          </div>
        ) : (
          <div className="search-section" style={{ padding: 0 }}>
            {grouped.map(g => (
              <div key={g.cat}>
                <div className="section-title">
                  <Icon name={CATEGORY_ICON[g.cat] || 'doc'} size={12} />
                  {catLabels[g.cat]}
                  <span className="c">{g.items.length}</span>
                </div>
                {g.cat === 'IMAGE' ? (
                  <div className="img-strip">
                    {g.items.map(f => (
                      <div key={f.id} className="gphoto"
                        style={{ background: 'var(--surface-2)', position: 'relative', overflow: 'hidden', aspectRatio: '1', borderRadius: 10, cursor: 'pointer' }}
                        onClick={() => window.open(getFileContentUrl(f.id, false))}>
                        <img
                          src={getFileContentUrl(f.id, false)}
                          alt={f.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  g.items.map(f => (
                    <div key={f.id} className="res-row"
                      onClick={() => f.category === 'VIDEO' ? onOpenVideo(f.id) : window.open(getFileContentUrl(f.id, true))}>
                      <div className="res-thumb" style={{
                        background: f.category === 'VIDEO' ? 'linear-gradient(135deg, #2c2c2e, #1c1c1e)'
                          : f.category === 'AUDIO' ? 'linear-gradient(135deg, hsl(280 60% 55%), hsl(310 60% 35%))'
                          : 'var(--bg-3)',
                      }}>
                        <Icon name={CATEGORY_ICON[f.category] || 'doc'} size={18}
                          color={f.category === 'VIDEO' || f.category === 'AUDIO' ? '#fff' : 'var(--fg-3)'} stroke={1.5} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="res-name">{highlight(f.name)}</div>
                        <div className="res-path">{f.parentPath}</div>
                      </div>
                      <div className="res-meta">
                        {f.videoCodec && <span className="badge-codec">{f.videoCodec}</span>}
                        {f.audioCodec && <span className="badge-codec">{f.audioCodec}</span>}
                      </div>
                      <div className="res-meta">{formatBytes(f.size)}</div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const searchStyles = `
  .search-hero{
    padding:32px 28px 16px;
    border-bottom:.5px solid var(--hairline);
  }
  .search-input{
    display:flex; align-items:center; gap:12px;
    height:48px; padding:0 16px;
    background:var(--bg-2);
    border:.5px solid var(--border);
    border-radius:14px;
    box-shadow:var(--shadow-sm);
  }
  .search-input.focus{
    border-color:var(--accent);
    box-shadow:0 0 0 4px var(--accent-soft);
  }
  .search-input input{
    flex:1; border:0; background:transparent; color:var(--fg);
    font:inherit; font-size:16px; outline:none;
  }

  .filter-pills{
    display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;
  }
  .filter-pill{
    display:inline-flex; align-items:center; gap:5px;
    height:28px; padding:0 12px;
    border-radius:99px;
    background:var(--bg-2); border:.5px solid var(--border);
    color:var(--fg-2); font-size:12.5px; font-weight:500;
    cursor:pointer;
  }
  .filter-pill:hover{background:var(--surface-1)}
  .filter-pill.on{
    background:var(--accent); color:#fff; border-color:transparent;
  }

  .result-meta{
    padding:14px 28px;
    display:flex; align-items:center; justify-content:space-between;
    font-size:12.5px; color:var(--fg-3);
  }

  .search-section{ padding:0 28px 28px; }
  .section-title{
    display:flex; align-items:center; gap:8px;
    font-size:11.5px; font-weight:600; text-transform:uppercase;
    letter-spacing:0.06em; color:var(--fg-3);
    margin:18px 0 10px;
  }
  .section-title .c{
    background:rgba(0,0,0,0.06); padding:1px 7px; border-radius:99px;
    color:var(--fg-3); text-transform:none; letter-spacing:0;
  }
  [data-theme="dark"] .section-title .c{background:rgba(255,255,255,0.08)}

  .res-row{
    display:grid;
    grid-template-columns: 40px minmax(0,1fr) 110px 120px;
    align-items:center; gap:14px;
    padding:10px 14px;
    border-radius:10px;
    cursor:pointer;
  }
  .res-row:hover{background:rgba(0,0,0,0.03)}
  [data-theme="dark"] .res-row:hover{background:rgba(255,255,255,0.04)}
  .res-thumb{
    width:40px; height:40px; border-radius:8px; display:grid; place-items:center;
  }
  .res-path{font-size:11.5px; color:var(--fg-3); margin-top:1px;
    font-family:'JetBrains Mono',monospace;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .res-name{
    font-size:13.5px; font-weight:500;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .res-meta{font-size:12px; color:var(--fg-3); text-align:right; font-variant-numeric:tabular-nums}

  .img-strip{
    display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));
    gap:8px; margin-top:4px;
  }
`;
