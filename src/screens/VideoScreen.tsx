import { useState, useRef, useEffect, useCallback } from 'react';
import Hls, { XhrLoader } from 'hls.js';
import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
  PlaylistLoaderContext,
} from 'hls.js';
import { Icon } from '../components/Icon';
import { getFile, getFileStreamUrl, getFileHlsUrl, getFileContentUrl, formatBytes } from '../api/files';
import { createApiErrorFromResponse } from '../api/client';
import type { FileResponseDto } from '../types';

interface Props {
  fileId: number | null;
  initialFile?: FileResponseDto | null;
  onBack: () => void;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function normalizeDuration(duration?: number | null): number {
  if (!duration) return 0;
  return duration > 50000 ? duration / 1000 : duration;
}

// 사파리/iOS(아이폰·아이패드)는 모든 브라우저가 WebKit이라 <video>에 Range(206)를 강하게 요구합니다.
// 이런 환경에서는 라이브 트랜스코딩(/stream: 200 응답, Range 미지원)이 재생되지 않으므로,
// 사파리가 네이티브로 디코딩 가능한 코덱/컨테이너는 /content(원본 + Range)로 직접 재생시킵니다.
function isAppleWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) ||
    // iPadOS 13+는 데스크톱 맥으로 위장하므로 터치 포인트 수로 구분
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const macSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(ua);
  return iOS || macSafari;
}

const APPLE_WEBKIT = isAppleWebKit();

function canPlayMediaType(mediaType: string): boolean {
  if (typeof document === 'undefined') return false;
  const video = document.createElement('video');
  return video.canPlayType(mediaType) !== '';
}

function canPlayNativeHls(): boolean {
  return (
    canPlayMediaType('application/vnd.apple.mpegurl') ||
    canPlayMediaType('application/x-mpegURL')
  );
}

function canPlayManagedHls(): boolean {
  return typeof window !== 'undefined' && Hls.isSupported();
}

const H264_CODECS = ['h264', 'h.264', 'avc', 'avc1'];
const HEVC_CODECS = ['hevc', 'h265', 'h.265', 'hvc1', 'hev1'];

function getVideoMimeTypes(extension?: string | null, mimeType?: string | null): string[] {
  const mediaTypes: string[] = [];
  const addType = (type: string) => {
    if (!mediaTypes.includes(type)) mediaTypes.push(type);
  };

  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) addType(mime);

  switch ((extension || '').toLowerCase()) {
    case 'mp4':
    case 'm4v':
      addType('video/mp4');
      break;
    case 'mov':
      addType('video/quicktime');
      addType('video/mp4');
      break;
    case 'webm':
      addType('video/webm');
      break;
    case 'mkv':
      addType('video/x-matroska');
      break;
    default:
      break;
  }

  return mediaTypes;
}

function codecMatches(codec: string | null | undefined, aliases: string[]): boolean {
  const normalized = (codec || '').toLowerCase();
  return aliases.some((alias) => normalized.includes(alias));
}

function isHevcCodec(codec?: string | null): boolean {
  return codecMatches(codec, HEVC_CODECS);
}

function getVideoCodecCandidates(codec?: string | null): string[] {
  const normalized = (codec || '').toLowerCase();
  if (codecMatches(normalized, H264_CODECS)) {
    return ['avc1.42E01E', 'avc1.4D401E', 'avc1.640028', 'avc1'];
  }
  if (codecMatches(normalized, HEVC_CODECS)) {
    return [
      'hvc1.1.6.L93.B0',
      'hvc1.1.6.L120.B0',
      'hvc1.2.4.L120.B0',
      'hvc1.2.4.L123.B0',
      'hev1.1.6.L93.B0',
      'hev1.2.4.L120.B0',
      'hvc1',
      'hev1',
    ];
  }
  if (normalized === 'vp8') return ['vp8'];
  if (normalized === 'vp9') return ['vp09.00.10.08', 'vp9'];
  if (normalized === 'av1') return ['av01.0.05M.08', 'av1'];
  return [];
}

function getAudioCodecCandidates(codec?: string | null): string[] {
  const normalized = (codec || '').toLowerCase();
  if (['aac', 'mp4a'].includes(normalized)) return ['mp4a.40.2'];
  if (['mp3', 'mpeg layer 3'].includes(normalized)) return ['mp3'];
  if (normalized === 'opus') return ['opus'];
  if (normalized === 'vorbis') return ['vorbis'];
  return [];
}

