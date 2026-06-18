import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon';
import { OfficePreview, type OfficePreviewKind } from '../components/OfficePreview';
import { getFile, getFileContentUrl, formatBytes, downloadFileContent } from '../api/files';
import type { FileResponseDto } from '../types';
import type { DownloadProgress } from '../api/download';

interface Props {
  fileId: number | null;
  onBack: () => void;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

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

function normalizeExtension(extension?: string | null): string {
  return (extension || '').trim().replace(/^\./, '').toLowerCase();
}

function normalizeFilename(name?: string | null): string {
  return (name || '').trim().toLowerCase();
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

export function ViewerScreen({ fileId, onBack }: Props) {
  const [file, setFile] = useState<FileResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    setFile(null);
    setBlobUrl(null);
    setTextContent(null);
    setPreviewError('');
    getFile(fileId)
      .then(f => setFile(f))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  const isImage = file?.category === 'IMAGE';
  const isPdf = normalizeExtension(file?.extension) === 'pdf';
  const isTextDocument = isPreviewableTextDocument(file);
  const isSourceCode = file ? isSourceCodeDocument(file) : false;
  const extension = normalizeExtension(file?.extension);
  const officePreviewKind: OfficePreviewKind | null = WORD_DOCUMENT_EXTENSIONS.has(extension)
    ? 'word'
    : POWERPOINT_EXTENSIONS.has(extension)
      ? 'powerpoint'
      : null;
  const isLegacyOfficeDocument = LEGACY_OFFICE_EXTENSIONS.has(extension);
  const handleOfficePreviewError = useCallback((message: string) => {
    setPreviewError(message);
  }, []);

  useEffect(() => {
    setBlobUrl(null);
    setTextContent(null);
    setPreviewError('');
    setPreviewLoading(false);

    if (!file || !fileId || (!isPdf && !isTextDocument)) return;

    let cancelled = false;
    let objectUrl: string;
    const controller = new AbortController();

    setPreviewLoading(true);

    fetch(getFileContentUrl(fileId, false), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error(`미리보기 로드 실패: HTTP ${r.status}`);
        if (isPdf) return r.blob();
        return r.arrayBuffer().then(buffer => decodeTextPreview(buffer, r.headers.get('Content-Type')));
      })
      .then(blob => {
        if (cancelled) return;
        if (blob instanceof Blob) {
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
          return;
        }
        setTextContent(blob);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (!cancelled) setPreviewError(getErrorMessage(err, '미리보기를 불러올 수 없습니다.'));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobUrl(null);
      setTextContent(null);
    };
  }, [file, fileId, isPdf, isTextDocument]);

  if (fileId == null) return null;

  const fileUrl = getFileContentUrl(fileId, false);

  async function handleDownload() {
    if (!file || downloading) return;
    setDownloadError('');
    setDownloadProgress({ loadedBytes: 0, totalBytes: null });
    setDownloading(true);
    try {
      await downloadFileContent(file.id, file.name, progress => setDownloadProgress(progress));
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

  return (
    <div className="viewer-page">
      <style>{viewerStyles}</style>

      <div className="viewer-header">
        <button className="vbtn-back" onClick={onBack}>
          <Icon name="chevronL" size={14} /> 돌아가기
        </button>
        {file && (
          <div className="viewer-title">
            <div className="t">{file.name}</div>
            <div className="s">{formatBytes(file.size)} · {file.category}</div>
          </div>
        )}
        <div className="viewer-actions">
          <button className="vbtn-download" onClick={handleDownload} disabled={!file || downloading}>
            <Icon name={downloading ? 'spinner' : 'download'} size={14} /> {downloading ? '다운로드 중...' : '다운로드'}
          </button>
        </div>
      </div>

      <div className="viewer-body">
        {downloadError && <div className="viewer-download-error">{downloadError}</div>}
        {downloading && downloadProgress && (
          <div className="viewer-download-progress">
            <div className="progress-top">
              <span>{file?.name || '파일'}</span>
              <strong>{downloadPercent == null ? formatBytes(downloadProgress.loadedBytes) : `${Math.floor(downloadPercent)}%`}</strong>
            </div>
            <div className="progress-track">
              <div
                className={downloadPercent == null ? 'progress-fill indeterminate' : 'progress-fill'}
                style={{ width: downloadPercent == null ? '100%' : `${downloadPercent}%` }}
              />
            </div>
            <div className="progress-bytes">
              {downloadProgress.totalBytes
                ? `${formatBytes(downloadProgress.loadedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`
                : `${formatBytes(downloadProgress.loadedBytes)} 받는 중`}
            </div>
          </div>
        )}
        {loading ? (
          <div className="viewer-loader">
            <Icon name="spinner" size={28} />
            <span>파일을 불러오는 중...</span>
          </div>
        ) : !file ? (
          <div className="viewer-error">파일 정보를 불러올 수 없습니다.</div>
        ) : isImage ? (
          <div className="viewer-media-wrap">
            <img src={fileUrl} alt={file.name} className="viewer-img" />
          </div>
        ) : isPdf ? (
          previewError ? (
            <PreviewError message={previewError} onDownload={handleDownload} downloading={downloading} />
          ) : blobUrl ? (
            <iframe src={blobUrl} className="viewer-iframe" title={file.name} />
          ) : (
            <div className="viewer-loader"><Icon name="spinner" size={28} /><span>파일을 불러오는 중...</span></div>
          )
        ) : officePreviewKind ? (
          previewError ? (
            <PreviewError message={previewError} onDownload={handleDownload} downloading={downloading} />
          ) : (
            <div className="viewer-office-wrap">
              <div className="viewer-office-bar">
                <div className="viewer-office-kind">
                  <Icon name={officePreviewKind === 'word' ? 'doc' : 'presentation'} size={16} />
                  <span>{officePreviewKind === 'word' ? 'Word 문서' : 'PowerPoint 프레젠테이션'}</span>
                </div>
                <span>브라우저에서 미리보기</span>
              </div>
              <OfficePreview
                fileId={fileId}
                kind={officePreviewKind}
                onError={handleOfficePreviewError}
              />
            </div>
          )
        ) : isTextDocument ? (
          previewError ? (
            <PreviewError message={previewError} onDownload={handleDownload} downloading={downloading} />
          ) : textContent !== null ? (
            <div className="viewer-text-wrap">
              <div className="viewer-text-bar">
                <div className="viewer-text-kind">
                  <Icon name={isSourceCode ? 'code' : 'doc'} size={15} />
                  <span>{isSourceCode ? '소스 코드' : '텍스트'}</span>
                </div>
                <span>{formatBytes(file.size)}</span>
              </div>
              {textContent.length > 0 ? (
                <pre className={'viewer-text-content' + (isSourceCode ? ' code' : '')}><code>{textContent}</code></pre>
              ) : (
                <div className="viewer-empty-text">빈 파일입니다.</div>
              )}
            </div>
          ) : previewLoading ? (
            <div className="viewer-loader"><Icon name="spinner" size={28} /><span>파일을 불러오는 중...</span></div>
          ) : null
        ) : isLegacyOfficeDocument ? (
          <div className="viewer-fallback">
            <div className="icon-wrap">
              <Icon name={extension === 'ppt' ? 'presentation' : 'doc'} size={48} stroke={1.2} />
            </div>
            <h3>구형 Office 형식은 미리볼 수 없습니다</h3>
            <p>
              {extension.toUpperCase()} 파일은 브라우저에서 직접 해석하기 어렵습니다.
              DOCX 또는 PPTX로 저장한 뒤 다시 열어주세요.
            </p>
            <button className="vbtn-action" onClick={handleDownload} disabled={downloading}>
              <Icon name={downloading ? 'spinner' : 'download'} size={16} /> {downloading ? '다운로드 중...' : '다운로드 받기'}
            </button>
          </div>
        ) : (
          <div className="viewer-fallback">
            <div className="icon-wrap">
              <Icon name="doc" size={48} stroke={1.2} />
            </div>
            <h3>미리보기를 지원하지 않는 파일 형식입니다</h3>
            <p>이 파일은 브라우저에서 직접 열 수 없습니다. 다운로드하여 확인하세요.</p>
            <button className="vbtn-action" onClick={handleDownload} disabled={downloading}>
              <Icon name={downloading ? 'spinner' : 'download'} size={16} /> {downloading ? '다운로드 중...' : '다운로드 받기'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewError({ message, onDownload, downloading }: {
  message: string;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div className="viewer-fallback">
      <div className="icon-wrap">
        <Icon name="warn" size={48} stroke={1.2} />
      </div>
      <h3>미리보기를 불러올 수 없습니다</h3>
      <p>{message}</p>
      <button className="vbtn-action" onClick={onDownload} disabled={downloading}>
        <Icon name={downloading ? 'spinner' : 'download'} size={16} /> {downloading ? '다운로드 중...' : '다운로드 받기'}
      </button>
    </div>
  );
}

const viewerStyles = `
  .viewer-page {
    display: grid;
    grid-template-rows: 56px 1fr;
    height: 100vh;
    background: #0f1015;
    color: #fff;
    font-family: inherit;
  }
  .viewer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background: #161822;
    border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
    z-index: 10;
  }
  .vbtn-back {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 0;
    color: #eee;
    padding: 8px 14px;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  .vbtn-back:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .viewer-title {
    text-align: center;
    max-width: 50%;
  }
  .viewer-title .t {
    font-size: 14.5px;
    font-weight: 600;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .viewer-title .s {
    font-size: 11.5px;
    color: #aaa;
    margin-top: 2px;
  }
  .viewer-actions {
    display: flex;
    gap: 8px;
  }
  .vbtn-download {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--accent, #5b50e8);
    color: #fff;
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    border: 0;
  }
  .vbtn-download:hover {
    background: var(--accent-hover, #493fd6);
  }
  .vbtn-download:disabled,
  .vbtn-action:disabled {
    opacity: .65;
    cursor: not-allowed;
  }
  .viewer-body {
    display: grid;
    place-items: center;
    background: #0f1015;
    overflow: hidden;
    position: relative;
    padding: 24px;
  }
  .viewer-download-error {
    position: absolute;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    max-width: calc(100% - 32px);
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.18);
    color: #fecaca;
    font-size: 13px;
  }
  .viewer-download-progress {
    position: absolute;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    width: min(420px, calc(100% - 32px));
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(22, 24, 34, 0.94);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  }
  .viewer-download-progress .progress-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12.5px;
    color: #fff;
  }
  .viewer-download-progress .progress-top span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .viewer-download-progress .progress-top strong,
  .viewer-download-progress .progress-bytes {
    font-variant-numeric: tabular-nums;
  }
  .viewer-download-progress .progress-track {
    height: 6px;
    margin-top: 9px;
    border-radius: 99px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.12);
  }
  .viewer-download-progress .progress-fill {
    height: 100%;
    border-radius: 99px;
    background: var(--accent, #5b50e8);
    transition: width 0.15s ease-out;
  }
  .viewer-download-progress .progress-fill.indeterminate {
    animation: pulse 1.5s infinite;
  }
  .viewer-download-progress .progress-bytes {
    margin-top: 8px;
    font-size: 11.5px;
    color: #aaa;
  }
  @keyframes pulse {
    0% { opacity: 0.45; }
    50% { opacity: 1; }
    100% { opacity: 0.45; }
  }
  .viewer-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #aaa;
  }
  .viewer-error {
    color: #ef4444;
    font-size: 15px;
  }
  .viewer-media-wrap {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .viewer-img {
    max-width: min(90%, 1200px);
    max-height: 80vh;
    min-width: 240px;
    min-height: 240px;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  }
  .viewer-iframe {
    width: min(95%, 1080px);
    height: 82vh;
    min-width: 320px;
    min-height: 480px;
    border: 0;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  }
  .viewer-text-wrap {
    width: min(100%, 1120px);
    height: 82vh;
    min-width: 0;
    display: grid;
    grid-template-rows: 42px 1fr;
    overflow: hidden;
    border-radius: 12px;
    background: #11131a;
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  }
  .viewer-office-wrap {
    width: min(100%, 1240px);
    height: 82vh;
    min-width: 0;
    display: grid;
    grid-template-rows: 42px 1fr;
    overflow: hidden;
    border-radius: 12px;
    background: #e9edf3;
    border: 0.5px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  }
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
  }
  .viewer-office-kind {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: #eef1f6;
    font-weight: 600;
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
  .viewer-text-bar {
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
  .viewer-text-kind {
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
  .viewer-fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 400px;
    color: #aaa;
  }
  .viewer-fallback .icon-wrap {
    width: 96px;
    height: 96px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.04);
    display: grid;
    place-items: center;
    color: #888;
    margin-bottom: 20px;
  }
  .viewer-fallback h3 {
    font-size: 18px;
    color: #fff;
    margin: 0 0 10px 0;
  }
  .viewer-fallback p {
    font-size: 13.5px;
    line-height: 1.5;
    margin: 0 0 24px 0;
  }
  .vbtn-action {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    text-decoration: none;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    border: 0.5px solid rgba(255, 255, 255, 0.1);
  }
  .vbtn-action:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  @media (max-width: 680px) {
    .viewer-page {
      grid-template-rows: 52px 1fr;
    }
    .viewer-header {
      padding: 0 10px;
    }
    .viewer-title {
      display: none;
    }
    .viewer-body {
      padding: 10px;
    }
    .viewer-office-wrap,
    .viewer-text-wrap {
      height: calc(100vh - 72px);
    }
    .viewer-office-content.word > .docx-wrapper {
      padding: 14px 8px 28px;
    }
    .viewer-office-content.powerpoint {
      padding: 16px 8px 28px;
    }
  }
`;
