import { useEffect, useRef, useState } from 'react';
import type { HwpDocument } from '@rhwp/core';
import rhwpWasmUrl from '@rhwp/core/rhwp_bg.wasm?url';
import { getFileContentUrl } from '../api/files';
import { Icon } from './Icon';

// HWP(5.0 바이너리)/HWPX를 @rhwp/core(Rust → WASM)로 파싱해 페이지마다 canvas에 그린다.
// SVG 출력(renderPageSvg)도 있지만 문서에서 온 문자열을 innerHTML로 꽂아야 하므로 쓰지 않는다.
// canvas는 링크·스크립트가 끼어들 여지가 없어 PDF 미리보기와 같은 방식으로 맞췄다.

interface Props {
  fileId?: number;
  contentUrl?: string;
  onError: (message: string) => void;
}

interface PageMeta {
  index: number;
  width: number;
  height: number;
}

// 한컴 전용 글꼴(함초롬바탕, 한컴돋움 등)은 rhwp가 이 오픈소스 글꼴로 폴백한다.
// 없으면 시스템 기본 글꼴로 그려져 줄바꿈 위치가 원본과 달라진다.
const FALLBACK_FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap';
const FALLBACK_FONT_FAMILIES = ['Noto Sans KR', 'Noto Serif KR'];
const FONT_WAIT_TIMEOUT_MS = 2500;
// 문서에 포함된 이미지는 비동기로 디코딩되므로 첫 렌더에서 빠질 수 있다.
// rhwp 공식 뷰어와 같이 잠시 뒤 한 번 더 그린다.
const RERENDER_DELAYS_MS = [200, 600];

let rhwpInitPromise: Promise<typeof import('@rhwp/core')> | null = null;

function loadRhwp() {
  if (!rhwpInitPromise) {
    rhwpInitPromise = import('@rhwp/core')
      .then(async mod => {
        await mod.default({ module_or_path: rhwpWasmUrl });
        return mod;
      })
      .catch(err => {
        rhwpInitPromise = null;
        throw err;
      });
  }
  return rhwpInitPromise;
}

function ensureFallbackFonts(): Promise<void> {
  if (!document.querySelector('link[data-hwp-fonts]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FALLBACK_FONT_STYLESHEET;
    link.dataset.hwpFonts = 'true';
    document.head.appendChild(link);
  }

  // 한글 subset 일부라도 받아둔 뒤 첫 페이지를 그린다. 글꼴 서버가 막혀 있어도
  // 미리보기는 떠야 하므로 시간 제한을 두고 실패는 무시한다.
  const loads = FALLBACK_FONT_FAMILIES.flatMap(family => [
    document.fonts.load(`16px "${family}"`, '가나다ABC'),
    document.fonts.load(`bold 16px "${family}"`, '가나다ABC'),
  ]);
  return Promise.race([
    Promise.allSettled(loads).then(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, FONT_WAIT_TIMEOUT_MS)),
  ]);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return '한글 문서 미리보기를 불러올 수 없습니다.';
}

function toUserMessage(err: unknown): string {
  const message = getErrorMessage(err);
  if (/비밀번호|password|암호/i.test(message)) {
    return '암호가 걸린 한글 문서는 미리볼 수 없습니다. 다운로드해서 확인하세요.';
  }
  if (/DRM/i.test(message)) {
    return 'DRM이 적용된 한글 문서는 미리볼 수 없습니다. 다운로드해서 확인하세요.';
  }
  if (/UNSUPPORTED_FILE_FORMAT|유효하지 않은 파일/.test(message)) {
    return '손상되었거나 지원하지 않는 한글 문서 형식입니다. 다운로드해서 확인하세요.';
  }
  return message;
}

