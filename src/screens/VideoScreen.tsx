import { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { getFile, getFileStreamUrl, getFileContentUrl, formatBytes } from '../api/files';
import type { FileResponseDto } from '../types';

interface Props {
  fileId: number | null;
  onBack: () => void;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VideoScreen({ fileId, onBack }: Props) {
  const [file, setFile] = useState<FileResponseDto | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [_volume, setVolume] = useState(1);
  const [useStream, setUseStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setError(null);
    setFile(null);
    setUseStream(false);
  }, [fileId]);

  useEffect(() => {
    if (!fileId) return;
    getFile(fileId).then(f => {
      setFile(f);
      // Use stream endpoint if codec needs transcoding (not H.264/AVC baseline)
      const needsTranscode = f.videoCodec && !['h264', 'avc', 'avc1'].includes(f.videoCodec.toLowerCase());
      setUseStream(!!needsTranscode);
    });
  }, [fileId]);

  const videoSrc = (fileId != null && file != null)
    ? (useStream ? getFileStreamUrl(fileId) : getFileContentUrl(fileId, false))
    : '';

  const needsTranscoding = file?.videoCodec && !['h264', 'avc', 'avc1'].includes((file.videoCodec || '').toLowerCase());

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * duration;
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.pause(); else v.play();
    setPlaying(!playing);
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div className="video-page">
      <style>{videoStyles}</style>

      <div className="video-stage">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            crossOrigin="use-credentials"
            playsInline
            style={{ width: '80%', maxWidth: 1080, borderRadius: 16, aspectRatio: '16/9', objectFit: 'contain', background: '#000', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onVolumeChange={() => setVolume(videoRef.current?.volume || 1)}
            onError={() => {
              const mediaError = videoRef.current?.error;
              console.error('Video error:', mediaError);
              if (mediaError) {
                setError(`재생 오류: ${mediaError.message || `코드 ${mediaError.code}`} (상태: ${mediaError.code})`);
              } else {
                setError('비디오를 로드하는 중 오류가 발생했습니다.');
              }
            }}
          />
        ) : (
          <div style={{ color: 'var(--fg-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Icon name="spinner" size={28} />
            <span>비디오 정보 불러오는 중...</span>
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ff4d4f',
            zIndex: 10,
            padding: 20,
            textAlign: 'center'
          }}>
            <Icon name="warn" size={40} color="#ff4d4f" />
            <h3 style={{ margin: '16px 0 8px 0', fontSize: 16, color: '#fff' }}>동영상 재생 실패</h3>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{error}</p>
          </div>
        )}

        <button className="video-back" onClick={onBack}>
          <Icon name="chevronL" size={14} /> 라이브러리로
        </button>

        {file && (
          <div className="video-title">
            <div className="t">{file.baseName}</div>
            <div className="s">
              {file.width && file.height ? `${file.width}×${file.height} · ` : ''}
              {file.videoCodec || ''}
              {file.size ? ` · ${formatBytes(file.size)}` : ''}
            </div>
          </div>
        )}

        {needsTranscoding && (
          <div className="transcoding-hud">
            <div className="h">실시간 트랜스코딩 중</div>
            <div className="desc">
              브라우저가 원본 코덱({file?.videoCodec})을 지원하지 않아 즉시 변환 후 전송 중입니다.
            </div>
            <div className="codec-row">
              <span className="src">{file?.videoCodec}</span>
              <span className="arrow">→</span>
              <span className="dst">H.264</span>
            </div>
          </div>
        )}

        {!playing && (
          <button className="center-play" onClick={togglePlay}>
            <Icon name="play" size={28} color="#fff" stroke={1.5} />
          </button>
        )}
      </div>

      <div className="player-chrome">
        <div className="scrubber" onClick={handleSeek} style={{ cursor: 'pointer' }}>
          <div className="buf" style={{ width: bufPct + '%' }} />
          <div className="prog" style={{ width: pct + '%' }} />
          <div className="knob" style={{ left: pct + '%' }} />
        </div>
        <div className="player-row">
          <span className="time">{formatTime(currentTime)}</span>
          <div className="stretch" />
          <button className="pbtn" onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}>
            <Icon name="prev" size={18} stroke={1.5} color="#fff" />
          </button>
          <button className="pbtn play" onClick={togglePlay}>
            <Icon name={playing ? 'pause' : 'play'} size={18} color="#000" stroke={1.5} />
          </button>
          <button className="pbtn" onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }}>
            <Icon name="next" size={18} stroke={1.5} color="#fff" />
          </button>
          <div className="stretch" />
          <button className="pbtn" title="볼륨" onClick={() => {
            const v = videoRef.current;
            if (v) v.muted = !v.muted;
          }}>
            <Icon name="volume" size={16} stroke={1.5} color="#fff" />
          </button>
          <button className="pbtn" title="전체화면" onClick={() => videoRef.current?.requestFullscreen()}>
            <Icon name="fullscreen" size={16} stroke={1.5} color="#fff" />
          </button>
          <span className="time" style={{ textAlign: 'right' }}>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

