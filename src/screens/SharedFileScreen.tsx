import { useCallback, useEffect, useRef, useState } from 'react';
import Hls, { type ErrorData } from 'hls.js';
import heic2any from 'heic2any';
import { Icon } from '../components/Icon';
import { OfficePreview, type OfficePreviewKind } from '../components/OfficePreview';
import { formatBytes } from '../api/files';
import {
  downloadSharedFileContent,
  getSharedFile,
  getSharedFileContentUrl,
  getSharedFileHlsUrl,
  getSharedFileStreamUrl,
  getSharedFileThumbnailUrl,
} from '../api/sharedFiles';
import { getSharedFilePageUrl, type SharedFilePageView } from '../api/shares';
import type { DownloadProgress } from '../api/download';
import type { FileResponseDto } from '../types';

interface SharedFileScreenProps {
  shareKey: string;
  view: SharedFilePageView;
}

const VIEW_ITEMS: { id: SharedFilePageView; label: string; icon: string }[] = [
  { id: 'info', label: '정보', icon: 'info' },
  { id: 'content', label: '원본', icon: 'doc' },
  { id: 'stream', label: 'H.264', icon: 'video' },
  { id: 'hls', label: 'HLS', icon: 'cast' },
  { id: 'thumbnail', label: '썸네일', icon: 'image' },
];

const CATEGORY_ICON: Record<string, string> = {
  IMAGE: 'image',
  VIDEO: 'videoFile',
  AUDIO: 'audioFile',
  DOCUMENT: 'doc',
  ARCHIVE: 'archive',
  ETC: 'doc',
  UNKNOWN: 'doc',
};

const TEXT_DOCUMENT_EXTENSIONS = new Set([
  'txt',
  'text',
  'log',
  'md',
  'markdown',
  'csv',
  'tsv',
]);

const SOURCE_CODE_EXTENSIONS = new Set([
  'astro',
  'bat',
  'bash',
  'c',
  'cc',
  'cfg',
  'clj',
  'cmd',
  'conf',
  'cpp',
  'cs',
  'css',
  'cxx',
  'dart',
  'dockerfile',
  'env',
  'erl',
  'ex',
  'exs',
  'fish',
  'fs',
  'fsx',
  'go',
  'gradle',
  'graphql',
  'groovy',
  'gql',
  'h',
  'hh',
  'hpp',
  'hrl',
  'htm',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsonl',
  'jsx',
  'kt',
  'kts',
  'less',
  'lua',
  'mjs',
  'php',
  'pl',
  'pm',
  'properties',
  'py',
  'r',
  'rb',
  'rs',
  'sass',
  'scala',
  'scss',
  'sh',
  'sql',
  'svelte',
  'swift',
  'toml',
  'ts',
  'tsx',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zsh',
]);

const SOURCE_CODE_FILENAMES = new Set([
  '.babelrc',
  '.dockerignore',
  '.editorconfig',
  '.env',
  '.eslintrc',
  '.gitignore',
  '.npmrc',
  '.prettierrc',
  'dockerfile',
  'gemfile',
  'jenkinsfile',
  'makefile',
  'podfile',
  'rakefile',
]);

const TEXT_PREVIEW_MIME_TYPES = new Set([
  'application/graphql',
  'application/javascript',
  'application/json',
  'application/sql',
  'application/typescript',
  'application/x-httpd-php',
  'application/x-javascript',
  'application/x-sh',
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
]);

const WORD_DOCUMENT_EXTENSIONS = new Set(['docx', 'docm']);
const POWERPOINT_EXTENSIONS = new Set(['pptx', 'pptm']);
const LEGACY_OFFICE_EXTENSIONS = new Set(['doc', 'ppt']);

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function normalizeExtension(extension?: string | null): string {
  return (extension || '').trim().replace(/^\./, '').toLowerCase();
}