export function HwpPreview({ fileId, contentUrl, onError }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const previewUrl = contentUrl ?? (fileId != null ? getFileContentUrl(fileId, false) : null);

  const docRef = useRef<HwpDocument | null>(null);
  const pageElsRef = useRef(new Map<number, HTMLDivElement>());

  // 문서 로드: previewUrl이 바뀔 때만 다시 받아온다.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setPages([]);
    onError('');

    async function run() {
      if (!previewUrl) throw new Error('한글 문서 미리보기 URL이 없습니다.');

      const [rhwp, response] = await Promise.all([
        loadRhwp(),
        fetch(previewUrl, { credentials: 'include', signal: controller.signal }),
        ensureFallbackFonts(),
      ]);
      if (!response.ok) throw new Error(`한글 문서 로드 실패: HTTP ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (cancelled) return;

      const doc = new rhwp.HwpDocument(data);
      if (cancelled) {
        doc.free();
        return;
      }
      docRef.current = doc;

      const pageCount = doc.pageCount();
      if (pageCount === 0) throw new Error('표시할 페이지가 없는 문서입니다.');

      const metas: PageMeta[] = [];
      for (let index = 0; index < pageCount; index++) {
        const info = JSON.parse(doc.getPageInfo(index)) as { width: number; height: number };
        metas.push({ index, width: info.width, height: info.height });
      }
      setPages(metas);
      setLoading(false);
    }

    run().catch(err => {
      if (controller.signal.aborted || cancelled) return;
      onError(toUserMessage(err));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
      docRef.current?.free();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  // 페이지 목록이 갖춰진 뒤(placeholder DOM이 존재한 뒤) 화면 근처 페이지만 그린다.
  useEffect(() => {
    if (pages.length === 0) return;

    const rendered = new Set<number>();
    const timers = new Map<number, ReturnType<typeof setTimeout>[]>();

    function cancelTimers(index: number) {
      timers.get(index)?.forEach(clearTimeout);
      timers.delete(index);
    }

    function draw(index: number, canvas: HTMLCanvasElement, container: HTMLDivElement) {
      const doc = docRef.current;
      const page = pages[index];
      if (!doc || !page) return;
      const cssWidth = container.clientWidth || page.width;
      const scale = (cssWidth / page.width) * (window.devicePixelRatio || 1);
      doc.renderPageToCanvas(index, canvas, scale);
    }

    function renderPage(index: number, container: HTMLDivElement) {
      if (rendered.has(index)) return;

      const canvas = document.createElement('canvas');
      canvas.className = 'hwp-preview-canvas';
      draw(index, canvas, container);
      container.replaceChildren(canvas);
      rendered.add(index);

      cancelTimers(index);
      timers.set(index, RERENDER_DELAYS_MS.map(delay => setTimeout(() => {
        if (rendered.has(index) && canvas.isConnected) draw(index, canvas, container);
      }, delay)));
    }

    function clearPage(index: number, container: HTMLDivElement) {
      cancelTimers(index);
      rendered.delete(index);
      container.replaceChildren();
    }

    // 폴백 글꼴의 다른 unicode-range subset이 뒤늦게 도착하면 이미 그린 페이지를 다시 그린다.
    function handleFontsLoaded() {
      rendered.forEach(index => {
        const container = pageElsRef.current.get(index);
        const canvas = container?.querySelector('canvas');
        if (container && canvas) {
          try {
            draw(index, canvas, container);
          } catch {
            // 재렌더 실패는 기존 그림을 유지한다.
          }
        }
      });
    }
    document.fonts.addEventListener('loadingdone', handleFontsLoaded);

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.pageIndex);
        if (!Number.isInteger(index)) continue;

        if (entry.isIntersecting) {
          try {
            renderPage(index, entry.target as HTMLDivElement);
          } catch (err) {
            onError(toUserMessage(err));
          }
        } else {
          clearPage(index, entry.target as HTMLDivElement);
        }
      }
    }, { root: scrollRef.current, rootMargin: '150% 0px' });

    pageElsRef.current.forEach(el => observer.observe(el));

    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', handleFontsLoaded);
      timers.forEach(list => list.forEach(clearTimeout));
      timers.clear();
      rendered.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  return (
    <div className="viewer-office-scroll" ref={scrollRef}>
      <div className="hwp-preview-pages" aria-busy={loading}>
        {pages.map(({ index, width, height }) => (
          <div
            key={index}
            className="hwp-preview-page"
            style={{ maxWidth: `${width}px`, aspectRatio: `${width} / ${height}` }}
            data-page-index={index}
            ref={el => {
              if (el) pageElsRef.current.set(index, el);
              else pageElsRef.current.delete(index);
            }}
          />
        ))}
      </div>
      {loading && (
        <div className="viewer-office-loading">
          <Icon name="spinner" size={28} />
          <span>한글 문서를 렌더링하는 중...</span>
          <small>큰 문서는 잠시 시간이 걸릴 수 있습니다.</small>
        </div>
      )}
    </div>
  );
}
