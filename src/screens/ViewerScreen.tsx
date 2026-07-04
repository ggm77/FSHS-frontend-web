import { useState, useEffect, useCallback } from 'react';
import heic2any from 'heic2any';
import { Icon } from '../components/Icon';
import { OfficePreview, type OfficePreviewKind } from '../components/OfficePreview';
import { PdfPreview } from '../components/PdfPreview';
import { getFile, getFileContentUrl, formatBytes, deleteFile, downloadFileContent } from '../api/files';
import { createFileShare, getSharedFileUrl } from '../api/shares';
import { toAbsoluteUrl, getFileInfoGroups } from '../utils/fileInfo';
import { copyTextToClipboard } from '../utils/clipboard';
import type { FileResponseDto } from '../types';

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

interface DialogConfig {
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
}

interface CreatedShareState {
  fileId: number;
  fileName: string;
  shareKey: string;
  copied: boolean;
}

export function ViewerScreen({ fileId, onBack }: Props) {
  const [file, setFile] = useState<FileResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [heicBlobUrl, setHeicBlobUrl] = useState<string | null>(null);
  const [heicConverting, setHeicConverting] = useState(false);
  const [heicError, setHeicError] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [createdShare, setCreatedShare] = useState<CreatedShareState | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    setFile(null);
    setTextContent(null);
    setPreviewError('');
    setHeicBlobUrl(null);
    setHeicError('');
    getFile(fileId)
      .then(f => setFile(f))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  const isImage = file?.category === 'IMAGE';
  const extension = normalizeExtension(file?.extension);
  const isHeic = isImage && (extension === 'heic' || extension === 'heif');
  const isPdf = extension === 'pdf';
  const isTextDocument = isPreviewableTextDocument(file);
  const isSourceCode = file ? isSourceCodeDocument(file) : false;
  const officePreviewKind: OfficePreviewKind | null = WORD_DOCUMENT_EXTENSIONS.has(extension)
    ? 'word'
    : POWERPOINT_EXTENSIONS.has(extension)
      ? 'powerpoint'
      : null;
  const isLegacyOfficeDocument = LEGACY_OFFICE_EXTENSIONS.has(extension);
  const handlePreviewError = useCallback((message: string) => {
    setPreviewError(message);
  }, []);

  useEffect(() => {
    setTextContent(null);
    setPreviewError('');
    setPreviewLoading(false);

    if (!file || !fileId || !isTextDocument) return;

    let cancelled = false;
    const controller = new AbortController();

    setPreviewLoading(true);

    fetch(getFileContentUrl(fileId, false), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error(`미리보기 로드 실패: HTTP ${r.status}`);
        return r.arrayBuffer().then(buffer => decodeTextPreview(buffer, r.headers.get('Content-Type')));
      })
      .then(text => {
        if (cancelled) return;
        setTextContent(text);
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
      setTextContent(null);
    };
  }, [file, fileId, isTextDocument]);

  useEffect(() => {
    setHeicBlobUrl(null);
    setHeicError('');
    setHeicConverting(false);

    if (!file || !fileId || !isHeic) return;

    let cancelled = false;
    let objectUrl: string;
    const controller = new AbortController();

    setHeicConverting(true);

    fetch(getFileContentUrl(fileId, false), { credentials: 'include', signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then(blob => heic2any({ blob, toType: 'image/jpeg', quality: 0.92 }))
      .then(result => {
        if (cancelled) return;
        const converted = Array.isArray(result) ? result[0] : result;
        objectUrl = URL.createObjectURL(converted);
        setHeicBlobUrl(objectUrl);
      })
      .catch(err => {
        if (controller.signal.aborted || cancelled) return;
        setHeicError(err instanceof Error ? err.message : 'HEIC 변환 실패');
      })
      .finally(() => {
        if (!cancelled) setHeicConverting(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setHeicBlobUrl(null);
    };
  }, [file, fileId, isHeic]);

  if (fileId == null) return null;

  const fileUrl = getFileContentUrl(fileId, false);

  function handleDownload() {
    if (!file) return;
    downloadFileContent(file.id, file.name);
  }

  async function handleCreateShare() {
    if (!file || sharing) return;
    setSharing(true);
    try {
      const share = await createFileShare(file.id);
      const shareUrl = toAbsoluteUrl(getSharedFileUrl(share.shareKey));
      let copied = false;
      try {
        await copyTextToClipboard(shareUrl);
        copied = true;
      } catch {
        copied = false;
      }
      setCreatedShare({ fileId: share.fileId, fileName: file.name, shareKey: share.shareKey, copied });
      const updated = await getFile(file.id).catch(() => null);
      if (updated) setFile(updated);
    } catch (err: unknown) {
      setDialog({
        type: 'alert',
        title: '공유 실패',
        message: getErrorMessage(err, '공유 링크를 생성하지 못했습니다.'),
        onConfirm: () => setDialog(null),
      });
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyCreatedShare() {
    if (!createdShare) return;
    try {
      await copyTextToClipboard(toAbsoluteUrl(getSharedFileUrl(createdShare.shareKey)));
      setCreatedShare(prev => prev ? { ...prev, copied: true } : prev);
    } catch (err: unknown) {
      setDialog({
        type: 'alert',
        title: '복사 실패',
        message: getErrorMessage(err, '링크를 복사하지 못했습니다.'),
        onConfirm: () => setDialog(null),
      });
    }
  }

  function handleDeleteFile() {
    if (!file) return;
    setDialog({
      type: 'confirm',
      title: '파일 삭제',
      message: '파일을 삭제하시겠습니까? 삭제된 파일은 복구할 수 없습니다.',
      onConfirm: async () => {
        try {
          await deleteFile(file.id);
          setDialog(null);
          onBack();
        } catch (err: unknown) {
          setDialog({
            type: 'alert',
            title: '삭제 실패',
            message: getErrorMessage(err, '파일을 삭제하지 못했습니다.'),
            onConfirm: () => setDialog(null),
          });
        }
      },
    });
  }

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
          <button className="vbtn-icon" onClick={() => setShowInfo(true)} disabled={!file} title="파일 정보">
            <Icon name="info" size={16} />
          </button>
          <button className="vbtn-icon" onClick={handleCreateShare} disabled={!file || sharing} title="공유">
            <Icon name={sharing ? 'spinner' : 'share'} size={16} />
          </button>
          <button className="vbtn-icon danger" onClick={handleDeleteFile} disabled={!file} title="삭제">
            <Icon name="trash" size={16} />
          </button>
          <button className="vbtn-download" onClick={handleDownload} disabled={!file}>
            <Icon name="download" size={14} /> 다운로드
          </button>
        </div>
      </div>

      <div className="viewer-body">
        {loading ? (
          <div className="viewer-loader">
            <Icon name="spinner" size={28} />
            <span>파일을 불러오는 중...</span>
          </div>
        ) : !file ? (
          <div className="viewer-error">파일 정보를 불러올 수 없습니다.</div>
        ) : isImage ? (
          isHeic ? (
            heicConverting ? (
              <div className="viewer-loader">
                <Icon name="spinner" size={28} />
                <span>HEIC 변환 중...</span>
              </div>
            ) : heicError ? (
              <PreviewError message={`HEIC 변환 실패: ${heicError}`} onDownload={handleDownload} />
            ) : heicBlobUrl ? (
              <div className="viewer-media-wrap">
                <img src={heicBlobUrl} alt={file.name} className="viewer-img" />
              </div>
            ) : null
          ) : (
            <div className="viewer-media-wrap">
              <img src={fileUrl} alt={file.name} className="viewer-img" />
            </div>
          )
        ) : isPdf ? (
          previewError ? (
            <PreviewError message={previewError} onDownload={handleDownload} />
          ) : (
            <PdfPreview fileId={fileId} onError={handlePreviewError} />
          )
        ) : officePreviewKind ? (
          previewError ? (
            <PreviewError message={previewError} onDownload={handleDownload} />
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
                onError={handlePreviewError}
              />
            </div>
          )
        ) : isTextDocument ? (
          previewError ? (
            <PreviewError message={previewError} onDownload={handleDownload} />
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
            <button className="vbtn-action" onClick={handleDownload}>
              <Icon name="download" size={16} /> 다운로드 받기
            </button>
          </div>
        ) : (
          <div className="viewer-fallback">
            <div className="icon-wrap">
              <Icon name="doc" size={48} stroke={1.2} />
            </div>
            <h3>미리보기를 지원하지 않는 파일 형식입니다</h3>
            <p>이 파일은 브라우저에서 직접 열 수 없습니다. 다운로드하여 확인하세요.</p>
            <button className="vbtn-action" onClick={handleDownload}>
              <Icon name="download" size={16} /> 다운로드 받기
            </button>
          </div>
        )}
      </div>

      {showInfo && file && (
        <div className="modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="modal file-info-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="file-info-title">
                <span className="file-info-icon">
                  <Icon name="doc" size={20} color="var(--accent)" stroke={1.7} />
                </span>
                <div>
                  <h3>파일 정보</h3>
                  <p title={file.name}>{file.name}</p>
                </div>
              </div>
            </div>
            <div className="modal-body">
              {getFileInfoGroups(file).map(group => {
                const items = group.items.filter(item => item.value != null && item.value !== '');
                if (items.length === 0) return null;
                return (
                  <section className="file-info-section" key={group.title}>
                    <h4>{group.title}</h4>
                    <div className="file-info-grid">
                      {items.map(item => (
                        <div className="file-info-item" key={`${group.title}-${item.label}`}>
                          <span>{item.label}</span>
                          <strong title={item.value ?? undefined}>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="btn primary" onClick={() => setShowInfo(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {createdShare && (
        <div className="modal-backdrop" onClick={() => setCreatedShare(null)}>
          <div className="modal share-created-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>공유 링크 생성 완료</h3>
                <p>{createdShare.fileName}</p>
              </div>
              <button className="close-btn" onClick={() => setCreatedShare(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <label className="share-created-field">
                <span>공유 링크</span>
                <input
                  readOnly
                  value={toAbsoluteUrl(getSharedFileUrl(createdShare.shareKey))}
                  onFocus={e => e.currentTarget.select()}
                />
              </label>
              <div className={createdShare.copied ? 'share-copy-note good' : 'share-copy-note'}>
                {createdShare.copied ? '링크를 클립보드에 복사했습니다.' : '링크 복사가 필요하면 아래 버튼을 눌러주세요.'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setCreatedShare(null)}>닫기</button>
              <button className="btn primary" onClick={handleCopyCreatedShare}>
                <Icon name={createdShare.copied ? 'check' : 'copy'} size={14} color="var(--accent-fg)" />
                {createdShare.copied ? '복사됨' : '링크 복사'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{dialog.title}</h3>
              <button className="close-btn" onClick={() => setDialog(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p>{dialog.message}</p>
            </div>
            <div className="modal-footer">
              {dialog.type === 'confirm' && (
                <button className="btn" onClick={() => setDialog(null)}>취소</button>
              )}
              <button className="btn primary" onClick={dialog.onConfirm}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewError({ message, onDownload }: {
  message: string;
  onDownload: () => void;
}) {
  return (
    <div className="viewer-fallback">
      <div className="icon-wrap">
        <Icon name="warn" size={48} stroke={1.2} />
      </div>
      <h3>미리보기를 불러올 수 없습니다</h3>
      <p>{message}</p>
      <button className="vbtn-action" onClick={onDownload}>
        <Icon name="download" size={16} /> 다운로드 받기
      </button>
    </div>
  );
}

const viewerStyles = `
  .viewer-page {
    display: grid;
    grid-template-rows: 56px 1fr;
    width: 100%;
    min-width: 0;
    max-width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #0f1015;
    color: #fff;
    font-family: inherit;
  }
  .viewer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 0 20px;
    box-sizing: border-box;
    background: #161822;
    border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
    z-index: 10;
  }
  .vbtn-back {
    flex: 0 0 auto;
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
    flex: 1 1 auto;
    min-width: 0;
    text-align: center;
    max-width: 50%;
    margin: 0 12px;
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
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
  }
  .vbtn-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.06);
    color: #eee;
    border: 0;
    border-radius: 9px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .vbtn-icon:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .vbtn-icon.danger:hover {
    background: rgba(239, 68, 68, 0.18);
    color: #fca5a5;
  }
  .vbtn-icon:disabled {
    opacity: .5;
    cursor: not-allowed;
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
    min-width: 0;
    background: #0f1015;
    overflow: hidden;
    position: relative;
    padding: 24px;
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
  .pdf-preview-scroll {
    position: relative;
    width: min(95%, 1080px);
    height: 82vh;
    min-width: 320px;
    min-height: 480px;
    overflow: auto;
    overscroll-behavior: contain;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  }
  .pdf-preview-pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px;
  }
  .pdf-preview-page {
    position: relative;
    width: 100%;
    max-width: 900px;
    background: #f5f5f5;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  }
  .pdf-preview-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .pdf-preview-loading {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #5f6878;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(3px);
    border-radius: 12px;
  }
  .pdf-preview-loading span {
    font-size: 14px;
    font-weight: 650;
    color: #303848;
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

  .file-info-modal {
    width: min(720px, calc(100vw - 32px));
    max-height: min(780px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }
  .file-info-modal .modal-header {
    padding: 18px 20px 14px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--hairline);
  }
  .file-info-title {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .file-info-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--accent-soft);
  }
  .file-info-title h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: var(--fg);
  }
  .file-info-title p {
    margin: 4px 0 0;
    color: var(--fg-3);
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 560px;
  }
  .file-info-modal .modal-body {
    padding: 18px 20px;
    display: grid;
    gap: 18px;
    overflow-y: auto;
  }
  .file-info-section h4 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 800;
    color: var(--fg-3);
  }
  .file-info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
  }
  .file-info-item {
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    background: var(--surface-1);
  }
  .file-info-item span {
    display: block;
    margin-bottom: 4px;
    color: var(--fg-3);
    font-size: 11.5px;
    font-weight: 750;
  }
  .file-info-item strong {
    display: block;
    color: var(--fg);
    font-size: 13px;
    font-weight: 700;
    overflow-x: auto;
    overflow-y: hidden;
    text-overflow: clip;
    white-space: nowrap;
    padding-bottom: 2px;
  }
  .file-info-modal .modal-footer {
    padding: 12px 20px 18px;
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--hairline);
  }
  @media (max-width: 640px) {
    .file-info-grid {
      grid-template-columns: 1fr;
    }
  }

  .share-created-modal {
    width: min(520px, calc(100vw - 32px));
    background: var(--bg);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }
  .share-created-modal .modal-header {
    padding: 18px 20px 14px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--hairline);
  }
  .share-created-modal h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: var(--fg);
  }
  .share-created-modal .modal-header p {
    margin: 4px 0 0;
    color: var(--fg-3);
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 360px;
  }
  .share-created-modal .modal-body {
    padding: 18px 20px;
    display: grid;
    gap: 12px;
  }
  .share-created-field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .share-created-field span {
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 750;
  }
  .share-created-field input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-1);
    color: var(--fg);
    padding: 9px 10px;
    font: inherit;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .share-copy-note {
    color: var(--fg-3);
    font-size: 12.5px;
  }
  .share-copy-note.good {
    color: var(--good);
    font-weight: 700;
  }
  .share-created-modal .modal-footer {
    padding: 12px 20px 18px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--hairline);
  }

  .confirm-modal {
    width: 360px;
    background: var(--bg-2);
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }
  .confirm-modal .modal-header {
    padding: 18px 20px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--hairline);
  }
  .confirm-modal .modal-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--fg);
  }
  .confirm-modal .modal-header .close-btn {
    background: transparent;
    border: 0;
    color: var(--fg-3);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 4px;
    border-radius: 6px;
  }
  .confirm-modal .modal-header .close-btn:hover {
    background: var(--surface-1);
    color: var(--fg);
  }
  .confirm-modal .modal-body {
    padding: 20px;
    font-size: 13.5px;
    color: var(--fg-2);
    line-height: 1.5;
  }
  .confirm-modal .modal-footer {
    padding: 12px 20px 18px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    background: var(--bg);
    border-top: 1px solid var(--hairline);
  }
  .confirm-modal .modal-footer button {
    height: 36px;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 600;
  }
`;
