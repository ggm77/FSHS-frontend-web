import { useEffect, useRef, useState } from 'react';
import { getFileContentUrl } from '../api/files';
import { Icon } from './Icon';

export type OfficePreviewKind = 'word' | 'powerpoint';

interface Props {
  fileId?: number;
  contentUrl?: string;
  kind: OfficePreviewKind;
  onError: (message: string) => void;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : '문서 미리보기를 불러올 수 없습니다.';
}

export function OfficePreview({ fileId, contentUrl, kind, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const previewUrl = contentUrl ?? (fileId != null ? getFileContentUrl(fileId, false) : null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let pptxViewer: { destroy: () => void } | null = null;
    const controller = new AbortController();

    container.replaceChildren();
    setLoading(true);
    onError('');

    async function renderPreview(previewContainer: HTMLDivElement) {
      if (!previewUrl) throw new Error('문서 미리보기 URL이 없습니다.');

      const response = await fetch(previewUrl, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`미리보기 로드 실패: HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      if (cancelled) return;

      if (kind === 'word') {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;

        // Detached DOM에서 완성한 뒤 한 번에 붙여 StrictMode의 중복 렌더와
        // 부분 렌더링 화면 노출을 막는다.
        const staging = document.createElement('div');
        await renderAsync(buffer, staging, staging, {
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          renderChanges: false,
          // DOCX 내부의 임의 HTML 조각은 실행 가능한 콘텐츠가 될 수 있다.
          renderAltChunks: false,
          useBase64URL: true,
        });

        if (!cancelled) {
          previewContainer.replaceChildren(...Array.from(staging.childNodes));
        }
        return;
      }

      const {
        PptxViewer,
        RECOMMENDED_ZIP_LIMITS,
      } = await import('@aiden0z/pptx-renderer');
      if (cancelled) return;

      const scrollContainer = previewContainer.parentElement ?? undefined;
      const viewer = new PptxViewer(previewContainer, {
        fitMode: 'contain',
        scrollContainer,
        zipLimits: RECOMMENDED_ZIP_LIMITS,
        lazyMedia: true,
        lazySlides: true,
        pdfjs: false,
      });
      pptxViewer = viewer;

      await viewer.open(buffer, {
        renderMode: 'list',
        signal: controller.signal,
        lazyMedia: true,
        lazySlides: true,
        listOptions: {
          windowed: true,
          initialSlides: 4,
          batchSize: 4,
          overscanViewport: 1.5,
          showSlideLabels: true,
        },
      });
    }

    renderPreview(container)
      .catch(err => {
        if (!controller.signal.aborted && !cancelled) {
          onError(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      pptxViewer?.destroy();
      container.replaceChildren();
    };
  }, [kind, onError, previewUrl]);

  return (
    <div className="viewer-office-scroll">
      <div
        ref={containerRef}
        className={`viewer-office-content ${kind}`}
        aria-busy={loading}
      />
      {loading && (
        <div className="viewer-office-loading">
          <Icon name="spinner" size={28} />
          <span>{kind === 'word' ? 'Word 문서를 렌더링하는 중...' : 'PowerPoint를 렌더링하는 중...'}</span>
          <small>큰 문서는 잠시 시간이 걸릴 수 있습니다.</small>
        </div>
      )}
    </div>
  );
}
