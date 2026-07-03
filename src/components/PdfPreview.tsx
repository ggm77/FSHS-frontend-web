import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { getFileContentUrl } from '../api/files';
import { Icon } from './Icon';

// iframe(sandbox) + 브라우저 내장 PDF 뷰어는 쓰지 않는다: sandbox를 걸면 Chrome/Safari의
// 내장 뷰어가 아예 렌더링을 거부한다(플러그인 인스턴스화가 sandbox로 막힘, 재현 확인됨).
// 그래서 pdfjs-dist로 직접 파싱해 canvas에 그린다 — 중첩 브라우징 컨텍스트가 없으니
// sandbox 트레이드오프 자체가 없다.

interface Props {
  fileId?: number;
  contentUrl?: string;
  onError: (message: string) => void;
}

interface PageMeta {
  pageNumber: number;
  aspectRatio: number;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'PDF 미리보기를 불러올 수 없습니다.';
}

export function PdfPreview({ fileId, contentUrl, onError }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const previewUrl = contentUrl ?? (fileId != null ? getFileContentUrl(fileId, false) : null);

  const pdfLibRef = useRef<typeof import('pdfjs-dist') | null>(null);
  const pageProxiesRef = useRef(new Map<number, PDFPageProxy>());
  const renderTasksRef = useRef(new Map<number, RenderTask>());
  const pageElsRef = useRef(new Map<number, HTMLDivElement>());

  // 문서 로드: previewUrl이 바뀔 때만 다시 받아온다.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | null = null;
    const renderTasks = renderTasksRef.current;
    const pageProxies = pageProxiesRef.current;

    setLoading(true);
    setPages([]);
    onError('');

    async function run() {
      if (!previewUrl) throw new Error('PDF 미리보기 URL이 없습니다.');

      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href;
      pdfLibRef.current = pdfjsLib;

      const response = await fetch(previewUrl, { credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new Error(`PDF 로드 실패: HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      if (cancelled) return;

      loadingTask = pdfjsLib.getDocument({
        data,
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        wasmUrl: '/pdfjs/wasm/',
      });

      const pdf = await loadingTask.promise;
      if (cancelled) return;

      const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
      const proxies = await Promise.all(pageNumbers.map(n => pdf.getPage(n)));
      if (cancelled) {
        proxies.forEach(page => page.cleanup());
        return;
      }

      proxies.forEach((page, i) => pageProxies.set(pageNumbers[i], page));

      setPages(proxies.map((page, i) => {
        const viewport = page.getViewport({ scale: 1 });
        return { pageNumber: pageNumbers[i], aspectRatio: viewport.width / viewport.height };
      }));
      setLoading(false);
    }

    run().catch(err => {
      if (controller.signal.aborted || cancelled) return;
      onError(getErrorMessage(err));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
      renderTasks.forEach(task => task.cancel());
      renderTasks.clear();
      pageProxies.forEach(page => page.cleanup());
      pageProxies.clear();
      loadingTask?.destroy();
      pdfLibRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  // 페이지 목록이 갖춰진 뒤(placeholder DOM이 존재한 뒤) 스크롤 관찰을 시작한다.
  useEffect(() => {
    if (pages.length === 0) return;

    async function renderPage(pageNumber: number, container: HTMLDivElement) {
      const page = pageProxiesRef.current.get(pageNumber);
      if (!page || renderTasksRef.current.has(pageNumber)) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = (container.clientWidth || baseViewport.width) / baseViewport.width;
      const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-preview-canvas';
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      container.replaceChildren(canvas);

      const task = page.render({ canvas, viewport });
      renderTasksRef.current.set(pageNumber, task);
      try {
        await task.promise;
      } catch (err) {
        const cancelledCtor = pdfLibRef.current?.RenderingCancelledException;
        if (cancelledCtor && err instanceof cancelledCtor) return;
        throw err;
      } finally {
        renderTasksRef.current.delete(pageNumber);
      }
    }

    function clearPage(pageNumber: number, container: HTMLDivElement) {
      renderTasksRef.current.get(pageNumber)?.cancel();
      renderTasksRef.current.delete(pageNumber);
      container.replaceChildren();
      pageProxiesRef.current.get(pageNumber)?.cleanup();
    }

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (!pageNumber) continue;

        if (entry.isIntersecting) {
          renderPage(pageNumber, entry.target as HTMLDivElement).catch(err => {
            onError(getErrorMessage(err));
          });
        } else {
          clearPage(pageNumber, entry.target as HTMLDivElement);
        }
      }
    }, { root: scrollRef.current, rootMargin: '150% 0px' });

    pageElsRef.current.forEach(el => observer.observe(el));

    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  return (
    <div className="pdf-preview-scroll" ref={scrollRef}>
      <div className="pdf-preview-pages">
        {pages.map(({ pageNumber, aspectRatio }) => (
          <div
            key={pageNumber}
            className="pdf-preview-page"
            style={{ aspectRatio: `${aspectRatio}` }}
            data-page-number={pageNumber}
            ref={el => {
              if (el) pageElsRef.current.set(pageNumber, el);
              else pageElsRef.current.delete(pageNumber);
            }}
          />
        ))}
      </div>
      {loading && (
        <div className="pdf-preview-loading">
          <Icon name="spinner" size={28} />
          <span>PDF를 불러오는 중...</span>
        </div>
      )}
    </div>
  );
}
