import { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { getFolder } from '../api/folders';
import { getFileContentUrl, formatBytes } from '../api/files';
import type { FileResponseDto } from '../types';

interface Props {
  rootFolderId: number | null;
}

export function MusicScreen({ rootFolderId }: Props) {
  const [tracks, setTracks] = useState<FileResponseDto[]>([]);
  const [current, setCurrent] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!rootFolderId) return;
    loadAudio(rootFolderId);
  }, [rootFolderId]);

  async function loadAudio(folderId: number) {
    try {
      const folder = await getFolder(folderId);
      const audioFiles = folder.files.filter(f => f.category === 'AUDIO');
      // Also check subfolders
      const subResults = await Promise.all(
        folder.folders.map(sf => getFolder(sf.id).then(sf2 => sf2.files.filter(f => f.category === 'AUDIO')).catch(() => [] as FileResponseDto[]))
      );
      setTracks([...audioFiles, ...subResults.flat()]);
    } catch { /* ignore */ }
  }

  const track = tracks[current];

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause(); else a.play();
    setPlaying(!playing);
  }

  function prevTrack() { setCurrent(c => Math.max(0, c - 1)); setPlaying(false); }
  function nextTrack() { setCurrent(c => Math.min(tracks.length - 1, c + 1)); setPlaying(false); }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!rootFolderId || tracks.length === 0) {
    return (
      <div className="music-page">
        <style>{musicStyles}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--fg-3)' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--surface-1)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
            <Icon name="music" size={32} stroke={1.4} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>오디오 파일이 없습니다</div>
        </div>
      </div>
    );
  }

  return (
    <div className="music-page">
      <style>{musicStyles}</style>
      {track && (
        <audio
          ref={audioRef}
          src={getFileContentUrl(track.id, false)}
          onTimeUpdate={() => { setCurrentTime(audioRef.current?.currentTime || 0); }}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
          onEnded={nextTrack}
        />
      )}

      <div className="now-playing">
        <div className="album-art-lg" style={{ background: 'linear-gradient(135deg, hsl(195 60% 45%), hsl(220 70% 25%))' }} />
        <div className="np-title">{track?.baseName || '—'}</div>
        <div className="np-artist">{track?.extension?.toUpperCase() || ''} · {track ? formatBytes(track.size) : ''}</div>

        <div className="np-scrubber">
          <div className="bar">
            <div className="p" style={{ width: pct + '%' }} />
          </div>
          <div className="times">
            <span>{formatTime(currentTime)}</span>
            <span>—{formatTime(duration)}</span>
          </div>
        </div>

        <div className="np-controls">
          <button className="np-btn" onClick={prevTrack}><Icon name="prev" size={20} stroke={1.5} /></button>
          <button className="np-btn play" onClick={togglePlay}>
            <Icon name={playing ? 'pause' : 'play'} size={22} stroke={1.5} />
          </button>
          <button className="np-btn" onClick={nextTrack}><Icon name="next" size={20} stroke={1.5} /></button>
        </div>

        <div className="np-output">
          <div className="dot" />
          <div>오디오 출력</div>
        </div>
      </div>

      <div className="queue-pane">
        <div className="queue-tabs">
          <div className="tab on">재생목록</div>
        </div>

        <div className="queue-list">
          {tracks.map((t, i) => (
            <div key={t.id}
              className={'queue-row' + (i === current ? ' playing' : '')}
              onClick={() => { setCurrent(i); setPlaying(false); setTimeout(() => audioRef.current?.play().then(() => setPlaying(true)).catch(() => {}), 50); }}>
              <div className="n">
                {i === current ? (
                  <div className="eq"><i /><i /><i /></div>
                ) : i + 1}
              </div>
              <div className="qart" />
              <div style={{ minWidth: 0 }}>
                <div className="t" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.baseName}</div>
                <div className="a">{t.extension?.toUpperCase()}</div>
              </div>
              <div className="dur">{formatBytes(t.size)}</div>
              <button className="more" onClick={e => e.stopPropagation()}><Icon name="more" size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const musicStyles = `
  .music-page{
    display:grid;
    grid-template-columns: 1fr 380px;
    height:100%;
    background:var(--bg);
    overflow:hidden;
  }

  .now-playing{
    display:flex; flex-direction:column; align-items:center;
    padding:40px;
    overflow-y:auto;
  }
  .album-art-lg{
    width:100%; max-width:300px; aspect-ratio:1;
    border-radius:16px;
    box-shadow:0 30px 80px rgba(0,0,0,0.25);
    margin-bottom:28px;
  }
  .np-title{
    font-size:22px; font-weight:700; letter-spacing:-0.015em;
    text-align:center; max-width:280px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .np-artist{
    font-size:14px; color:var(--fg-3);
    text-align:center; margin-top:4px;
  }

  .np-scrubber{
    width:100%; max-width:380px; margin-top:24px;
  }
  .np-scrubber .bar{
    height:4px; border-radius:99px;
    background:rgba(0,0,0,0.08); overflow:hidden; position:relative;
  }
  [data-theme="dark"] .np-scrubber .bar{background:rgba(255,255,255,0.12)}
  .np-scrubber .bar .p{
    height:100%; background:var(--fg); border-radius:99px;
  }
  .np-scrubber .times{
    display:flex; justify-content:space-between;
    font-size:11px; color:var(--fg-3); margin-top:6px;
    font-variant-numeric:tabular-nums; font-family:'JetBrains Mono',monospace;
  }

  .np-controls{
    display:flex; align-items:center; gap:18px; margin-top:14px;
  }
  .np-btn{
    background:transparent; border:0; color:var(--fg-2);
    width:40px; height:40px; border-radius:50%;
    display:grid; place-items:center;
  }
  .np-btn:hover{background:rgba(0,0,0,0.06); color:var(--fg)}
  [data-theme="dark"] .np-btn:hover{background:rgba(255,255,255,0.08)}
  .np-btn.play{
    width:60px; height:60px;
    background:var(--fg); color:var(--bg);
    box-shadow:0 6px 20px rgba(0,0,0,0.15);
  }
  .np-btn.play:hover{opacity:0.92}

  .np-output{
    margin-top:auto; padding-top:24px;
    display:flex; align-items:center; gap:10px;
    color:var(--fg-3); font-size:12px;
  }
  .np-output .dot{width:6px; height:6px; border-radius:50%; background:var(--good)}

  .queue-pane{
    background:var(--bg-2);
    border-left:.5px solid var(--border);
    display:flex; flex-direction:column; min-height:0; overflow:hidden;
  }
  .queue-tabs{
    display:flex; padding:14px 18px 0; gap:18px;
    border-bottom:.5px solid var(--hairline);
  }
  .queue-tabs .tab{
    padding:8px 0 10px; font-size:13px; font-weight:600; color:var(--fg-3);
    border-bottom:2px solid transparent; margin-bottom:-1px;
  }
  .queue-tabs .tab.on{color:var(--fg); border-color:var(--accent)}

  .queue-list{overflow-y:auto; flex:1;}
  .queue-row{
    display:grid;
    grid-template-columns: 24px 36px 1fr auto 32px;
    align-items:center; gap:12px;
    padding:8px 18px;
    font-size:13px;
    border-top:.5px solid var(--hairline);
    cursor:pointer;
  }
  .queue-row:hover{background:rgba(0,0,0,0.025)}
  [data-theme="dark"] .queue-row:hover{background:rgba(255,255,255,0.04)}
  .queue-row.playing{background:var(--accent-soft)}
  .queue-row .n{text-align:right; font-size:11.5px; color:var(--fg-3); font-variant-numeric:tabular-nums;}
  .queue-row.playing .n{color:var(--accent)}
  .qart{width:36px; height:36px; border-radius:6px; background:linear-gradient(135deg, hsl(195 60% 50%), hsl(220 70% 30%));}
  .queue-row .t{font-weight:500; line-height:1.2}
  .queue-row .a{font-size:11.5px; color:var(--fg-3); line-height:1.2; margin-top:1px}
  .queue-row .dur{font-size:11.5px; color:var(--fg-3); font-variant-numeric:tabular-nums; font-family:'JetBrains Mono',monospace; white-space:nowrap;}
  .queue-row .more{width:28px; height:28px; border-radius:6px; background:transparent; border:0; color:var(--fg-3); opacity:0; display:grid; place-items:center;}
  .queue-row:hover .more{opacity:1}
  .queue-row.playing .eq{display:flex; gap:2px; align-items:flex-end; height:14px; justify-content:center;}
  .queue-row.playing .eq i{width:2px; background:var(--accent); border-radius:1px; animation:bars 1s ease-in-out infinite;}
  .queue-row.playing .eq i:nth-child(1){height:60%; animation-delay:0s}
  .queue-row.playing .eq i:nth-child(2){height:90%; animation-delay:0.18s}
  .queue-row.playing .eq i:nth-child(3){height:50%; animation-delay:0.36s}
  @keyframes bars{0%,100%{transform:scaleY(0.6)}50%{transform:scaleY(1)}}
`;
