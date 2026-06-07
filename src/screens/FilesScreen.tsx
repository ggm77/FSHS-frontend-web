import { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { getFolder, createFolder, deleteFolder, getFolderDownloadUrl } from '../api/folders';
import { uploadFile, deleteFile, getFileContentUrl, formatBytes } from '../api/files';
import type { FolderResponseDto, SimpleFolderResponseDto, FileResponseDto } from '../types';

interface Props {
  rootFolderId: number | null;
  onOpenVideo: (fileId: number) => void;
  onOpenFile: (fileId: number) => void;
}

const CATEGORY_ICON: Record<string, string> = {
  IMAGE: 'image', VIDEO: 'videoFile', AUDIO: 'audioFile',
  DOCUMENT: 'doc', ARCHIVE: 'archive', ETC: 'doc', UNKNOWN: 'doc',
};

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function FilesScreen({ rootFolderId, onOpenVideo, onOpenFile }: Props) {
  const [folder, setFolder] = useState<FolderResponseDto | null>(null);
  const [path, setPath] = useState<{ id: number; name: string }[]>([]);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : rootFolderId;

  useEffect(() => {
    if (rootFolderId == null) return;
    loadFolder(rootFolderId, true);
  }, [rootFolderId]);

  async function loadFolder(folderId: number, reset = false) {
    setLoading(true);
    setError('');
    try {
      const data = await getFolder(folderId);
      setFolder(data);
      if (reset) setPath([]);
    } catch {
      setError('폴더를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function navigateTo(f: SimpleFolderResponseDto) {
    setPath(prev => [...prev, { id: f.id, name: f.name }]);
    loadFolder(f.id);
  }

  function navigateBreadcrumb(idx: number) {
    if (idx < 0) {
      loadFolder(rootFolderId!, true);
    } else {
      const newPath = path.slice(0, idx + 1);
      setPath(newPath);
      loadFolder(newPath[idx].id);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || currentFolderId == null) return;
    setCreatingFolder(true);
    try {
      await createFolder(currentFolderId, newFolderName.trim());
      setNewFolderName('');
      loadFolder(currentFolderId);
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleDeleteFolder(folderId: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('폴더를 삭제하시겠습니까?')) return;
    await deleteFolder(folderId);
    loadFolder(currentFolderId!);
  }

  async function handleDeleteFile(fileId: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('파일을 삭제하시겠습니까?')) return;
    await deleteFile(fileId);
    loadFolder(currentFolderId!);
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !currentFolderId) return;
    setUploading(true);
    setUploadPct(0);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(currentFolderId, file, setUploadPct);
      }
      await new Promise(r => setTimeout(r, 500));
      loadFolder(currentFolderId);
    } finally {
      setUploading(false);
    }
  }

  const crumbItems = [
    { label: '내 보관함', onClick: () => { loadFolder(rootFolderId!, true); } },
    ...path.map((p, i) => ({ label: p.name, onClick: () => navigateBreadcrumb(i) })),
  ];

  return (
    <>
      <style>{filesStyles}</style>
      <div className="content">
        {error && <div style={{ padding: '12px 16px', background: 'rgba(220,75,62,0.1)', borderRadius: 10, color: 'var(--bad)', marginBottom: 16 }}>{error}</div>}

        {/* Breadcrumb */}
        {path.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 13, color: 'var(--fg-3)' }}>
            {crumbItems.map((c, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <Icon name="chevronR" size={12} />}
                <button className="btn ghost" style={{ height: 28, padding: '0 8px', fontSize: 13 }} onClick={c.onClick}>{c.label}</button>
              </span>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="files-toolbar">
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
          <button className="btn primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Icon name="upload" size={16} color="var(--accent-fg)" />
            {uploading ? `업로드 중 ${uploadPct}%` : '업로드'}
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn" onClick={() => setNewFolderName(v => v ? '' : '새 폴더')}>
              <Icon name="plus" size={15} /> 새 폴더
            </button>
            {newFolderName !== '' && (
              <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 20, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, boxShadow: 'var(--shadow-md)', display: 'flex', gap: 8 }}>
                <input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  autoFocus
                  style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', font: 'inherit', background: 'var(--bg)', color: 'var(--fg)', outline: 'none' }}
                />
                <button className="btn primary" style={{ height: 32 }} onClick={handleCreateFolder} disabled={creatingFolder}>만들기</button>
                <button className="btn" style={{ height: 32 }} onClick={() => setNewFolderName('')}>취소</button>
              </div>
            )}
          </div>
          <div className="spacer" />
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
            {/* Folders */}
            {folder.folders.length > 0 && (
              <>
                <div className="section-h">
                  <div className="t">폴더</div>
                  <span className="a">{folder.folders.length}개</span>
                </div>
                <div className="folder-grid">
                  {folder.folders.map((f) => (
                    <div className="folder-card" key={f.id} onClick={() => navigateTo(f)}>
                      <div className="fi"><Icon name="folder" size={21} color="var(--c-folder)" stroke={1.7} /></div>
                      <div className="txt">
                        <div className="nm">{f.name}</div>
                        <div className="meta">{formatDate(f.originUpdatedAt)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="more" title="폴더 다운로드" onClick={e => { e.stopPropagation(); window.open(getFolderDownloadUrl(f.id)); }}>
                          <Icon name="download" size={14} />
                        </button>
                        <button className="more" title="열기" onClick={() => navigateTo(f)}>
                          <Icon name="folderOpen" size={14} />
                        </button>
                        <button className="more" title="삭제" onClick={e => handleDeleteFolder(f.id, e)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Files */}
            {folder.files.length > 0 && (
              <>
                <div className="section-h">
                  <div className="t">파일</div>
                  <span className="a">{folder.files.length}개</span>
                </div>
                {view === 'list' ? (
                  <div className="card file-card">
                    <div className="file-row head">
                      <div>이름</div>
                      <div>수정일</div>
                      <div>종류</div>
                      <div style={{ textAlign: 'right' }}>크기</div>
                      <div />
                    </div>
                    {folder.files.map((f, i) => (
                      <div key={f.id}
                        className={'file-row' + (selected === i ? ' selected' : '')}
                        onClick={() => {
                          setSelected(i);
                          if (f.category === 'VIDEO') onOpenVideo(f.id);
                          else onOpenFile(f.id);
                        }}>
                        <div className="file-name">
                          <div className="file-thumb-sm">
                            <FileIcon file={f} size={20} />
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
                          <button className="row-action" title="다운로드" onClick={e => { e.stopPropagation(); window.open(getFileContentUrl(f.id, true)); }}>
                            <Icon name="download" size={14} />
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
                    {folder.files.map((f) => (
                      <div className="grid-card" key={f.id}
                        onClick={() => {
                          if (f.category === 'VIDEO') onOpenVideo(f.id);
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
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {folder.folders.length === 0 && folder.files.length === 0 && (
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
    </>
  );
}

const filesStyles = `
  .files-toolbar{
    display:flex; align-items:center; gap:10px;
    padding:4px 2px 16px;
  }
  .files-toolbar .spacer{ flex:1; }

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
    background:rgba(179,154,107,0.16);
  }
  .folder-card .nm{ font-size:13.5px; font-weight:600; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .folder-card .meta{ font-size:11.5px; color:var(--fg-3); margin-top:3px; white-space:nowrap; }
  .folder-card .more{ width:28px; height:28px; border-radius:8px; border:0; background:transparent; color:var(--fg-3); display:grid; place-items:center; }
  .folder-card .more:hover{ background:var(--surface-1); color:var(--fg); }

  .file-card{ overflow:hidden; }
  .file-row{
    display:grid;
    grid-template-columns: minmax(0, 2.6fr) 1.1fr 1.1fr 0.9fr 80px;
    align-items:center; gap:14px;
    padding:0 16px; height:48px;
    border-top:1px solid var(--hairline);
    cursor:default;
  }
  .file-row.head{
    border-top:0; height:42px;
    font-size:12px; font-weight:650; color:var(--fg-3);
    text-transform:uppercase; letter-spacing:0.03em;
    background:var(--bg-3);
  }
  .file-row:not(.head):hover{ background:var(--surface-1); }
  .file-row.selected{ background:var(--accent-soft) !important; }

  .file-name{ display:flex; align-items:center; gap:13px; min-width:0; font-size:13.5px; font-weight:550; color:var(--fg); }
  .file-name .nm{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .file-thumb-sm{ width:26px; height:26px; border-radius:7px; flex-shrink:0; display:grid; place-items:center; overflow:hidden; }
  .file-meta{ font-size:13px; color:var(--fg-3); font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row-action{ width:28px; height:28px; border-radius:8px; display:grid; place-items:center; color:var(--fg-3); background:transparent; border:0; }
  .row-action:hover{ background:var(--surface-2); color:var(--fg); }

  .file-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(196px, 1fr)); gap:12px; }
  .grid-card{ border:1px solid var(--border-soft); border-radius:14px; overflow:hidden; cursor:default; background:var(--bg-2); box-shadow:var(--shadow-sm); }
  .grid-card:hover{ box-shadow:var(--shadow-md); }
  .grid-card .gc-head{ display:flex; align-items:center; gap:10px; padding:12px 12px 10px; font-size:13px; font-weight:600; }
  .grid-card .gc-head .nm{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .grid-card .gc-prev{ height:130px; margin:0 12px 12px; border-radius:9px; background:var(--surface-1); display:grid; place-items:center; overflow:hidden; position:relative; }
`;