const videoStyles = `
  .video-page{
    display:grid;
    grid-template-rows: 1fr auto;
    height:100%;
    background:#000;
    color:#fff;
  }
  .video-stage{
    position:relative;
    display:flex; align-items:center; justify-content:center;
    overflow:hidden;
    background:radial-gradient(circle at 50% 40%, #1c2030, #000 70%);
  }
  .video-back{
    position:absolute; top:18px; left:18px;
    display:flex; align-items:center; gap:8px;
    color:#fff; opacity:0.85;
    background:rgba(0,0,0,0.4);
    backdrop-filter:blur(20px);
    padding:8px 12px; border-radius:10px;
    border:.5px solid rgba(255,255,255,0.1);
    font-size:13px; font-weight:500;
    border:0;
  }
  .video-back:hover{opacity:1}
  .video-title{
    position:absolute; top:22px; left:180px;
    text-align:left; max-width:360px;
  }
  .video-title .t{font-size:14px; font-weight:600; line-height:1.2; color:#fff}
  .video-title .s{font-size:11.5px; opacity:0.7; margin-top:2px; color:#fff}

  .transcoding-hud{
    position:absolute; top:18px; right:18px;
    background:rgba(20,22,26,0.82);
    backdrop-filter:blur(16px);
    border:1px solid rgba(255,255,255,0.1);
    border-radius:14px; padding:14px 16px;
    color:#fff; font-size:12px; width:268px;
  }
  .transcoding-hud .h{
    display:flex; align-items:center; gap:7px;
    font-weight:600; font-size:12px;
    color:#fdd663;
    margin-bottom:8px;
  }
  .transcoding-hud .h::before{
    content:''; width:7px; height:7px; border-radius:50%;
    background:#fdd663;
  }
  .transcoding-hud .desc{
    font-size:11.5px; line-height:1.5; opacity:0.7; margin-bottom:12px;
  }
  .codec-row{
    display:flex; align-items:center; gap:8px;
    font-size:11.5px;
  }
  .codec-row .src,.codec-row .dst{
    font-family:'JetBrains Mono',monospace;
    padding:3px 7px; border-radius:5px;
    font-weight:600; font-size:10.5px; white-space:nowrap;
  }
  .codec-row .src{background:rgba(253,214,99,0.18); color:#fdd663}
  .codec-row .dst{background:rgba(129,201,149,0.18); color:#81c995}
  .codec-row .arrow{opacity:0.5}

  .center-play{
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    width:64px; height:64px; border-radius:50%;
    background:rgba(255,255,255,0.15);
    backdrop-filter:blur(20px);
    border:.5px solid rgba(255,255,255,0.2);
    display:grid; place-items:center;
    color:#fff;
  }

  .player-chrome{
    padding:18px 22px;
    background:linear-gradient(180deg,#0a0a0a,#050505);
    border-top:.5px solid rgba(255,255,255,0.06);
  }
  .scrubber{
    position:relative; height:6px; border-radius:99px;
    background:rgba(255,255,255,0.12);
    margin-bottom:14px;
  }
  .scrubber .buf{
    position:absolute; top:0; left:0; height:100%;
    background:rgba(255,255,255,0.22); border-radius:99px;
  }
  .scrubber .prog{
    position:absolute; top:0; left:0; height:100%;
    background:var(--accent); border-radius:99px;
  }
  .scrubber .knob{
    position:absolute; top:50%;
    transform:translate(-50%,-50%);
    width:14px; height:14px; border-radius:50%;
    background:#fff;
    box-shadow:0 2px 6px rgba(0,0,0,0.4);
  }
  .player-row{
    display:flex; align-items:center; gap:8px; color:#fff;
  }
  .player-row .time{
    font-family:'JetBrains Mono',monospace;
    font-size:12px; opacity:0.8; min-width:54px;
  }
  .pbtn{
    width:36px; height:36px; border-radius:8px;
    display:grid; place-items:center;
    background:transparent; border:0; color:#fff; opacity:0.85;
  }
  .pbtn:hover{background:rgba(255,255,255,0.1); opacity:1}
  .pbtn.play{
    background:#fff; color:#000;
    width:44px; height:44px; border-radius:99px;
  }
  .pbtn.play:hover{opacity:1}
  .player-row .stretch{flex:1}
`;
