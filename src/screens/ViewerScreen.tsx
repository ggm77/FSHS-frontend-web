import { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { getFile, getFileContentUrl, formatBytes, downloadFileContent } from '../api/files';
import type { FileResponseDto } from '../types';

interface Props {
  fileId: number | null;
  onBack: () => void;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function ViewerScreen({ fileId, onBack }: Props) {
  const [file, setFile] = useState<FileResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    getFile(fileId)
      .then(f => setFile(f))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  if (fileId == null) return null;

  const fileUrl = getFileContentUrl(fileId, false);

  const isImage = file?.category === 'IMAGE';
  const isPdf = file?.extension === 'pdf';
  const isText = ['txt', 'log', 'json', 'md', 'html', 'css', 'js', 'ts', 'tsx'].includes(file?.extension || '');

  async function handleDownload() {
    if (!file || downloading) return;
    setDownloadError('');
    setDownloading(true);
    try {
      await downloadFileContent(file.id, file.name);
    } catch (err: unknown) {
      setDownloadError(getErrorMessage(err, '다운로드에 실패했습니다.'));
    } finally {
      setDownloading(false);
    }
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
          <button className="vbtn-download" onClick={handleDownload} disabled={!file || downloading}>
            <Icon name={downloading ? 'spinner' : 'download'} size={14} /> {downloading ? '다운로드 중...' : '다운로드'}
          </button>
        </div>
      </div>

      <div className="viewer-body">
        {downloadError && <div className="viewer-download-error">{downloadError}</div>}
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
        ) : isPdf || isText ? (
          <iframe src={fileUrl} className="viewer-iframe" title={file.name} />
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
`;
