import { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { getFolder } from '../api/folders';
import { getFileThumbnailUrl } from '../api/files';
import type { FileResponseDto } from '../types';

interface Props {
  rootFolderId: number | null;
  onOpenVideo: (fileId: number, fileData?: FileResponseDto) => void;
  onOpenFile: (fileId: number) => void;
}

interface DayGroup {
  label: string;
  items: FileResponseDto[];
}

function groupByDate(files: FileResponseDto[]): DayGroup[] {
  const map = new Map<string, FileResponseDto[]>();
  files.forEach(f => {
    const date = (f.capturedAt || f.createdAt).slice(0, 10);
    const label = new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(f);
  });
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function formatDuration(val: number): string {
  const s = Math.floor(val > 50000 ? val / 1000 : val);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function GalleryScreen({ rootFolderId, onOpenVideo, onOpenFile }: Props) {
  const [zoom, setZoom] = useState<'s' | 'm' | 'l'>('m');
  const [filter, setFilter] = useState<'all' | 'photo' | 'video'>('all');
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (rootFolderId == null) return;
    loadMedia(rootFolderId);
  }, [rootFolderId]);

  async function loadMedia(folderId: number) {
    setLoading(true);
    try {
      const folder = await getFolder(folderId);
      const mediaFiles = folder.files.filter(f => f.category === 'IMAGE' || f.category === 'VIDEO');

      // Also search subfolders (one level deep for performance)
      const subResults = await Promise.all(
        folder.folders.map(sf => getFolder(sf.id).then(sf2 => sf2.files.filter(f => f.category === 'IMAGE' || f.category === 'VIDEO')).catch(() => [] as FileResponseDto[]))
      );
      const all = [...mediaFiles, ...subResults.flat()].sort(
        (a, b) => new Date(b.capturedAt || b.createdAt).getTime() - new Date(a.capturedAt || a.createdAt).getTime()
      );
      setDays(groupByDate(all));
    } finally {
      setLoading(false);
    }
  }

  const filtered = days.map(d => ({
    ...d,
    items: d.items.filter(f =>
      filter === 'all' ? true :
      filter === 'photo' ? f.category === 'IMAGE' :
      f.category === 'VIDEO'
    )
  })).filter(d => d.items.length > 0);

  return (
    <>
      <style>{galleryStyles}</style>
      <div className="pagebar">
        <h1>갤러리</h1>
        <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>{days.reduce((a, d) => a + d.items.length, 0)}개 항목</span>
      </div>
      <div className="gallery-toolbar">
        <div className="seg">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>모두</button>
          <button className={filter === 'photo' ? 'on' : ''} onClick={() => setFilter('photo')}>사진</button>
          <button className={filter === 'video' ? 'on' : ''} onClick={() => setFilter('video')}>비디오</button>
        </div>
        <div className="spacer" />
        <div className="seg">
          <button className={zoom === 's' ? 'on' : ''} onClick={() => setZoom('s')}>S</button>
          <button className={zoom === 'm' ? 'on' : ''} onClick={() => setZoom('m')}>M</button>
          <button className={zoom === 'l' ? 'on' : ''} onClick={() => setZoom('l')}>L</button>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--fg-3)' }}>
            <Icon name="spinner" size={24} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 24px', color: 'var(--fg-3)', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--surface-1)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
              <Icon name="gallery" size={32} stroke={1.4} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>미디어 파일이 없습니다</div>
          </div>
        ) : filtered.map((day, di) => (
          <div className="gallery-day" key={di}>
            <div className="gallery-day-h">
              <div className="d">{day.label}</div>
              <div className="c">{day.items.length}개</div>
            </div>
            <div className={'gallery-grid zoom-' + zoom}>
              {day.items.map((f) => (
                <div key={f.id}
                  className="gphoto"
                  style={{ background: 'var(--surface-2)', position: 'relative', overflow: 'hidden' }}
                  onClick={() => f.category === 'VIDEO' ? onOpenVideo(f.id, f) : onOpenFile(f.id)}>
                  {f.category === 'IMAGE' ? (
                    <img
                      src={getFileThumbnailUrl(f.uuid)}
                      alt={f.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #2a2730, #19171d)' }}>
                      <Icon name="play" size={28} color="#fff" />
                    </div>
                  )}
                  {f.category === 'VIDEO' && f.duration != null && (
                    <div className="badge-vid">
                      <Icon name="play" size={9} color="#fff" stroke={2} /> {formatDuration(f.duration)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const galleryStyles = `
  .gallery-toolbar{
    display:flex; align-items:center; gap:10px;
    padding:0 24px 14px;
  }
  .gallery-toolbar .spacer{flex:1}

  .gallery-day{ margin-bottom:28px; }
  .gallery-day-h{
    display:flex; align-items:baseline; justify-content:space-between;
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
    aspect-ratio:1;
    border-radius:10px;
    overflow:hidden;
    cursor:pointer;
  }
  .gphoto .badge-vid{
    position:absolute; bottom:8px; right:8px;
    display:flex; align-items:center; gap:4px;
    background:rgba(0,0,0,0.55); color:#fff;
    backdrop-filter:blur(8px);
    padding:3px 7px; border-radius:5px;
    font-size:10.5px; font-weight:500;
  }
  .gphoto:hover{transform:scale(0.985); transition:transform .12s ease}
`;