function getCodecTypes(videoCodecs: string[], audioCodecs: string[]): string[] {
  const codecTypes: string[] = [];

  for (const video of videoCodecs) {
    codecTypes.push(audioCodecs.length > 0 ? `${video}, ${audioCodecs[0]}` : video);
    codecTypes.push(video);
  }

  return Array.from(new Set(codecTypes));
}

async function canDecodeWithMediaCapabilities(
  contentTypes: string[],
  file: FileResponseDto,
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaCapabilities?.decodingInfo) {
    return false;
  }

  for (const contentType of contentTypes) {
    try {
      const info = await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        video: {
          contentType,
          width: file.width || 1920,
          height: file.height || 1080,
          bitrate: file.bitrate || 5_000_000,
          framerate: file.fps || 30,
        },
      });

      if (info.supported) return true;
    } catch {
      // Some browsers reject unknown codec/profile strings. Try the next candidate.
    }
  }

  return false;
}

function isMacChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isMac = /Macintosh|Mac OS X/.test(ua) || navigator.platform === 'MacIntel';
  const isChromium = /Chrome|Chromium|Edg/.test(ua) && !/OPR|Firefox/.test(ua);
  return isMac && isChromium;
}

function isMp4Family(extension?: string | null, mimeType?: string | null): boolean {
  const ext = (extension || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  return ['mp4', 'm4v', 'mov'].includes(ext) || ['video/mp4', 'video/quicktime'].includes(mime);
}

function isLikelyMacHevcNativeFile(file: FileResponseDto): boolean {
  return (
    isMacChromium() &&
    isHevcCodec(file.videoCodec) &&
    isMp4Family(file.extension, file.mimeType) &&
    canPlayMediaType('video/mp4')
  );
}

async function canPlayNativeFile(file: FileResponseDto): Promise<boolean> {
  const mediaTypes = getVideoMimeTypes(file.extension, file.mimeType);
  if (mediaTypes.length === 0) return false;

  const videoCodecs = getVideoCodecCandidates(file.videoCodec);
  const audioCodecs = getAudioCodecCandidates(file.audioCodec);
  const codecTypes = getCodecTypes(videoCodecs, audioCodecs);
  const contentTypes = mediaTypes.flatMap((mediaType) =>
    codecTypes.map((codec) => `${mediaType}; codecs="${codec}"`),
  );

  if (contentTypes.some(canPlayMediaType)) return true;
  if (await canDecodeWithMediaCapabilities(contentTypes, file)) return true;
  if (isLikelyMacHevcNativeFile(file)) return true;

  if (file.videoCodec) return false;

  return mediaTypes.some(canPlayMediaType);
}

function canPlayTranscodedStream(): boolean {
  if (APPLE_WEBKIT) return false;
  return (
    canPlayMediaType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') ||
    canPlayMediaType('video/mp4; codecs="avc1.42E01E"') ||
    canPlayMediaType('video/mp4')
  );
}

function isTranscodePlaylistUrl(url: string): boolean {
  return /\/stream\/index\.m3u8(?:[?#]|$)/.test(url);
}

const CONTENT_PREBUFFER_SECONDS = 4;
const CONTENT_PREBUFFER_MAX_WAIT_MS = 10_000;
const BUFFER_RANGE_FUZZ_SECONDS = 0.15;
const TRANSCODE_CAPACITY_EXCEEDED_MESSAGE =
  '트랜스코딩 처리 용량을 초과했습니다. 잠시 후 다시 시도해주세요.';

function getBufferedAhead(media: HTMLMediaElement): number {
  const current = media.currentTime;

  for (let i = 0; i < media.buffered.length; i += 1) {
    const start = media.buffered.start(i);
    const end = media.buffered.end(i);

    if (start - BUFFER_RANGE_FUZZ_SECONDS <= current && current <= end + BUFFER_RANGE_FUZZ_SECONDS) {
      return Math.max(0, end - current);
    }
  }

  return 0;
}

function getPrebufferTarget(media: HTMLMediaElement, seconds: number): number {
  if (!Number.isFinite(media.duration) || media.duration <= 0) return seconds;
  return Math.min(seconds, Math.max(0, media.duration - media.currentTime));
}

function hasEnoughPrebuffer(media: HTMLMediaElement, seconds: number): boolean {
  const target = getPrebufferTarget(media, seconds);
  if (target <= BUFFER_RANGE_FUZZ_SECONDS) {
    return media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  if (getBufferedAhead(media) >= target) return true;

  // 일부 브라우저는 buffered range를 보수적으로 노출하지만 canplaythrough 상태는 갱신합니다.
  return media.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;
}

function waitForPrebuffer(
  media: HTMLMediaElement,
  seconds: number,
  maxWaitMs: number,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (hasEnoughPrebuffer(media, seconds)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let done = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;
    const events = [
      'progress',
      'canplay',
      'canplaythrough',
      'loadeddata',
      'loadedmetadata',
      'durationchange',
      'suspend',
    ];

    const cleanup = () => {
      for (const event of events) media.removeEventListener(event, check);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (intervalId != null) window.clearInterval(intervalId);
    };

    const finish = (bufferedEnough: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(bufferedEnough);
    };

    function check() {
      if (!isCurrent()) {
        finish(false);
        return;
      }

      if (hasEnoughPrebuffer(media, seconds)) {
        finish(true);
      }
    }

    for (const event of events) media.addEventListener(event, check);
    intervalId = window.setInterval(check, 250);
    timeoutId = window.setTimeout(() => finish(false), maxWaitMs);
    check();
  });
}

function waitForMetadata(
  media: HTMLMediaElement,
  maxWaitMs: number,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve(true);

  return new Promise((resolve) => {
    let done = false;
    let timeoutId: number | null = null;
    const events = ['loadedmetadata', 'durationchange', 'error'];

    const cleanup = () => {
      for (const event of events) media.removeEventListener(event, check);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };

    const finish = (loaded: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(loaded);
    };

    function check() {
      if (!isCurrent()) {
        finish(false);
        return;
      }

      if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
        finish(true);
      }
    }

    for (const event of events) media.addEventListener(event, check);
    timeoutId = window.setTimeout(() => finish(false), maxWaitMs);
    check();
  });
}

function getHlsHttpStatus(data: { response?: { code?: number } }): number | null {
  const code = data.response?.code;
  return typeof code === 'number' ? code : null;
}

async function getMediaSourceErrorMessage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.ok) {
      if (res.body) await res.body.cancel().catch(() => {});
      return null;
    }

    const apiError = await createApiErrorFromResponse(res, `미디어 요청 실패: HTTP ${res.status}`);
    if (apiError.code === 'TRANSCODE_CAPACITY_EXCEEDED' || apiError.status === 503) {
      return apiError.response?.message || TRANSCODE_CAPACITY_EXCEEDED_MESSAGE;
    }
    return apiError.message;
  } catch {
    return null;
  }
}

function withCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_hls_reload=${Date.now()}`;
}

function rewriteTranscodePlaylist(playlist: string, expectedDuration: number): string {
  if (!playlist.includes('#EXTM3U')) return playlist;

  const normalized = playlist.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const hasDiscontinuity = lines.some((line) => line.trim() === '#EXT-X-DISCONTINUITY');
  let playlistDuration = 0;
  let segmentCount = 0;
  let hasEndList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const extinf = trimmed.match(/^#EXTINF:([\d.]+)/);
    if (extinf) {
      playlistDuration += Number(extinf[1]) || 0;
      segmentCount += 1;
    } else if (trimmed === '#EXT-X-ENDLIST') {
      hasEndList = true;
    }
  }

  const keepEndList =
    hasEndList &&
    expectedDuration > 0 &&
    playlistDuration >= Math.max(expectedDuration - 1, expectedDuration * 0.98);

  let mediaIndex = 0;
  const rewritten: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '#EXT-X-ENDLIST' && !keepEndList) {
      continue;
    }

    if (trimmed.startsWith('#EXT-X-PLAYLIST-TYPE:VOD') && !keepEndList) {
      rewritten.push('#EXT-X-PLAYLIST-TYPE:EVENT');
      continue;
    }

    if (!hasDiscontinuity && trimmed.startsWith('#EXTINF:')) {
      if (mediaIndex > 0) rewritten.push('#EXT-X-DISCONTINUITY');
      mediaIndex += 1;
    }

    rewritten.push(line);
  }

  return segmentCount > 1 || !keepEndList ? rewritten.join('\n') : playlist;
}

function createTranscodePlaylistLoader(expectedDuration: number) {
  return class TranscodePlaylistLoader implements Loader<PlaylistLoaderContext> {
    private loader: XhrLoader;
    public context: PlaylistLoaderContext | null = null;
    public stats: LoaderStats;

    constructor(config: HlsConfig) {
      this.loader = new XhrLoader(config);
      this.stats = this.loader.stats;
    }

    destroy() {
      this.loader.destroy();
      this.context = null;
    }

    abort() {
      this.loader.abort();
    }

    load(
      context: PlaylistLoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<PlaylistLoaderContext>,
    ) {
      this.context = context;
      const rewrite = isTranscodePlaylistUrl(context.url);
      const loaderContext: LoaderContext = rewrite
        ? { ...context, url: withCacheBust(context.url) }
        : context;

      const wrappedCallbacks: LoaderCallbacks<LoaderContext> = {
        onSuccess: (response, stats, _context, networkDetails) => {
          const data = typeof response.data === 'string' && rewrite
            ? rewriteTranscodePlaylist(response.data, expectedDuration)
            : response.data;

          callbacks.onSuccess(
            { ...response, url: context.url, data },
            stats,
            context,
            networkDetails,
          );
        },
        onError: (error, _context, networkDetails, stats) => {
          callbacks.onError(error, context, networkDetails, stats);
        },
        onTimeout: (stats, _context, networkDetails) => {
          callbacks.onTimeout(stats, context, networkDetails);
        },
        onAbort: (stats, _context, networkDetails) => {
          callbacks.onAbort?.(stats, context, networkDetails);
        },
        onProgress: (stats, _context, data, networkDetails) => {
          callbacks.onProgress?.(stats, context, data, networkDetails);
        },
      };

      this.loader.load(loaderContext, config, wrappedCallbacks);
    }

    getCacheAge() {
      return this.loader.getCacheAge?.() ?? null;
    }

    getResponseHeader(name: string) {
      return this.loader.getResponseHeader?.(name) ?? null;
    }
  };
}

// 트랜스코딩이 필요할 때 쓰는 전송 방식. 원본을 브라우저가 네이티브로 재생할 수 있으면
// /content를 먼저 쓰고, 트랜스코딩이 필요할 때는 Chrome/Edge 등에서 재생 가능한 progressive
// /stream을 HLS보다 먼저 사용합니다. Apple WebKit은 /stream Range 조건에 민감해서 HLS를 우선합니다.
const TRANSCODE_METHOD: 'hls' | 'stream' =
  canPlayTranscodedStream()
    ? 'stream'
    : (APPLE_WEBKIT || canPlayManagedHls() || canPlayNativeHls() ? 'hls' : 'stream');

export function VideoScreen({ fileId, initialFile, onBack }: Props) {
  const [file, setFile] = useState<FileResponseDto | null>(initialFile || null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [, setVolume] = useState(1);
  // autoStream: 파일/브라우저 기준 자동 판별값. forcedMode: 사용자가 수동으로 고른 재생 방식(없으면 자동).
  const [autoStream, setAutoStream] = useState(false);
  const [forcedMode, setForcedMode] = useState<'content' | 'stream' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [streamStart, setStreamStart] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userActive, setUserActive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTimeoutRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const resumeAtRef = useRef<number | null>(null);
  const prebufferingRef = useRef(false);
  const prebufferRunRef = useRef(0);
  const playRequestedRef = useRef(true);

  // 실제 트랜스코딩 사용 여부: 수동 선택이 있으면 그것을, 없으면 자동 판별값을 따릅니다.
  const useTranscode = forcedMode ? forcedMode === 'stream' : autoStream;
  // progressive /stream만 시킹 시 URL을 갈아끼워 재로딩이 필요합니다.
  // HLS와 /content는 전체 구간이 있어 네이티브 시킹(v.currentTime)이 됩니다.
  const reloadSeek = useTranscode && TRANSCODE_METHOD === 'stream';

  const handleMouseMove = useCallback(() => {
    setUserActive(true);
    if (activeTimeoutRef.current) window.clearTimeout(activeTimeoutRef.current);

    if (playing) {
      activeTimeoutRef.current = window.setTimeout(() => {
        setUserActive(false);
      }, 3000);
    }
  }, [playing]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (activeTimeoutRef.current) window.clearTimeout(activeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      setUserActive(true);
      if (activeTimeoutRef.current) {
        window.clearTimeout(activeTimeoutRef.current);
        activeTimeoutRef.current = null;
      }
    } else {
      handleMouseMove();
    }
  }, [handleMouseMove, playing]);

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch((err) => {
        console.error('Failed to enter fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  useEffect(() => {
    setError(null);
    setFile(initialFile || null);
    setAutoStream(false);
    setForcedMode(null);
    setShowSettings(false);
    resumeAtRef.current = null;
    playRequestedRef.current = true;
    prebufferingRef.current = false;
    prebufferRunRef.current += 1;
    setDuration(0);
    setStreamStart(0);
    setWaiting(false);
  }, [fileId, initialFile]);

  useEffect(() => {
    if (!fileId) return;

    let cancelled = false;

    const configureFile = async (f: FileResponseDto) => {
      // 원본을 네이티브로 재생 가능하면 /content(Range 바이트 서빙)로 직접 재생하고,
      // 불가능하면 브라우저가 지원하는 트랜스코딩 전송 방식으로 전송합니다.
      const nativePlayable = await canPlayNativeFile(f);
      if (cancelled) return;

      setAutoStream(!nativePlayable);

      if (f.duration) {
        setDuration(normalizeDuration(f.duration));
      }
    };

    if (initialFile && initialFile.id === fileId) {
      setFile(initialFile);
      configureFile(initialFile);
    } else {
      getFile(fileId).then(f => {
        if (cancelled) return;
        setFile(f);
        configureFile(f);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [fileId, initialFile]);

  // HLS 모드에서 hls.js(MSE)를 사용할지 여부.
  // Safari 네이티브 HLS는 manifest를 그대로 해석하므로, hls.js가 가능한 Safari에서는
  // Chrome과 같은 playlist 보정 경로를 태웁니다. hls.js가 불가능한 iOS/구형 Safari만 네이티브 HLS로 폴백합니다.
  const useHlsJs = useTranscode && TRANSCODE_METHOD === 'hls' && canPlayManagedHls();
  const fileDuration = normalizeDuration(file?.duration);

  const videoSrc = (fileId != null && file != null)
    ? (useTranscode
        ? (TRANSCODE_METHOD === 'hls' ? getFileHlsUrl(fileId) : getFileStreamUrl(fileId, streamStart))
        : getFileContentUrl(fileId, false))
    : '';

  // hls.js 또는 네이티브 소스 로드
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoSrc) return;

    let destroyed = false;
    const shouldPrebufferContent = !useTranscode;
    const prebufferRun = prebufferRunRef.current + 1;
    prebufferRunRef.current = prebufferRun;
    playRequestedRef.current = true;
    prebufferingRef.current = false;

    const isCurrentNativeLoad = () => (
      !destroyed &&
      prebufferRunRef.current === prebufferRun &&
      videoRef.current === v
    );

    const applyResumeTime = () => {
      if (resumeAtRef.current == null) return;
      try {
        v.currentTime = resumeAtRef.current;
      } catch {
        // ignore invalid resume seek
      }
      resumeAtRef.current = null;
    };

    const playNativeWhenReady = async () => {
      if (resumeAtRef.current != null) {
        const metadataLoaded = await waitForMetadata(v, CONTENT_PREBUFFER_MAX_WAIT_MS, isCurrentNativeLoad);
        if (!isCurrentNativeLoad()) return;
        if (metadataLoaded) applyResumeTime();
      }

      if (shouldPrebufferContent) {
        prebufferingRef.current = true;
        setWaiting(true);

        await waitForPrebuffer(
          v,
          CONTENT_PREBUFFER_SECONDS,
          CONTENT_PREBUFFER_MAX_WAIT_MS,
          isCurrentNativeLoad,
        );

        if (!isCurrentNativeLoad()) return;
        prebufferingRef.current = false;
      }

      if (!playRequestedRef.current) {
        setWaiting(false);
        return;
      }

      v.play().catch((err) => {
        console.warn('Autoplay blocked or failed:', err);
        playRequestedRef.current = false;
        setPlaying(false);
        setWaiting(false);
        prebufferingRef.current = false;
      });
    };

    if (useHlsJs) {
      // MSE 기반 hls.js로 재생
      const hls = new Hls({
        xhrSetup: (xhr: XMLHttpRequest) => { xhr.withCredentials = true; },
        liveDurationInfinity: true,
        pLoader: createTranscodePlaylistLoader(fileDuration),
        // 세그먼트 로딩 안정성 향상
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        startPosition: Math.max(resumeAtRef.current ?? streamStart, 0),
      });
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (destroyed) return;
        hls.loadSource(videoSrc);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        v.play().catch((err) => {
          console.warn('Autoplay blocked or failed:', err);
          setPlaying(false);
        });
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (destroyed) return;
        console.warn('hls.js error:', data.type, data.details, 'fatal:', data.fatal);
        const httpStatus = getHlsHttpStatus(data);
        if (httpStatus === 503) {
          hls.stopLoad();
          setError(TRANSCODE_CAPACITY_EXCEEDED_MESSAGE);
          setWaiting(false);
          return;
        }

        if (data.fatal) {
          // 치명적 에러 발생 시 자동 복구 시도
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('hls.js: 네트워크 에러 → 복구 시도');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('hls.js: 미디어 에러 → recoverMediaError 시도');
              hls.recoverMediaError();
              break;
            default:
              console.error('hls.js: 복구 불가 에러');
              setError(`HLS 재생 오류: ${data.details}`);
              setWaiting(false);
              break;
          }
        }
      });
      hlsRef.current = hls;
      hls.attachMedia(v);
    } else {
      // 네이티브 재생 (progressive /stream, /content, 또는 iOS 네이티브 HLS).
      // src는 JSX가 아니라 여기서만 설정한다. cleanup에서 지워 다운로드를 끊기 위함.
      v.src = videoSrc;
      v.load();
      void playNativeWhenReady();
    }

    return () => {
      destroyed = true;
      prebufferRunRef.current += 1;
      prebufferingRef.current = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // 재생 페이지를 떠나거나 소스를 바꿀 때 진행 중인 미디어 다운로드를 중단한다.
      // 엘리먼트가 DOM에서 빠져도 브라우저는 파일을 계속 받으므로(대용량에서 치명적),
      // src를 비우고 load()를 다시 호출해 네트워크 요청을 명시적으로 끊어야 한다.
      v.pause();
      v.removeAttribute('src');
      v.load();
    };
  }, [fileDuration, streamStart, useHlsJs, useTranscode, videoSrc]);

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(streamStart + v.currentTime);
    if (v.buffered.length > 0) setBuffered(streamStart + v.buffered.end(v.buffered.length - 1));
    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setWaiting(false);
  }

  function clearWaitingIfReady() {
    const v = videoRef.current;
    if (prebufferingRef.current) return;
    if (!v || v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    setWaiting(false);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const targetTime = pct * duration;

    if (reloadSeek) {
      setStreamStart(targetTime);
      setCurrentTime(targetTime);
      setBuffered(targetTime);
    } else {
      v.currentTime = targetTime;
    }
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    playRequestedRef.current = !playing;
    if (playing) {
      v.pause();
    } else if (prebufferingRef.current) {
      setWaiting(true);
    } else {
      v.play().catch((err) => {
        console.warn('Play failed:', err);
        playRequestedRef.current = false;
        setPlaying(false);
        setWaiting(false);
      });
    }
    setPlaying(!playing);
  }

  function handleEnded() {
    const v = videoRef.current;
    const endedBeforeKnownDuration =
      useTranscode &&
      TRANSCODE_METHOD === 'hls' &&
      duration > 0 &&
      (v?.currentTime || currentTime) < duration - 1;

    if (endedBeforeKnownDuration) {
      playRequestedRef.current = true;
      setPlaying(true);
      setWaiting(true);
      hlsRef.current?.startLoad(v?.currentTime ?? -1);
      v?.play().catch((err) => {
        console.warn('Autoplay blocked or failed:', err);
        playRequestedRef.current = false;
        setPlaying(false);
        setWaiting(false);
      });
      return;
    }

    playRequestedRef.current = false;
    setPlaying(false);
    setWaiting(false);
  }

  // 사용자가 재생 방식(일반 재생 / 실시간 트랜스코딩)을 직접 고르는 핸들러.
  // 현재 재생 위치를 유지한 채 방식만 전환합니다.
  function selectMode(mode: 'content' | 'stream') {
    setShowSettings(false);
    if (useTranscode === (mode === 'stream')) return; // 이미 같은 방식이면 무시
    setError(null);
    setWaiting(true);
    const t = currentTime;
    if (mode === 'stream' && TRANSCODE_METHOD === 'stream') {
      // progressive 트랜스코딩: 현재 위치부터 변환 시작 (URL 재로딩)
      setStreamStart(t);
      setCurrentTime(t);
      setBuffered(t);
    } else {
      // 일반 재생(/content) 또는 HLS 트랜스코딩: 로드 후 onLoadedMetadata에서 현재 위치로 시크
      setStreamStart(0);
      resumeAtRef.current = t;
    }
    setForcedMode(mode);
  }

  // 설정 메뉴 바깥을 누르면 닫기
  useEffect(() => {
    if (!showSettings) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [showSettings]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const hideControls = isFullscreen && !userActive && playing;
  const transcodeTransportLabel = TRANSCODE_METHOD === 'hls' ? 'HLS 세그먼트' : 'MP4 스트림';
  const transcodeOutputLabel = TRANSCODE_METHOD === 'hls' ? 'H.264 HLS' : 'H.264 MP4';
  const transcodeReasonLabel = forcedMode === 'stream'
    ? '선택한 재생 방식에 따라'
    : '원본 재생 호환성을 위해';

  return (
    <div
      ref={containerRef}
      className={`video-page${isFullscreen ? ' is-fullscreen' : ''}${hideControls ? ' hide-controls' : ''}`}
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      <style>{videoStyles}</style>

      <div className="video-stage">
        {videoSrc ? (
          <video
            ref={videoRef}
            playsInline
            preload="auto"
            style={{ width: '80%', maxWidth: 1080, borderRadius: 16, aspectRatio: '16/9', objectFit: 'contain', background: '#000', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (!v) return;
              if (!duration && Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
              // 재생 방식 전환 시 직전 위치로 복원 (일반 재생 경로)
              if (resumeAtRef.current != null) {
                try { v.currentTime = resumeAtRef.current; } catch { /* ignore invalid resume seek */ }
                resumeAtRef.current = null;
              }
              clearWaitingIfReady();
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              if (!prebufferingRef.current) setWaiting(false);
            }}
            onEnded={handleEnded}
            onWaiting={() => {
              const v = videoRef.current;
              setWaiting(!v || v.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
            }}
            onPlaying={() => setWaiting(false)}
            onSeeking={() => setWaiting(true)}
            onSeeked={clearWaitingIfReady}
            onCanPlay={clearWaitingIfReady}
            onCanPlayThrough={clearWaitingIfReady}
            onLoadStart={() => setWaiting(true)}
            onLoadedData={clearWaitingIfReady}
            onProgress={clearWaitingIfReady}
            onVolumeChange={() => setVolume(videoRef.current?.volume || 1)}
            onError={() => {
              const mediaError = videoRef.current?.error;
              console.error('Video error:', mediaError);
              if (useTranscode && TRANSCODE_METHOD === 'stream') {
                const failedSrc = videoSrc;
                setError('트랜스코딩 스트림을 시작하지 못했습니다.');
                void getMediaSourceErrorMessage(failedSrc).then((message) => {
                  if (failedSrc === videoSrc && message) setError(message);
                });
              } else if (mediaError) {
                setError(`재생 오류: ${mediaError.message || `코드 ${mediaError.code}`} (상태: ${mediaError.code})`);
              } else {
                setError('비디오를 로드하는 중 오류가 발생했습니다.');
              }
              setWaiting(false);
            }}
          />
        ) : (
          <div style={{ color: 'var(--fg-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Icon name="spinner" size={28} />
            <span>비디오 정보 불러오는 중...</span>
          </div>
        )}

        {playing && waiting && (
          <div className="video-buffering-overlay">
            <Icon name="spinner" size={32} color="#fff" className="spin-icon" />
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
              {file.duration ? `${formatTime(normalizeDuration(file.duration))} · ` : ''}
              {file.videoCodec || ''}
              {file.size ? ` · ${formatBytes(file.size)}` : ''}
            </div>
          </div>
        )}

        {useTranscode && !isFullscreen && (
          <div className="transcoding-hud">
            <div className="h">서버 트랜스코딩 중</div>
            <div className="desc">
              {transcodeReasonLabel} 서버 변환 슬롯에서 {transcodeTransportLabel}을 생성하고 있습니다.
              슬롯이 가득 차면 새 변환 시작이 잠시 거절될 수 있습니다.
            </div>
            <div className="codec-row">
              <span className="src">{file?.videoCodec || '원본'}</span>
              <span className="arrow">→</span>
              <span className="dst">{transcodeOutputLabel}</span>
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
          <div className="settings-wrap" ref={settingsRef}>
            <button
              className={`pbtn${showSettings ? ' active' : ''}`}
              title="재생 방식"
              onClick={() => setShowSettings((s) => !s)}
            >
              <Icon name="settings" size={16} stroke={1.5} color="#fff" />
            </button>
            {showSettings && (
              <div className="settings-menu">
                <div className="settings-head">재생 방식</div>
                <button
                  className={`settings-item${!useTranscode ? ' active' : ''}`}
                  onClick={() => selectMode('content')}
                >
                  <div className="si-main">
                    <span className="si-title">일반 재생</span>
                    <span className="si-desc">원본 그대로 전송 · 빠름</span>
                  </div>
                  {!useTranscode && <Icon name="check" size={16} color="var(--accent)" />}
                </button>
                <button
                  className={`settings-item${useTranscode ? ' active' : ''}`}
                  onClick={() => selectMode('stream')}
                >
                  <div className="si-main">
                    <span className="si-title">실시간 트랜스코딩</span>
                    <span className="si-desc">서버 슬롯 사용 · H.264 변환</span>
                  </div>
                  {useTranscode && <Icon name="check" size={16} color="var(--accent)" />}
                </button>
              </div>
            )}
          </div>
          <button className="pbtn" title={isFullscreen ? '전체화면 종료' : '전체화면'} onClick={toggleFullscreen}>
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
    z-index:11; /* 재생 오류 오버레이(z-index:10) 위에 떠야 항상 나갈 수 있다 */
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
  .pbtn.active{background:rgba(255,255,255,0.16); opacity:1}
  .player-row .stretch{flex:1}

  .settings-wrap{position:relative; display:flex}
  .settings-menu{
    position:absolute; bottom:46px; right:0; z-index:30;
    width:240px;
    background:rgba(26,28,34,0.96);
    backdrop-filter:blur(24px);
    border:1px solid rgba(255,255,255,0.12);
    border-radius:14px; padding:6px;
    box-shadow:0 16px 48px rgba(0,0,0,0.55);
  }
  .settings-head{
    font-size:11px; font-weight:600; letter-spacing:0.02em;
    color:#fff; opacity:0.5;
    padding:8px 10px 6px;
  }
  .settings-item{
    display:flex; align-items:center; gap:10px;
    width:100%; text-align:left;
    background:transparent; border:0; color:#fff;
    padding:9px 10px; border-radius:9px; cursor:pointer;
  }
  .settings-item:hover{background:rgba(255,255,255,0.08)}
  .settings-item.active{background:rgba(255,255,255,0.06)}
  .settings-item .si-main{display:flex; flex-direction:column; gap:2px; flex:1; min-width:0}
  .settings-item .si-title{font-size:13px; font-weight:500}
  .settings-item .si-desc{font-size:11px; opacity:0.55}
  .video-buffering-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(20px);
    border: .5px solid rgba(255, 255, 255, 0.15);
    display: grid;
    place-items: center;
    color: #fff;
    z-index: 8;
    pointer-events: none;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .spin-icon {
    animation: spin 1s linear infinite;
  }
  .video-page.is-fullscreen {
    display: block;
    position: relative;
    width: 100vw;
    height: 100vh;
    background: #000;
  }
  .video-page.is-fullscreen .video-stage {
    height: 100vh;
    width: 100vw;
  }
  .video-page.is-fullscreen video {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  .video-page.is-fullscreen .player-chrome {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
    background: linear-gradient(180deg, transparent, rgba(0,0,0,0.85) 30%, #000);
    border-top: 0;
    padding: 40px 24px 24px;
  }
  .video-page.hide-controls {
    cursor: none;
  }
  .video-page.hide-controls .player-chrome,
  .video-page.hide-controls .video-back,
  .video-page.hide-controls .video-title,
  .video-page.hide-controls .transcoding-hud {
    opacity: 0;
    pointer-events: none;
  }
  .player-chrome, .video-back, .video-title, .transcoding-hud {
    transition: opacity 0.3s ease;
  }

`;