function normalizeFilename(name?: string | null): string {
  return (name || '').trim().toLowerCase();
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPath(path: string | null | undefined): string {
  const value = (path || '').trim();
  if (!value || value === '.') return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function formatDurationValue(duration: number | null | undefined): string | null {
  if (duration == null) return null;
  const secs = Math.floor(duration > 50000 ? duration / 1000 : duration);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isSourceCodeDocument(file: FileResponseDto): boolean {
  const extension = normalizeExtension(file.extension);
  const name = normalizeFilename(file.name);
  const baseName = normalizeFilename(file.baseName);

  return SOURCE_CODE_EXTENSIONS.has(extension)
    || SOURCE_CODE_FILENAMES.has(name)
    || SOURCE_CODE_FILENAMES.has(baseName);
}

function isPreviewableTextDocument(file: FileResponseDto | null): file is FileResponseDto {
  if (!file || file.category !== 'DOCUMENT') return false;

  const extension = normalizeExtension(file.extension);
  const mimeType = normalizeFilename(file.mimeType).split(';')[0];

  return TEXT_DOCUMENT_EXTENSIONS.has(extension)
    || isSourceCodeDocument(file)
    || mimeType.startsWith('text/')
    || TEXT_PREVIEW_MIME_TYPES.has(mimeType);
}

function getCharset(contentType: string | null): string {
  const match = contentType?.match(/charset=([^;]+)/i);
  return match?.[1]?.trim().replace(/^"|"$/g, '') || 'utf-8';
}

function decodeTextPreview(buffer: ArrayBuffer, contentType: string | null): string {
  try {
    return new TextDecoder(getCharset(contentType)).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function getOfficePreviewKind(file: FileResponseDto): OfficePreviewKind | null {
  const extension = normalizeExtension(file.extension);
  if (WORD_DOCUMENT_EXTENSIONS.has(extension)) return 'word';
  if (POWERPOINT_EXTENSIONS.has(extension)) return 'powerpoint';
  return null;
}

function getFileIconMeta(file: FileResponseDto | null): { iconName: string; color: string } {
  if (!file) return { iconName: 'doc', color: 'var(--c-doc)' };

  const extension = normalizeExtension(file.extension);
  const iconName = extension === 'pdf' ? 'pdf'
    : extension === 'zip' || extension === 'rar' || extension === '7z' ? 'archive'
    : extension === 'tsx' || extension === 'ts' || extension === 'js' ? 'code'
    : extension === 'pptx' || extension === 'pptm' || extension === 'ppt' ? 'presentation'
    : extension === 'docx' || extension === 'docm' || extension === 'doc' ? 'doc'
    : CATEGORY_ICON[file.category] || 'doc';

  const color = extension === 'pdf' ? 'var(--c-pdf)'
    : file.category === 'IMAGE' ? 'var(--c-image)'
    : file.category === 'VIDEO' ? 'var(--c-video)'
    : file.category === 'AUDIO' ? 'var(--c-audio)'
    : file.category === 'ARCHIVE' ? 'var(--c-folder)'
    : 'var(--c-doc)';

  return { iconName, color };
}

function SharedFileIcon({ file, size = 46 }: { file: FileResponseDto | null; size?: number }) {
  const { iconName, color } = getFileIconMeta(file);
  return <Icon name={iconName} size={size} color={color} stroke={1.7} />;
}

function getPreferredView(file: FileResponseDto): SharedFilePageView {
  if (file.category === 'VIDEO') return 'hls';
  return 'content';
}

function isPdf(file: FileResponseDto): boolean {
  return normalizeExtension(file.extension) === 'pdf' || normalizeFilename(file.mimeType).includes('application/pdf');
}

function canPlayNativeHls(): boolean {
  if (typeof document === 'undefined') return false;
  const video = document.createElement('video');
  return !!(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'));
}

function SharedThumbnail({
  shareKey,
  file,
  button,
  onClick,
}: {
  shareKey: string;
  file: FileResponseDto | null;
  button?: boolean;
  onClick?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const content = !file || failed ? (
    <span className="shared-thumb-fallback">
      <SharedFileIcon file={file} />
    </span>
  ) : (
    <img src={getSharedFileThumbnailUrl(shareKey)} alt="" onError={() => setFailed(true)} />
  );

  if (!button) return <div className="shared-thumb">{content}</div>;

  return (
    <button className="shared-thumb as-button" onClick={onClick} disabled={!file}>
      {content}
      {file && (
        <span className="shared-thumb-overlay">
          <Icon name={file.category === 'VIDEO' ? 'play' : 'eye'} size={18} />
        </span>
      )}
    </button>
  );
}

function SharedVideoPlayer({
  shareKey,
  file,
  mode,
}: {
  shareKey: string;
  file: FileResponseDto;
  mode: 'content' | 'stream' | 'hls';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackKey = `${shareKey}:${mode}`;
  const [playbackError, setPlaybackError] = useState<{ key: string; message: string } | null>(null);
  const nativeHlsSupported = mode === 'hls' && canPlayNativeHls();
  const managedHlsSupported = mode === 'hls' && Hls.isSupported();
  const hlsUnsupported = mode === 'hls' && !nativeHlsSupported && !managedHlsSupported;
  const visiblePlaybackError = hlsUnsupported
    ? '이 브라우저는 HLS 재생을 지원하지 않습니다.'
    : playbackError?.key === playbackKey ? playbackError.message : '';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (mode === 'hls') {
      const hlsUrl = getSharedFileHlsUrl(shareKey);
      if (nativeHlsSupported) {
        video.src = hlsUrl;
        video.load();
      } else if (managedHlsSupported) {
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (_event: string, data: ErrorData) => {
          if (data.fatal) setPlaybackError({ key: playbackKey, message: 'HLS 스트림을 재생할 수 없습니다.' });
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
      } else {
        return;
      }
    } else {
      video.src = mode === 'stream'
        ? getSharedFileStreamUrl(shareKey)
        : getSharedFileContentUrl(shareKey, false);
      video.load();
    }

    return () => {
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [managedHlsSupported, mode, nativeHlsSupported, playbackKey, shareKey]);

  return (
    <div className="shared-video-wrap">
      {visiblePlaybackError && <div className="shared-inline-error">{visiblePlaybackError}</div>}
      <video
        ref={videoRef}
        className="shared-video"
        controls
        playsInline
        poster={getSharedFileThumbnailUrl(shareKey)}
        aria-label={file.name}
      />
    </div>
  );
}

function SharedPdfPreview({ shareKey, file }: { shareKey: string; file: FileResponseDto }) {
  const previewKey = `${shareKey}:${file.uuid || file.id}:${file.updatedAt}`;
  const [preview, setPreview] = useState<{
    key: string;
    objectUrl?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    fetch(getSharedFileContentUrl(shareKey, false), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async res => {
        if (!res.ok) throw new Error(`PDF 미리보기 로드 실패: HTTP ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPreview({ key: previewKey, objectUrl });
      })
      .catch(err => {
        if (controller.signal.aborted || cancelled) return;
        setPreview({
          key: previewKey,
          error: getErrorMessage(err, 'PDF 미리보기를 불러오지 못했습니다.'),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewKey, shareKey]);

  if (!preview || preview.key !== previewKey) {
    return (
      <div className="shared-doc-loader">
        <Icon name="spinner" size={28} className="spin-icon" />
        <span>PDF를 불러오는 중...</span>
      </div>
    );
  }

  if (preview.error || !preview.objectUrl) {
    return (
      <div className="shared-fallback">
        <SharedFileIcon file={file} size={52} />
        <h3>PDF 미리보기를 불러올 수 없습니다</h3>
        <p>{preview.error || '원본 파일로 열거나 다운로드해서 확인하세요.'}</p>
        <a className="shared-btn" href={getSharedFileContentUrl(shareKey, false)} target="_blank" rel="noreferrer">
          <Icon name="doc" size={15} />
          원본 열기
        </a>
      </div>
    );
  }

  return <iframe className="shared-doc-frame" src={preview.objectUrl} title={file.name} />;
}

function SharedHeicImagePreview({ shareKey, file }: { shareKey: string; file: FileResponseDto }) {
  const previewKey = `${shareKey}:${file.uuid || file.id}:${file.updatedAt}`;
  const [preview, setPreview] = useState<{
    key: string;
    objectUrl?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    fetch(getSharedFileContentUrl(shareKey, false), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`HEIC 이미지 로드 실패: HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => heic2any({ blob, toType: 'image/jpeg', quality: 0.92 }))
      .then(result => {
        if (cancelled) return;
        const converted = Array.isArray(result) ? result[0] : result;
        objectUrl = URL.createObjectURL(converted);
        setPreview({ key: previewKey, objectUrl });
      })
      .catch(err => {
        if (controller.signal.aborted || cancelled) return;
        setPreview({
          key: previewKey,
          error: getErrorMessage(err, 'HEIC 이미지를 변환하지 못했습니다.'),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewKey, shareKey]);

  if (!preview || preview.key !== previewKey) {
    return (
      <div className="shared-doc-loader">
        <Icon name="spinner" size={28} className="spin-icon" />
        <span>HEIC 이미지를 변환하는 중...</span>
      </div>
    );
  }

  if (preview.error || !preview.objectUrl) {
    return (
      <div className="shared-fallback">
        <SharedFileIcon file={file} size={52} />
        <h3>이미지 미리보기를 불러올 수 없습니다</h3>
        <p>{preview.error || '원본 파일로 열거나 다운로드해서 확인하세요.'}</p>
      </div>
    );
  }

  return (
    <div className="shared-media-frame image">
      <img src={preview.objectUrl} alt={file.name} />
    </div>
  );
}

function SharedTextPreview({
  shareKey,
  file,
  isSourceCode,
}: {
  shareKey: string;
  file: FileResponseDto;
  isSourceCode: boolean;
}) {
  const previewKey = `${shareKey}:${file.uuid || file.id}:${file.updatedAt}`;
  const [preview, setPreview] = useState<{
    key: string;
    text?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch(getSharedFileContentUrl(shareKey, false), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async res => {
        if (!res.ok) throw new Error(`텍스트 미리보기 로드 실패: HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        return decodeTextPreview(buffer, res.headers.get('Content-Type'));
      })
      .then(text => {
        if (!cancelled) setPreview({ key: previewKey, text });
      })
      .catch(err => {
        if (controller.signal.aborted || cancelled) return;
        setPreview({
          key: previewKey,
          error: getErrorMessage(err, '텍스트 미리보기를 불러오지 못했습니다.'),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewKey, shareKey]);

  if (!preview || preview.key !== previewKey) {
    return (
      <div className="shared-doc-loader">
        <Icon name="spinner" size={28} className="spin-icon" />
        <span>파일을 불러오는 중...</span>
      </div>
    );
  }

  if (preview.error || preview.text == null) {
    return (
      <div className="shared-fallback">
        <SharedFileIcon file={file} size={52} />
        <h3>텍스트 미리보기를 불러올 수 없습니다</h3>
        <p>{preview.error || '원본 파일로 열거나 다운로드해서 확인하세요.'}</p>
      </div>
    );
  }

  return (
    <div className="viewer-text-wrap shared-text-wrap">
      <div className="viewer-text-bar">
        <div className="viewer-text-kind">
          <Icon name={isSourceCode ? 'code' : 'doc'} size={15} />
          <span>{isSourceCode ? '소스 코드' : '텍스트'}</span>
        </div>
        <span>{formatBytes(file.size)}</span>
      </div>
      {preview.text.length > 0 ? (
        <pre className={'viewer-text-content' + (isSourceCode ? ' code' : '')}><code>{preview.text}</code></pre>
      ) : (
        <div className="viewer-empty-text">빈 파일입니다.</div>
      )}
    </div>
  );
}

function SharedOfficeDocumentPreview({
  shareKey,
  file,
  kind,
}: {
  shareKey: string;
  file: FileResponseDto;
  kind: OfficePreviewKind;
}) {
  const [officeError, setOfficeError] = useState('');
  const handleOfficePreviewError = useCallback((message: string) => {
    setOfficeError(message);
  }, []);

  if (officeError) {
    return (
      <div className="shared-fallback">
        <SharedFileIcon file={file} size={52} />
        <h3>문서 미리보기를 불러올 수 없습니다</h3>
        <p>{officeError}</p>
      </div>
    );
  }

  return (
    <div className="viewer-office-wrap shared-office-wrap">
      <div className="viewer-office-bar">
        <div className="viewer-office-kind">
          <Icon name={kind === 'word' ? 'doc' : 'presentation'} size={16} />
          <span>{kind === 'word' ? 'Word 문서' : 'PowerPoint 프레젠테이션'}</span>
        </div>
        <span>브라우저에서 미리보기</span>
      </div>
      <OfficePreview
        contentUrl={getSharedFileContentUrl(shareKey, false)}
        kind={kind}
        onError={handleOfficePreviewError}
      />
    </div>
  );
}

export function SharedFileScreen({ shareKey, view }: SharedFileScreenProps) {
  const [file, setFile] = useState<FileResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setFile(null);

    getSharedFile(shareKey)
      .then(nextFile => {
        if (!cancelled) setFile(nextFile);
      })
      .catch(err => {
        if (!cancelled) setError(getErrorMessage(err, '공유 파일을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, shareKey]);

  function selectView(nextView: SharedFilePageView) {
    window.history.pushState(
      { sharedFile: true, view: nextView },
      '',
      getSharedFilePageUrl(shareKey, nextView),
    );
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  async function handleDownload() {
    if (!file || downloading) return;

    setDownloadError('');
    setDownloadProgress({ loadedBytes: 0, totalBytes: null });
    setDownloading(true);
    try {
      await downloadSharedFileContent(shareKey, file.name, progress => setDownloadProgress(progress));
    } catch (err: unknown) {
      setDownloadError(getErrorMessage(err, '다운로드에 실패했습니다.'));
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  }

  const downloadPercent = downloadProgress?.totalBytes
    ? Math.min(100, (downloadProgress.loadedBytes / downloadProgress.totalBytes) * 100)
    : null;

  function renderInfo() {
    if (!file) return null;
    const duration = formatDurationValue(file.duration);
    const details = [
      { label: '파일명', value: file.name },
      { label: '위치', value: formatPath(file.parentPath) },
      { label: '크기', value: formatBytes(file.size) },
      { label: '종류', value: file.category },
      { label: '형식', value: file.format || file.mimeType || file.extension || '-' },
      { label: '해상도', value: file.width && file.height ? `${file.width} x ${file.height}` : null },
      { label: '재생 시간', value: duration },
      { label: '원본 수정일', value: formatDateTime(file.originUpdatedAt) },
    ].filter(item => item.value);

    return (
      <div className="shared-info-grid">
        {details.map(item => (
          <div className="shared-detail" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    );
  }

  function renderContentView() {
    if (!file) return null;

    const contentUrl = getSharedFileContentUrl(shareKey, false);
    const extension = normalizeExtension(file.extension);
    const isHeic = file.category === 'IMAGE' && (extension === 'heic' || extension === 'heif');
    const officePreviewKind = getOfficePreviewKind(file);
    const isTextDocument = isPreviewableTextDocument(file);
    const isSourceCode = isSourceCodeDocument(file);
    const isLegacyOfficeDocument = LEGACY_OFFICE_EXTENSIONS.has(extension);

    if (file.category === 'IMAGE') {
      if (isHeic) return <SharedHeicImagePreview shareKey={shareKey} file={file} />;

      return (
        <div className="shared-media-frame image">
          <img src={contentUrl} alt={file.name} />
        </div>
      );
    }

    if (file.category === 'VIDEO') {
      return <SharedVideoPlayer shareKey={shareKey} file={file} mode="content" />;
    }

    if (file.category === 'AUDIO') {
      return (
        <div className="shared-audio-frame">
          <Icon name="audioFile" size={42} stroke={1.25} />
          <audio controls src={contentUrl} />
        </div>
      );
    }

    if (isPdf(file)) {
      return <SharedPdfPreview shareKey={shareKey} file={file} />;
    }

    if (officePreviewKind) {
      return <SharedOfficeDocumentPreview shareKey={shareKey} file={file} kind={officePreviewKind} />;
    }

    if (isTextDocument) {
      return <SharedTextPreview shareKey={shareKey} file={file} isSourceCode={isSourceCode} />;
    }

    if (isLegacyOfficeDocument) {
      return (
        <div className="shared-fallback">
          <SharedFileIcon file={file} size={52} />
          <h3>구형 Office 형식은 미리볼 수 없습니다</h3>
          <p>{extension.toUpperCase()} 파일은 DOCX 또는 PPTX로 저장한 뒤 다시 열어주세요.</p>
          <button className="shared-btn" onClick={handleDownload} disabled={downloading}>
            <Icon name={downloading ? 'spinner' : 'download'} size={15} className={downloading ? 'spin-icon' : undefined} />
            {downloading ? '다운로드 중...' : '다운로드'}
          </button>
        </div>
      );
    }

    return (
      <div className="shared-fallback">
        <SharedFileIcon file={file} size={52} />
        <h3>브라우저에서 바로 열기 어려운 파일입니다</h3>
        <p>원본 파일로 열거나 다운로드해서 확인하세요.</p>
        <a className="shared-btn" href={contentUrl} target="_blank" rel="noreferrer">
          <Icon name="doc" size={15} />
          원본 열기
        </a>
      </div>
    );
  }

  function renderPreview() {
    if (!file) return null;

    if (view === 'info') return renderInfo();
    if (view === 'content') return renderContentView();
    if (view === 'thumbnail') {
      return (
        <div className="shared-media-frame thumbnail">
          <img src={getSharedFileThumbnailUrl(shareKey)} alt={`${file.name} 썸네일`} />
        </div>
      );
    }
    if (view === 'stream' || view === 'hls') {
      if (file.category !== 'VIDEO') {
        return (
          <div className="shared-fallback">
            <SharedFileIcon file={file} size={52} />
            <h3>비디오 파일에서만 사용할 수 있습니다</h3>
            <p>이 파일은 원본 보기 또는 다운로드로 확인하세요.</p>
            <button className="shared-btn" onClick={() => selectView('content')}>
              <Icon name="doc" size={15} />
              원본 보기
            </button>
          </div>
        );
      }
      return <SharedVideoPlayer shareKey={shareKey} file={file} mode={view} />;
    }

    return null;
  }

  return (
    <div className="shared-page">
      <style>{sharedFileStyles}</style>
      <header className="shared-top">
        <div className="shared-brand">
          <img src="/logo.png" alt="" />
          <span>FSHS</span>
        </div>
      </header>

      <main className="shared-shell">
        {loading ? (
          <div className="shared-state">
            <Icon name="spinner" size={30} className="spin-icon" />
            <span>공유 파일을 불러오는 중...</span>
          </div>
        ) : error ? (
          <div className="shared-state error">
            <Icon name="warn" size={34} />
            <strong>공유 파일을 열 수 없습니다</strong>
            <span>{error}</span>
            <button className="shared-btn primary" onClick={() => setReloadToken(v => v + 1)}>
              <Icon name="refresh" size={15} color="var(--accent-fg)" />
              다시 시도
            </button>
          </div>
        ) : file ? (
          <>
            <section className="shared-hero">
              <SharedThumbnail
                shareKey={shareKey}
                file={file}
                button
                onClick={() => selectView(getPreferredView(file))}
              />
              <div className="shared-summary">
                <div className="shared-eyebrow">공유 파일</div>
                <h1>{file.name}</h1>
                <div className="shared-meta">
                  <span>{formatBytes(file.size)}</span>
                  <span>{file.category}</span>
                  <span>{formatPath(file.parentPath)}</span>
                </div>
                <div className="shared-actions">
                  <button className="shared-btn primary" onClick={handleDownload} disabled={downloading}>
                    <Icon name={downloading ? 'spinner' : 'download'} size={15} color="var(--accent-fg)" className={downloading ? 'spin-icon' : undefined} />
                    {downloading ? '다운로드 중...' : '다운로드'}
                  </button>
                  <button className="shared-btn" onClick={() => selectView(getPreferredView(file))}>
                    <Icon name={file.category === 'VIDEO' ? 'play' : 'eye'} size={15} />
                    미리보기
                  </button>
                </div>
                {downloadError && <div className="shared-inline-error">{downloadError}</div>}
                {downloadProgress && (
                  <div className="shared-download-progress">
                    <div className="shared-progress-top">
                      <span>{downloadPercent == null ? '받는 중' : `${Math.floor(downloadPercent)}%`}</span>
                      <strong>{formatBytes(downloadProgress.loadedBytes)}</strong>
                    </div>
                    <div className="shared-progress-track">
                      <div
                        className={downloadPercent == null ? 'indeterminate' : ''}
                        style={{ width: downloadPercent == null ? '100%' : `${downloadPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <nav className="shared-tabs" aria-label="공유 파일 보기">
              {VIEW_ITEMS.map(item => {
                const disabled = (item.id === 'stream' || item.id === 'hls') && file.category !== 'VIDEO';
                return (
                  <button
                    key={item.id}
                    className={view === item.id ? 'active' : ''}
                    onClick={() => selectView(item.id)}
                    disabled={disabled}
                  >
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <section className="shared-preview">
              {renderPreview()}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

const sharedFileStyles = `
  .shared-page {
    height: 100vh;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    background: var(--bg-shell);
    color: var(--fg);
  }
  .shared-top {
    position: sticky;
    top: 0;
    z-index: 5;
    height: 58px;
    display: flex;
    align-items: center;
    padding: 0 22px;
    background: var(--bg);
    border-bottom: 1px solid var(--border-soft);
    backdrop-filter: blur(18px);
  }
  .shared-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 800;
  }
  .shared-brand img {
    width: 28px;
    height: 28px;
    border-radius: 7px;
  }
  .shared-shell {
    width: min(1100px, calc(100% - 32px));
    margin: 0 auto;
    padding: 28px 0 44px;
  }
  .shared-hero {
    display: grid;
    grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
    gap: 22px;
    align-items: stretch;
  }
  .shared-thumb {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    min-height: 240px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: var(--shadow-sm);
  }
  .shared-thumb.as-button {
    padding: 0;
    cursor: pointer;
    color: inherit;
  }
  .shared-thumb.as-button:disabled {
    cursor: default;
  }
  .shared-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .shared-thumb-fallback {
    width: 74px;
    height: 74px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: var(--accent);
    background: var(--accent-soft);
  }
  .shared-thumb-overlay {
    position: absolute;
    right: 14px;
    bottom: 14px;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(17, 24, 39, 0.72);
    backdrop-filter: blur(12px);
  }
  .shared-summary {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: var(--shadow-sm);
  }
  .shared-eyebrow {
    font-size: 12px;
    font-weight: 800;
    color: var(--accent);
    margin-bottom: 10px;
  }
  .shared-summary h1 {
    min-width: 0;
    margin: 0;
    font-size: 28px;
    line-height: 1.25;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }
  .shared-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
    color: var(--fg-3);
    font-size: 13px;
    font-weight: 650;
  }
  .shared-meta span {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .shared-meta span:not(:last-child)::after {
    content: "";
    display: inline-block;
    width: 4px;
    height: 4px;
    margin-left: 8px;
    vertical-align: middle;
    border-radius: 50%;
    background: var(--fg-4);
  }
  .shared-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 24px;
  }
  .shared-btn {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 13px;
    font-weight: 750;
    text-decoration: none;
  }
  .shared-btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }
  .shared-btn:disabled {
    opacity: 0.62;
    cursor: wait;
  }
  .shared-tabs {
    display: flex;
    gap: 6px;
    margin-top: 18px;
    padding: 6px;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: var(--shadow-sm);
  }
  .shared-tabs button {
    height: 36px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 13px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--fg-3);
    font: inherit;
    font-size: 12.5px;
    font-weight: 800;
    white-space: nowrap;
  }
  .shared-tabs button.active {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: var(--border);
  }
  .shared-tabs button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
  .shared-preview {
    min-height: 360px;
    margin-top: 18px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }
  .shared-info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
  }
  .shared-detail {
    min-width: 0;
    padding: 18px 20px;
    border-bottom: 1px solid var(--hairline);
  }
  .shared-detail:nth-child(odd) {
    border-right: 1px solid var(--hairline);
  }
  .shared-detail span {
    display: block;
    margin-bottom: 7px;
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 750;
  }
  .shared-detail strong {
    display: block;
    color: var(--fg);
    font-size: 14px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .shared-media-frame {
    min-height: 520px;
    display: grid;
    place-items: center;
    background: #10131d;
  }
  .shared-media-frame.image img,
  .shared-media-frame.thumbnail img {
    max-width: 100%;
    max-height: 76vh;
    object-fit: contain;
  }
  .shared-video-wrap {
    min-height: 520px;
    display: grid;
    place-items: center;
    gap: 12px;
    padding: 18px;
    background: #10131d;
  }
  .shared-video {
    width: min(100%, 960px);
    max-height: 74vh;
    background: #000;
    border-radius: 8px;
  }
  .shared-audio-frame,
  .shared-doc-loader,
  .shared-fallback,
  .shared-state {
    min-height: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 28px;
    text-align: center;
    color: var(--fg-3);
  }
  .shared-audio-frame audio {
    width: min(560px, 100%);
  }
  .shared-fallback h3,
  .shared-state strong {
    margin: 0;
    color: var(--fg);
    font-size: 17px;
  }
  .shared-fallback p,
  .shared-state span {
    max-width: 520px;
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
  }
  .shared-doc-frame {
    width: 100%;
    height: min(76vh, 720px);
    border: 0;
    background: #fff;
  }
  .viewer-text-wrap,
  .viewer-office-wrap {
    width: 100%;
    height: min(76vh, 760px);
    min-width: 0;
    display: grid;
    grid-template-rows: 42px 1fr;
    overflow: hidden;
    background: #11131a;
  }
  .viewer-office-wrap {
    background: #e9edf3;
  }
  .viewer-text-bar,
  .viewer-office-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 0 14px;
    background: #191c26;
    border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
    color: #aeb4c2;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .viewer-text-kind,
  .viewer-office-kind {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: #eef1f6;
    font-weight: 600;
  }
  .viewer-text-content {
    margin: 0;
    padding: 18px 20px 28px;
    min-width: 0;
    overflow: auto;
    color: #e7eaf0;
    background: #0f1015;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 13px;
    line-height: 1.65;
    tab-size: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .viewer-text-content.code {
    white-space: pre;
    overflow-wrap: normal;
  }
  .viewer-empty-text {
    display: grid;
    place-items: center;
    color: #8f96a3;
    background: #0f1015;
    font-size: 14px;
  }
  .viewer-office-scroll {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    background: #e9edf3;
  }
  .viewer-office-content {
    min-width: 0;
    min-height: 100%;
  }
  .viewer-office-content.word > .docx-wrapper {
    min-height: 100%;
    padding: 28px 24px 48px;
    background: #e9edf3;
  }
  .viewer-office-content.word > .docx-wrapper > section.docx {
    margin-bottom: 22px;
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.16);
  }
  .viewer-office-content.powerpoint {
    box-sizing: border-box;
    width: 100%;
    padding: 28px 24px 48px;
  }
  .viewer-office-loading {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #5f6878;
    background: rgba(233, 237, 243, 0.94);
    backdrop-filter: blur(3px);
  }
  .viewer-office-loading span {
    font-size: 14px;
    font-weight: 650;
    color: #303848;
  }
  .viewer-office-loading small {
    font-size: 12px;
    color: #7a8494;
  }
  .shared-inline-error {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--bad);
    border-radius: 8px;
    background: var(--bg);
    color: var(--bad);
    font-size: 12.5px;
    font-weight: 750;
  }
  .shared-download-progress {
    margin-top: 16px;
  }
  .shared-progress-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 750;
  }
  .shared-progress-track {
    height: 7px;
    margin-top: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .shared-progress-track > div {
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }
  .shared-progress-track > div.indeterminate {
    animation: shared-progress 1.1s ease-in-out infinite;
  }
  @keyframes shared-progress {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0); }
    100% { transform: translateX(100%); }
  }
  @media (max-width: 760px) {
    .shared-shell {
      width: min(100% - 20px, 1100px);
      padding: 14px 0 28px;
    }
    .shared-top {
      height: 54px;
      padding: 0 14px;
    }
    .shared-hero {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .shared-thumb {
      min-height: 210px;
    }
    .shared-summary {
      padding: 20px;
    }
    .shared-summary h1 {
      font-size: 22px;
    }
    .shared-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .shared-btn {
      width: 100%;
      padding: 0 12px;
    }
    .shared-info-grid {
      grid-template-columns: 1fr;
    }
    .shared-detail:nth-child(odd) {
      border-right: 0;
    }
    .shared-preview,
    .shared-audio-frame,
    .shared-doc-loader,
    .shared-fallback,
    .shared-state {
      min-height: 320px;
    }
    .shared-media-frame,
    .shared-video-wrap {
      min-height: 360px;
    }
    .shared-video {
      max-height: 62vh;
    }
    .viewer-text-wrap,
    .viewer-office-wrap {
      height: min(70vh, 640px);
    }
    .viewer-office-content.word > .docx-wrapper {
      padding: 14px 8px 28px;
    }
    .viewer-office-content.powerpoint {
      padding: 16px 8px 28px;
    }
  }
`;
