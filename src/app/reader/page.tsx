"use client";

import { Suspense, useState, useEffect, useRef, useMemo, useCallback, type Dispatch, type SetStateAction, type WheelEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Columns2,
  Download,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Type,
  X,
  BookMarked,
  AlignLeft,
  Pin,
  PinOff,
} from "lucide-react";
import { sampleBook, type Book, type Chapter } from "@/lib/sampleData";
import { getExtraExampleBookById } from "@/lib/exampleReaderBooks";
import { stripEmDashes } from "@/lib/agent/sanitize";
import { cn } from "@/lib/utils";
import AccountMenu from "@/components/AccountMenu";
import { useAuthUser } from "@/hooks/useAuthUser";

// ─── Types ───────────────────────────────────────────────────
interface Page {
  globalIndex: number;
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  isChapterStart: boolean;
  isCover?: boolean;
  coverImageUrl?: string;
  bookTitle?: string;
  genre?: string;
  tone?: string;
  coverFrom?: string;
  coverVia?: string;
  coverAccent?: string;
  paragraphs: string[];
  wordCount: number;
}

interface ApiProject {
  id: string;
  status: "pending" | "queued" | "planning" | "awaiting_approval" | "writing" | "complete" | "failed";
  batches: Array<{
    batchNumber: number;
    chapterNumber?: number;
    chapterTitle?: string;
    prose: string;
    wordCount: number;
  }>;
  totalWords: number;
  targetWords: number;
  title?: string;
  synopsis?: string;
  coverStatus: "pending" | "generating" | "complete" | "failed";
  cover?: { imageUrl: string; prompt: string; model: string; createdAt: string };
  coverError?: string;
  input: { preferences: { genre: string; tone: string } };
}

type ReaderMode = "kindle" | "book";
type ReaderWidth = "narrow" | "comfortable" | "wide";
type ExportFormat = "pdf" | "epub";

interface ReaderSettings {
  columns: 1 | 2;
  fontSize: number;
  width: ReaderWidth;
}

const WIDTH_PX: Record<ReaderWidth, number> = {
  narrow: 760,
  comfortable: 1040,
  wide: 1280,
};

// ─── Pagination ───────────────────────────────────────────────
// Pages are sized to the available rendering area. Kindle mode uses a wider,
// single-column layout; book mode shows a two-page spread where each half page
// is much smaller, so it needs its own (denser) pagination.
const WORDS_PER_PAGE = 640;                    // kindle single-page target
// Fallback word-count pagination for book mode (used until DOM measurement
// completes, and as SSR-safe default). The real book-mode pages are laid out
// by `measureBookPages`, which reads actual rendered heights so no prose gets
// clipped at the bottom of a half-page.
const BOOK_WORDS_PER_PAGE_FALLBACK = 180;
const BOOK_IMMERSIVE_WORDS_PER_PAGE_FALLBACK = 160;
const MAX_PARAGRAPH_WORDS = 150;
const FLIP_DURATION_MS = 520;

function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function splitLongParagraph(paragraph: string): string[] {
  const wordCount = countWords(paragraph);
  if (wordCount <= MAX_PARAGRAPH_WORDS) return [paragraph.trim()];

  const sentences = paragraph
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean);

  if (!sentences?.length) return [paragraph.trim()];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (current.length && currentWords + sentenceWords > MAX_PARAGRAPH_WORDS) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += sentenceWords;
  }

  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

function paginateBook(book: Book, wordsPerPage: number = WORDS_PER_PAGE): Page[] {
  const palette = {
    coverFrom: book.coverFrom,
    coverVia: book.coverVia,
    coverAccent: book.coverAccent,
  };
  const pages: Page[] = [
    {
      globalIndex: 0,
      chapterIndex: -1,
      chapterNumber: 0,
      chapterTitle: "Cover",
      isChapterStart: false,
      isCover: true,
      coverImageUrl: book.coverImageUrl,
      bookTitle: book.title,
      genre: book.genre,
      tone: book.tone,
      ...palette,
      paragraphs: [book.title, book.synopsis].filter(Boolean),
      wordCount: countWords(`${book.title} ${book.synopsis}`),
    },
  ];
  let globalIndex = 1;

  for (let ci = 0; ci < book.chapters.length; ci++) {
    const ch = book.chapters[ci];
    const allParas = ch.content
      .split(/\n\n+/)
      .flatMap((p) => splitLongParagraph(p))
      .filter((p) => p.trim());
    let pageParas: string[] = [];
    let pageWords = 0;
    let isFirst = true;

    const flushPage = () => {
      if (!pageParas.length) return;
      pages.push({
        globalIndex: globalIndex++,
        chapterIndex: ci,
        chapterNumber: ch.number,
        chapterTitle: ch.title,
        isChapterStart: isFirst,
        paragraphs: [...pageParas],
        wordCount: pageWords,
      });
      isFirst = false;
      pageParas = [];
      pageWords = 0;
    };

    for (const para of allParas) {
      const wc = countWords(para);
      if (pageWords + wc > wordsPerPage && pageParas.length > 0) {
        flushPage();
      }
      pageParas.push(para.trim());
      pageWords += wc;
    }
    flushPage();
  }

  if (!pages.length) {
    pages.push({
      globalIndex: 0,
      chapterIndex: 0,
      chapterNumber: 1,
      chapterTitle: "Chapter 1",
      isChapterStart: true,
      paragraphs: ["(No content yet.)"],
      wordCount: 0,
    });
  }

  return pages;
}

// ─── Measurement-based book pagination ────────────────────────
// Word-count pagination is unreliable for book mode because the visible height
// of a half-page varies with viewport size, fullscreen state, and font metrics.
// Any constant we pick clips some content. Instead, we render an off-screen
// clone of BookPageContent and pack paragraphs into each page until adding one
// more would overflow the prose area — then cut the page there. This produces
// a natural, zero-clip pagination that adapts to the actual reader chrome.
function measureBookPages(
  book: Book,
  pageWidth: number,
  pageHeight: number,
  immersive: boolean
): Page[] {
  if (typeof document === "undefined") {
    return paginateBook(
      book,
      immersive ? BOOK_IMMERSIVE_WORDS_PER_PAGE_FALLBACK : BOOK_WORDS_PER_PAGE_FALLBACK
    );
  }

  const pad = immersive
    ? { t: 52, r: 48, b: 36, l: 48 }
    : { t: 32, r: 28, b: 24, l: 28 };
  const fontSize = immersive ? 15 : 11.5;
  const lineHeight = immersive ? 1.9 : 1.85;
  const proseFont = "var(--font-lora, Georgia, serif)";
  const headingFont = "var(--font-playfair, Georgia, serif)";

  const host = document.createElement("div");
  host.style.cssText = `position:fixed;top:-10000px;left:-10000px;width:${pageWidth}px;height:${pageHeight}px;visibility:hidden;pointer-events:none;contain:layout style;`;
  const inner = document.createElement("div");
  inner.style.cssText = `box-sizing:border-box;width:100%;height:100%;padding:${pad.t}px ${pad.r}px ${pad.b}px ${pad.l}px;display:flex;flex-direction:column;`;
  host.appendChild(inner);
  document.body.appendChild(host);

  const makeChapterHeader = (ch: Chapter) => {
    const h = document.createElement("div");
    h.style.cssText = `margin-bottom:${immersive ? 28 : 20}px;flex-shrink:0;`;
    h.innerHTML = `
      <p style="font-weight:500;color:#C97D30;text-transform:uppercase;letter-spacing:0.18em;margin:0 0 4px 0;font-size:${immersive ? 11 : 9}px;">Chapter ${ch.number}</p>
      <h3 style="margin:0;font-family:${headingFont};font-weight:700;color:#2D2420;line-height:1.15;font-size:${immersive ? 24 : 18}px;">${escapeHtml(ch.title)}</h3>
      <div style="height:1px;background:#E8B887;margin-top:12px;width:${immersive ? 40 : 32}px;"></div>
    `;
    return h;
  };

  const makeRunningHeader = (ch: Chapter, pageNo: number) => {
    const h = document.createElement("div");
    h.style.cssText = `margin-bottom:16px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;font-size:${immersive ? 11 : 9}px;color:#A69A8F;text-transform:uppercase;letter-spacing:0.18em;`;
    h.innerHTML = `<span>${escapeHtml(ch.title)}</span><span style="font-family:monospace;">${pageNo}</span>`;
    return h;
  };

  const makeFooter = () => {
    const f = document.createElement("div");
    f.style.cssText = `flex-shrink:0;padding-top:12px;border-top:1px solid rgba(232,221,199,0.6);display:flex;justify-content:center;font-size:${immersive ? 11 : 9}px;color:#A69A8F;font-style:italic;`;
    f.textContent = "0";
    return f;
  };

  const makeProse = () => {
    const p = document.createElement("div");
    p.style.cssText = `flex:1 1 0;min-height:0;overflow:hidden;font-family:${proseFont};font-size:${fontSize}px;line-height:${lineHeight};color:#2D2420;letter-spacing:0.01em;`;
    return p;
  };

  const makePara = (text: string) => {
    const p = document.createElement("p");
    p.style.cssText = `margin:0 0 0.9em 0;`;
    p.textContent = text;
    return p;
  };

  try {
    const pages: Page[] = [
      {
        globalIndex: 0,
        chapterIndex: -1,
        chapterNumber: 0,
        chapterTitle: "Cover",
        isChapterStart: false,
        isCover: true,
        coverImageUrl: book.coverImageUrl,
        bookTitle: book.title,
        genre: book.genre,
        tone: book.tone,
        coverFrom: book.coverFrom,
        coverVia: book.coverVia,
        coverAccent: book.coverAccent,
        paragraphs: [book.title, book.synopsis].filter(Boolean),
        wordCount: countWords(`${book.title} ${book.synopsis}`),
      },
    ];
    let globalIndex = 1;

    for (let ci = 0; ci < book.chapters.length; ci++) {
      const ch = book.chapters[ci];
      const allParas = ch.content
        .split(/\n\n+/)
        .flatMap((p) => splitLongParagraph(p))
        .filter((p) => p.trim());

      let isFirst = true;
      let pageParas: string[] = [];

      // Install fresh page layout in measurer
      let prose = makeProse();
      const setupPage = (chapterStart: boolean) => {
        inner.innerHTML = "";
        inner.appendChild(chapterStart ? makeChapterHeader(ch) : makeRunningHeader(ch, globalIndex + 1));
        prose = makeProse();
        inner.appendChild(prose);
        inner.appendChild(makeFooter());
      };

      const flushPage = () => {
        if (!pageParas.length) return;
        pages.push({
          globalIndex: globalIndex++,
          chapterIndex: ci,
          chapterNumber: ch.number,
          chapterTitle: ch.title,
          isChapterStart: isFirst,
          paragraphs: [...pageParas],
          wordCount: pageParas.reduce((a, p) => a + countWords(p), 0),
        });
        isFirst = false;
        pageParas = [];
      };

      setupPage(isFirst);

      for (const para of allParas) {
        const node = makePara(para);
        prose.appendChild(node);

        // overflow? (1px tolerance avoids subpixel flapping)
        if (prose.scrollHeight > prose.clientHeight + 1 && pageParas.length > 0) {
          prose.removeChild(node);
          flushPage();
          setupPage(isFirst);
          prose.appendChild(node);
          pageParas.push(para);
          // Edge case: a single para longer than the page. We still commit it
          // and move on; clipping one overflowing paragraph is better than an
          // infinite loop. splitLongParagraph already caps paragraphs at 150w
          // so this is rare.
        } else {
          pageParas.push(para);
        }
      }
      flushPage();
    }

    if (!pages.length) {
      pages.push({
        globalIndex: 0,
        chapterIndex: 0,
        chapterNumber: 1,
        chapterTitle: "Chapter 1",
        isChapterStart: true,
        paragraphs: ["(No content yet.)"],
        wordCount: 0,
      });
    }

    return pages;
  } finally {
    document.body.removeChild(host);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

// Compute the half-page render box the BookReader uses. Must stay in sync with
// the inline styles in BookReader (spread width/height + 12px spine).
function computeBookHalfPageSize(immersive: boolean): { w: number; h: number } | null {
  if (typeof window === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spreadW = immersive ? Math.min(1480, vw * 0.96) : Math.min(820, vw * 0.88);
  const spreadH = immersive ? Math.min(960, vh * 0.97) : Math.min(560, vh * 0.70);
  return { w: Math.max(200, (spreadW - 12) / 2), h: Math.max(200, spreadH) };
}

function useMeasuredBookPages(book: Book, immersive: boolean, enabled: boolean): Page[] {
  // Fallback pagination renders immediately (SSR-safe, shown for 1 frame before
  // measurement replaces it). Tighter fallbacks reduce mid-flight clipping.
  const fallback = useMemo(
    () =>
      paginateBook(
        book,
        immersive ? BOOK_IMMERSIVE_WORDS_PER_PAGE_FALLBACK : BOOK_WORDS_PER_PAGE_FALLBACK
      ),
    [book, immersive]
  );
  const [measuredPages, setMeasuredPages] = useState<Page[]>(fallback);

  // Re-measure on book/immersive change, and on viewport resize.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let raf = 0;
    const run = () => {
      const size = computeBookHalfPageSize(immersive);
      if (!size) return;
      const measured = measureBookPages(book, size.w, size.h, immersive);
      setMeasuredPages(measured);
    };
    // Defer to next frame so layout (fullscreen transition, fonts) has settled.
    raf = requestAnimationFrame(run);

    let resizeTimer: number | undefined;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(run, 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, [book, immersive, enabled, fallback]);

  return enabled ? measuredPages : fallback;
}

// ─── Data helpers ─────────────────────────────────────────────
const coverPalettes = [
  { coverFrom: "#1a1a2e", coverVia: "#16213e", coverTo: "#0f172a", coverAccent: "#818cf8" },
  { coverFrom: "#2d1a00", coverVia: "#3d1f00", coverTo: "#1a0a00", coverAccent: "#f59e0b" },
  { coverFrom: "#0d1b2a", coverVia: "#1b2a3d", coverTo: "#0a1220", coverAccent: "#38bdf8" },
  { coverFrom: "#1e3a2f", coverVia: "#14291f", coverTo: "#0a1713", coverAccent: "#86efac" },
  { coverFrom: "#2d0a2e", coverVia: "#1a0620", coverTo: "#0f0417", coverAccent: "#d8b4fe" },
  { coverFrom: "#3a0a0a", coverVia: "#1f0606", coverTo: "#150303", coverAccent: "#fb923c" },
];

function paletteForId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return coverPalettes[Math.abs(h) % coverPalettes.length];
}

function projectToBook(p: ApiProject): Book {
  type Acc = { number: number; title: string; prose: string[]; words: number };
  const chapters: Acc[] = [];
  let current: Acc | null = null;
  let next = 1;
  for (const b of p.batches) {
    if (b.chapterTitle || !current) {
      current = { number: b.chapterNumber ?? next, title: b.chapterTitle ?? `Chapter ${next}`, prose: [b.prose], words: b.wordCount };
      next = current.number + 1;
      chapters.push(current);
    } else {
      current.prose.push(b.prose);
      current.words += b.wordCount;
    }
  }
  const mapped: Chapter[] = chapters.map((c, i) => ({
    number: c.number,
    title: c.title,
    content: c.prose.join("\n\n"),
    imagePlaceholder: i % 2 === 0 ? `${c.title} — key scene` : undefined,
  }));
  const finalChapters: Chapter[] = mapped.length ? mapped : [{ number: 1, title: "Chapter 1", content: "(No content yet.)" }];
  const palette = paletteForId(p.id);
  return {
    id: p.id, title: p.title ?? "Untitled Book", synopsis: p.synopsis ?? "",
    genre: p.input.preferences.genre || "Fiction", tone: p.input.preferences.tone || "",
    wordCount: p.totalWords, chapterCount: finalChapters.length,
    createdAt: new Date().toISOString(), status: "complete",
    coverImageUrl: p.cover?.imageUrl,
    chapters: finalChapters, ...palette,
  };
}

// ─── Kindle Reader ────────────────────────────────────────────
function KindleReader({
  pages,
  currentPage,
  onNavigate,
  settings,
  immersive = false,
}: {
  pages: Page[];
  currentPage: number;
  onNavigate: (n: number) => void;
  settings: ReaderSettings;
  immersive?: boolean;
}) {
  const page = pages[currentPage];
  const [direction, setDirection] = useState<1 | -1>(1);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (delta: number) => {
      const next = currentPage + delta;
      if (next < 0 || next >= pages.length) return;
      setDirection(delta > 0 ? 1 : -1);
      onNavigate(next);
    },
    [currentPage, pages.length, onNavigate]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go]);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [currentPage]);

  const progressPct = pages.length > 1 ? (currentPage / (pages.length - 1)) * 100 : 100;

  return (
    <div className="flex flex-col h-full">
      {/* Reading progress bar */}
      <div className="h-0.5 bg-parchment-200/60 flex-shrink-0">
        <motion.div
          className="h-full bg-ember-400/70"
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Content area */}
      <div className={cn("flex-1 min-h-0 flex justify-center overflow-hidden px-4 sm:px-8", immersive ? "py-4 sm:py-7" : "py-7")}>
        <div
          className="w-full flex min-h-0"
          style={{ maxWidth: immersive ? 1440 : WIDTH_PX[settings.width] }}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentPage}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className={cn("relative flex min-h-0 w-full flex-col overflow-hidden border border-parchment-200/80 bg-parchment-50/80 shadow-warm-xl", immersive ? "rounded-[22px]" : "rounded-[28px]")}
            >
              {page.isCover ? (
                <CoverPageContent page={page} immersive={immersive} />
              ) : (
                <>
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-parchment-200/70 px-6 py-4 sm:px-10">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-ember-600">
                        Chapter {page.chapterNumber}
                      </p>
                      <p className="mt-0.5 truncate font-serif text-sm font-semibold text-ink-400">
                        {page.chapterTitle}
                      </p>
                    </div>
                    <div className="rounded-full bg-parchment-200/70 px-3 py-1 text-xs font-medium text-ink-300">
                      {currentPage + 1} / {pages.length}
                    </div>
                  </div>
                  <div
                    ref={scrollerRef}
                    className="min-h-0 flex-1 overflow-y-auto px-6 py-9 sm:px-12 sm:py-12"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {page.isChapterStart && (
                      <div className="mb-8">
                        <p className="text-xs font-medium text-ember-500 uppercase tracking-widest mb-2">
                          Chapter {page.chapterNumber}
                        </p>
                        <h2 className="font-serif text-3xl sm:text-4xl font-bold text-ink-500 leading-tight">
                          {page.chapterTitle}
                        </h2>
                        <div className="h-px w-12 bg-ember-300 mt-5" />
                      </div>
                    )}

                    <div
                      className="prose-book"
                      style={{
                        columnCount: settings.columns === 1 ? 1 : undefined,
                        columnWidth: settings.columns === 2 ? "24rem" : undefined,
                        columnGap: settings.columns === 2 ? "4.5rem" : undefined,
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: 1.9,
                      }}
                    >
                      {page.paragraphs.map((para, i) => (
                        <p key={i} className={!page.isChapterStart && i === 0 ? "mt-0" : ""}>
                          {para}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-parchment-50/95 to-transparent" />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation bar */}
      <div className="flex-shrink-0 border-t border-parchment-200/70 bg-parchment-50/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-6 py-4">
          <button
            onClick={() => go(-1)}
            disabled={currentPage === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              currentPage === 0
                ? "text-ink-200 cursor-not-allowed"
                : "text-ink-400 hover:text-ink-500 hover:bg-parchment-200/60"
            )}
          >
            <ArrowLeft size={14} />
            Previous
          </button>

          <div className="text-center">
            <div className="text-xs text-ink-300 font-medium">
              Page {currentPage + 1} <span className="text-ink-200">of</span> {pages.length}
            </div>
            <div className="text-xs text-ink-200 mt-0.5">
              {page.chapterTitle}
            </div>
          </div>

          <button
            onClick={() => go(1)}
            disabled={currentPage === pages.length - 1}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              currentPage === pages.length - 1
                ? "text-ink-200 cursor-not-allowed"
                : "text-ink-400 hover:text-ink-500 hover:bg-parchment-200/60"
            )}
          >
            Next
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Book (3D Flip) Reader ────────────────────────────────────
type FlipState = "idle" | "flipping-forward" | "flipping-back";

function BookReader({
  pages,
  currentPage,
  onNavigate,
  immersive = false,
}: {
  pages: Page[];
  currentPage: number;
  onNavigate: (n: number) => void;
  immersive?: boolean;
}) {
  // In book mode we show 2 pages at a time (spread). Page 0 is the cover.
  // spreadLeft = currentPage (even), spreadRight = currentPage + 1
  // We snap currentPage to even always
  const spreadLeft = currentPage % 2 === 0 ? currentPage : currentPage - 1;
  const spreadRight = spreadLeft + 1;

  const [flipState, setFlipState] = useState<FlipState>("idle");
  const [pendingSpread, setPendingSpread] = useState(spreadLeft);
  const flipRef = useRef<HTMLDivElement>(null);
  const wheelLockRef = useRef(false);

  // ── Bottom nav auto-hide (immersive only) ──────────────────
  const [bottomHovering, setBottomHovering] = useState(false);
  const bottomHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // In non-immersive the bar is always shown; in immersive it hides until hover
  const bottomVisible = !immersive || bottomHovering;

  const scheduleBottomHide = useCallback(() => {
    if (bottomHideTimer.current) clearTimeout(bottomHideTimer.current);
    bottomHideTimer.current = setTimeout(() => setBottomHovering(false), 260);
  }, []);
  const clearBottomHide = useCallback(() => {
    if (bottomHideTimer.current) { clearTimeout(bottomHideTimer.current); bottomHideTimer.current = null; }
  }, []);
  useEffect(() => () => { if (bottomHideTimer.current) clearTimeout(bottomHideTimer.current); }, []);

  const canGoForward = spreadRight < pages.length;
  const canGoBack = spreadLeft > 0;

  const navIdle = flipState === "idle";
  const canUseBack = canGoBack && navIdle;
  const canUseForward = canGoForward && navIdle;

  const bookSpreadNavButtonClass = (enabled: boolean) =>
    cn(
      "pointer-events-auto z-[35] flex h-[52px] w-[52px] sm:h-14 sm:w-14 items-center justify-center rounded-full border-2 shadow-xl transition duration-200",
      enabled
        ? "cursor-pointer border-ink-500/20 bg-parchment-50 text-ink-800 shadow-black/50 ring-2 ring-white/95 hover:bg-white hover:ring-ember-200/40 hover:scale-[1.04] active:scale-[0.98]"
        : "cursor-not-allowed border-ink-400/20 bg-ink-600/40 text-parchment-200/60 opacity-75"
    );

  const goForward = useCallback(() => {
    if (!canGoForward || flipState !== "idle") return;
    const next = spreadLeft + 2;
    setPendingSpread(next);
    setFlipState("flipping-forward");
  }, [canGoForward, flipState, spreadLeft]);

  const goBack = useCallback(() => {
    if (!canGoBack || flipState !== "idle") return;
    const prev = spreadLeft - 2;
    setPendingSpread(prev);
    setFlipState("flipping-back");
  }, [canGoBack, flipState, spreadLeft]);

  useEffect(() => {
    if (flipState === "idle") return;
    const id = setTimeout(() => {
      onNavigate(pendingSpread);
      setFlipState("idle");
    }, FLIP_DURATION_MS);
    return () => clearTimeout(id);
  }, [flipState, pendingSpread, onNavigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goForward();
      if (e.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goForward, goBack]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (Math.abs(event.deltaY) < 16 || wheelLockRef.current || flipState !== "idle") return;
      wheelLockRef.current = true;
      if (event.deltaY > 0) goForward();
      else goBack();
      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, FLIP_DURATION_MS + 80);
    },
    [flipState, goBack, goForward]
  );

  const leftPage = pages[spreadLeft];
  const rightPage = pages[spreadRight];
  // Pages that will be revealed after the flip
  const nextLeftPage = pages[pendingSpread];
  const nextRightPage = pages[pendingSpread + 1];

  return (
    <div
      onWheel={handleWheel}
      className={cn(
        "flex h-full select-none flex-col items-center justify-center bg-ink-500",
        immersive ? "overflow-hidden" : "overflow-y-hidden overflow-x-visible"
      )}
    >
      {/* Ambient light */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-parchment-100/5 blur-[64px]" />
      </div>

      {/* Permanent side-arrow buttons (immersive only — fixed to viewport edges) */}
      {immersive && (
        <>
          <button
            type="button"
            onClick={goBack}
            disabled={!canUseBack}
            aria-label="Previous pages"
            className={cn(
              "fixed left-3 top-1/2 z-[40] -translate-y-1/2 sm:left-5",
              bookSpreadNavButtonClass(canUseBack)
            )}
          >
            <ChevronLeft size={30} strokeWidth={2.75} className="drop-shadow" />
          </button>
          <button
            type="button"
            onClick={goForward}
            disabled={!canUseForward}
            aria-label="Next pages"
            className={cn(
              "fixed right-3 top-1/2 z-[40] -translate-y-1/2 sm:right-5",
              bookSpreadNavButtonClass(canUseForward)
            )}
          >
            <ChevronRight size={30} strokeWidth={2.75} className="drop-shadow" />
          </button>
        </>
      )}

      {/* Hotzone at bottom edge — reveals bottom nav on hover */}
      {immersive && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 h-14"
          onMouseEnter={() => { clearBottomHide(); setBottomHovering(true); }}
          onMouseLeave={scheduleBottomHide}
        />
      )}

      {/* Peek handle at bottom — visible when bottom nav is hidden */}
      {immersive && (
        <AnimatePresence>
          {!bottomVisible && (
            <motion.button
              type="button"
              key="bottom-peek"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => { clearBottomHide(); setBottomHovering(true); }}
              onClick={() => setBottomHovering(true)}
              aria-label="Reveal navigation"
              className="fixed bottom-2 left-1/2 z-40 -translate-x-1/2 cursor-pointer rounded-full px-3 py-1 backdrop-blur-md bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
            >
              <span className="block h-[3px] w-10 rounded-full bg-parchment-200/80" />
            </motion.button>
          )}
        </AnimatePresence>
      )}

      {/* Book spread */}
      <div
        className="relative flex items-center justify-center"
        style={{ perspective: "2000px", perspectiveOrigin: "50% 50%" }}
      >
        <div
          className="relative flex"
          style={{
            width: immersive ? "min(1480px, 96vw)" : "min(820px, 88vw)",
            height: immersive ? "min(960px, 97vh)" : "min(560px, 70vh)",
            filter: "drop-shadow(0 22px 46px rgba(0,0,0,0.46))",
            contain: "layout paint",
          }}
        >
          {/* Left page */}
          <div
            className="w-1/2 h-full overflow-hidden rounded-l-sm"
            style={{ background: "#F7F3EC", borderRight: "1px solid #DDD3C0" }}
          >
            <BookPageContent page={flipState === "flipping-back" ? nextLeftPage : leftPage} immersive={immersive} />
          </div>

          {/* Spine */}
          <div
            className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 z-10"
            style={{ width: "12px", background: "linear-gradient(to right, #C9BAA3, #EDE6D8, #DDD3C0, #EDE6D8, #C9BAA3)" }}
          />

          {/* Right page */}
          <div
            className="w-1/2 h-full overflow-hidden rounded-r-sm"
            style={{ background: "#FDFBF7", borderLeft: "1px solid #EDE6D8" }}
          >
            <BookPageContent page={flipState === "flipping-forward" ? nextRightPage : rightPage} immersive={immersive} />
          </div>

          {/* 3D Flip overlay */}
          {flipState === "flipping-forward" && (
            <div
              ref={flipRef}
              className="absolute top-0 right-0 w-1/2 h-full"
              style={{
                transformOrigin: "left center",
                transformStyle: "preserve-3d",
                animation: `bookFlipForward ${FLIP_DURATION_MS}ms cubic-bezier(0.18, 0.84, 0.24, 1) forwards`,
                zIndex: 20,
                willChange: "transform",
              }}
            >
              {/* Front face: outgoing right page */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  background: "#FDFBF7",
                  boxShadow: "inset -3px 0 8px rgba(0,0,0,0.08), 2px 0 6px rgba(0,0,0,0.12)",
                }}
              >
                <BookPageContent page={rightPage} immersive={immersive} />
              </div>
              {/* Back face: incoming left page */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  background: "#F7F3EC",
                  boxShadow: "inset 4px 0 12px rgba(0,0,0,0.08)",
                }}
              >
                <BookPageContent page={nextLeftPage} immersive={immersive} />
              </div>
            </div>
          )}

          {flipState === "flipping-back" && (
            <div
              className="absolute top-0 left-0 w-1/2 h-full"
              style={{
                transformOrigin: "right center",
                transformStyle: "preserve-3d",
                animation: `bookFlipBack ${FLIP_DURATION_MS}ms cubic-bezier(0.18, 0.84, 0.24, 1) forwards`,
                zIndex: 20,
                willChange: "transform",
              }}
            >
              {/* Front face: outgoing left page */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  background: "#F7F3EC",
                  boxShadow: "inset 4px 0 12px rgba(0,0,0,0.08)",
                }}
              >
                <BookPageContent page={leftPage} immersive={immersive} />
              </div>
              {/* Back face: incoming right page */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(-180deg)",
                  background: "#FDFBF7",
                  boxShadow: "inset -4px 0 12px rgba(0,0,0,0.08)",
                }}
              >
                <BookPageContent page={nextRightPage} immersive={immersive} />
              </div>
            </div>
          )}

          {/* Page-edge nav (non-immersive) — full buttons sit in the dark gutter, not on the page */}
          {!immersive && (
            <>
              <button
                type="button"
                onClick={goBack}
                disabled={!canUseBack}
                aria-label="Previous pages"
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full -ml-2.5",
                  bookSpreadNavButtonClass(canUseBack)
                )}
              >
                <ChevronLeft size={30} strokeWidth={2.75} className="drop-shadow" />
              </button>
              <button
                type="button"
                onClick={goForward}
                disabled={!canUseForward}
                aria-label="Next pages"
                className={cn(
                  "absolute right-0 top-1/2 -translate-y-1/2 translate-x-full mr-2.5",
                  bookSpreadNavButtonClass(canUseForward)
                )}
              >
                <ChevronRight size={30} strokeWidth={2.75} className="drop-shadow" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Book nav — fixed+auto-hide in immersive, static below spread otherwise */}
      {immersive ? (
        <motion.div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-4"
          initial={false}
          animate={{ y: bottomVisible ? 0 : 100, opacity: bottomVisible ? 1 : 0 }}
          transition={{ duration: bottomVisible ? 0.5 : 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="pointer-events-auto flex items-center gap-5 rounded-[24px] border border-white/10 bg-ink-500/66 px-5 py-2.5 backdrop-blur-xl"
            onMouseEnter={() => { clearBottomHide(); setBottomHovering(true); }}
            onMouseLeave={scheduleBottomHide}
          >
            <button
              onClick={goBack}
              disabled={!canGoBack || flipState !== "idle"}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                !canGoBack ? "text-parchment-400/30 cursor-not-allowed" : "cursor-pointer text-parchment-300 hover:text-parchment-100 hover:bg-white/10 hover:-translate-y-0.5 active:translate-y-0"
              )}
            >
              <ArrowLeft size={14} />
              Previous
            </button>

            <span className="text-xs text-parchment-400/60 font-mono tabular-nums select-none">
              {spreadLeft + 1}–{Math.min(spreadRight + 1, pages.length)} / {pages.length}
            </span>

            <button
              onClick={goForward}
              disabled={!canGoForward || flipState !== "idle"}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                !canGoForward ? "text-parchment-400/30 cursor-not-allowed" : "cursor-pointer text-parchment-300 hover:text-parchment-100 hover:bg-white/10 hover:-translate-y-0.5 active:translate-y-0"
              )}
            >
              Next
              <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="flex items-center gap-6 mt-8 z-10">
          <button
            onClick={goBack}
            disabled={!canGoBack || flipState !== "idle"}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all",
              !canGoBack ? "text-parchment-400/40 cursor-not-allowed" : "cursor-pointer text-parchment-300 hover:text-parchment-100 hover:bg-white/10 hover:-translate-y-0.5 active:translate-y-0"
            )}
          >
            <ArrowLeft size={14} />
            Previous
          </button>

          <span className="text-xs text-parchment-400/60 font-mono tabular-nums">
            {spreadLeft + 1}–{Math.min(spreadRight + 1, pages.length)} / {pages.length}
          </span>

          <button
            onClick={goForward}
            disabled={!canGoForward || flipState !== "idle"}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all",
              !canGoForward ? "text-parchment-400/40 cursor-not-allowed" : "cursor-pointer text-parchment-300 hover:text-parchment-100 hover:bg-white/10 hover:-translate-y-0.5 active:translate-y-0"
            )}
          >
            Next
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function BookPageContent({
  page,
  immersive = false,
}: {
  page?: Page;
  immersive?: boolean;
}) {
  if (!page) {
    return (
      <div className="w-full h-full flex items-center justify-center opacity-10">
        <BookOpen size={32} />
      </div>
    );
  }
  if (page.isCover) {
    return <CoverPageContent page={page} immersive={immersive} />;
  }
  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col"
      style={{
        padding: immersive ? "52px 48px 36px" : "32px 28px 24px",
      }}
    >
      {/* Chapter header */}
      {page.isChapterStart && (
        <div className={immersive ? "mb-7 flex-shrink-0" : "mb-5 flex-shrink-0"}>
          <p className={cn("font-medium text-ember-500 uppercase tracking-widest mb-1", immersive ? "text-[11px]" : "text-[9px]")}>
            Chapter {page.chapterNumber}
          </p>
          <h3 className={cn("font-serif font-bold text-ink-500 leading-tight", immersive ? "text-2xl" : "text-lg")}>
            {page.chapterTitle}
          </h3>
          <div className={cn("h-px bg-ember-300 mt-3", immersive ? "w-10" : "w-8")} />
        </div>
      )}

      {/* Running header (not chapter start) */}
      {!page.isChapterStart && (
        <div className="mb-4 flex-shrink-0 flex items-center justify-between">
          <span className={cn("text-ink-200 uppercase tracking-widest", immersive ? "text-[11px]" : "text-[9px]")}>
            {page.chapterTitle}
          </span>
          <span className={cn("text-ink-200 font-mono", immersive ? "text-[11px]" : "text-[9px]")}>{page.globalIndex + 1}</span>
        </div>
      )}

      {/* Prose */}
      <div className="flex-1 overflow-hidden">
        <div
          style={{
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontSize: immersive ? "15px" : "11.5px",
            lineHeight: immersive ? "1.9" : "1.85",
            color: "#2D2420",
            letterSpacing: "0.01em",
          }}
        >
          {page.paragraphs.map((para, i) => (
            <p
              key={i}
              style={{
                marginBottom: "0.9em",
              }}
            >
              {page.isChapterStart && i === 0 ? (
                <>
                  <span
                    style={{
                      fontSize: "2.8em",
                      fontWeight: 700,
                      float: "left",
                      lineHeight: 0.75,
                      marginRight: "0.07em",
                      marginTop: "0.08em",
                      color: "#C97D30",
                      fontFamily: "var(--font-playfair, Georgia, serif)",
                    }}
                  >
                    {para[0]}
                  </span>
                  {para.slice(1)}
                </>
              ) : (
                para
              )}
            </p>
          ))}
        </div>
      </div>

      {/* Page number footer */}
      <div className="flex-shrink-0 pt-3 border-t border-parchment-200/60 flex justify-center">
        <span className={cn("text-ink-200 font-serif italic", immersive ? "text-[11px]" : "text-[9px]")}>{page.globalIndex + 1}</span>
      </div>
    </div>
  );
}

function CoverPageContent({ page, immersive = false }: { page: Page; immersive?: boolean }) {
  const title = page.bookTitle ?? "Untitled Book";
  const gradient = `linear-gradient(160deg, ${page.coverFrom ?? "#1a1a2e"}, ${page.coverVia ?? "#16213e"} 52%, ${page.coverFrom ?? "#0f172a"})`;
  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-500 text-parchment-50">
      {page.coverImageUrl ? (
        <img
          src={page.coverImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading={page.globalIndex === 0 ? "eager" : "lazy"}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: gradient }}>
          <div
            className="absolute inset-0 opacity-35"
            style={{
              background: `radial-gradient(circle at 50% 38%, ${page.coverAccent ?? "#818cf8"}, transparent 62%)`,
            }}
          />
          <BookMarked
            size={immersive ? 92 : 58}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20"
          />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/62 via-black/18 to-black/72" />
      <div className="relative z-10 flex h-full flex-col justify-between p-7 sm:p-9">
        <div>
          <p className={cn("font-semibold uppercase tracking-[0.22em] text-parchment-200/75", immersive ? "text-[11px]" : "text-[9px]")}>
            {page.genre || "Folio original"}
          </p>
        </div>
        <div>
          <h2 className={cn("font-serif font-bold leading-[1.02] text-white drop-shadow", immersive ? "text-4xl" : "text-2xl")}>
            {title}
          </h2>
          {page.tone && (
            <p className={cn("mt-3 font-medium uppercase tracking-[0.18em] text-ember-200/85", immersive ? "text-[11px]" : "text-[9px]")}>
              {page.tone}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Reader ──────────────────────────────────────────────
// ─── Reader Shell Controls ─────────────────────────────────────

// Shared interaction utility
const TAP_CLASS = "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98]";

// Animated page selector (replaces native <select>)
function PageSelect({
  currentPage,
  pageCount,
  onNavigate,
  isBook,
  variant = "toolbar",
}: {
  currentPage: number;
  pageCount: number;
  onNavigate: (n: number) => void;
  isBook: boolean;
  variant?: "toolbar" | "immersive";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-page="${currentPage}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [open, currentPage]);

  const triggerBase =
    variant === "immersive"
      ? "h-10 rounded-2xl border px-3 text-sm font-semibold"
      : "rounded-2xl border px-3 py-2 text-sm";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          triggerBase,
          "inline-flex items-center gap-2 outline-none",
          TAP_CLASS,
          isBook
            ? "border-white/10 bg-white/8 text-parchment-100 hover:bg-white/14"
            : "border-parchment-300/70 bg-white/60 text-ink-500 hover:bg-white"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {variant === "toolbar" && (
          <span className={isBook ? "text-parchment-300 font-normal" : "text-ink-300 font-normal"}>Go to</span>
        )}
        <span className="font-semibold tabular-nums">Page {currentPage + 1}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown size={14} className={isBook ? "text-parchment-400" : "text-ink-300"} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute left-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border shadow-warm-xl backdrop-blur-xl",
              variant === "immersive" ? "top-full" : "top-full",
              isBook ? "border-white/10 bg-ink-500/96 text-parchment-100" : "border-parchment-200 bg-parchment-50/98 text-ink-500"
            )}
            role="listbox"
          >
            <div ref={listRef} className="max-h-64 overflow-y-auto py-1.5" style={{ scrollbarWidth: "thin" }}>
              {Array.from({ length: pageCount }, (_, i) => {
                const active = i === currentPage;
                return (
                  <button
                    key={i}
                    data-page={i}
                    onClick={() => {
                      onNavigate(i);
                      setOpen(false);
                    }}
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "block w-full cursor-pointer px-3.5 py-2 text-left text-sm tabular-nums transition-colors",
                      active
                        ? "bg-ember-500 text-white"
                        : isBook
                          ? "text-parchment-200 hover:bg-white/10"
                          : "text-ink-400 hover:bg-parchment-200/70"
                    )}
                  >
                    Page {i + 1}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Shared reading settings body (used in toolbar popup + immersive popup)
function ReadingSettingsBody({
  settings,
  setSettings,
  dark = false,
}: {
  settings: ReaderSettings;
  setSettings: Dispatch<SetStateAction<ReaderSettings>>;
  dark?: boolean;
}) {
  const updateSettings = (next: Partial<ReaderSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
  };

  const chipBase = "rounded-xl border text-sm font-medium capitalize transition-colors";
  const chipIdle = dark
    ? "border-white/10 bg-white/5 text-parchment-300 hover:border-ember-400/50 hover:bg-white/10 hover:text-parchment-100"
    : "border-parchment-300 bg-white/50 text-ink-300 hover:border-ember-300 hover:bg-white hover:text-ink-500";
  const chipActive = dark
    ? "border-ember-400/70 bg-ember-500/20 text-ember-200"
    : "border-ember-400 bg-ember-100 text-ember-700";

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Text size</span>
          <span className={dark ? "text-parchment-400 tabular-nums" : "text-ink-300 tabular-nums"}>{settings.fontSize}px</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateSettings({ fontSize: Math.max(15, settings.fontSize - 1) })}
            className={cn("inline-flex h-11 flex-1 items-center justify-center rounded-xl border", TAP_CLASS, chipIdle)}
            aria-label="Decrease font size"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => updateSettings({ fontSize: Math.min(22, settings.fontSize + 1) })}
            className={cn("inline-flex h-11 flex-1 items-center justify-center rounded-xl border", TAP_CLASS, chipIdle)}
            aria-label="Increase font size"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Page width</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(["narrow", "comfortable", "wide"] as ReaderWidth[]).map((width) => (
            <button
              key={width}
              onClick={() => updateSettings({ width })}
              className={cn("px-2 py-2.5 text-xs", chipBase, TAP_CLASS, settings.width === width ? chipActive : chipIdle)}
            >
              {width}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Layout</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updateSettings({ columns: 1 })}
            className={cn("inline-flex items-center justify-center gap-2 px-3 py-3", chipBase, TAP_CLASS, settings.columns === 1 ? chipActive : chipIdle)}
          >
            <AlignLeft size={16} /> Single
          </button>
          <button
            onClick={() => updateSettings({ columns: 2 })}
            className={cn("inline-flex items-center justify-center gap-2 px-3 py-3", chipBase, TAP_CLASS, settings.columns === 2 ? chipActive : chipIdle)}
          >
            <Columns2 size={16} /> Spread
          </button>
        </div>
      </div>
    </div>
  );
}

function ReaderToolbar({
  book,
  mode,
  setMode,
  currentPage,
  pageCount,
  progress,
  onNavigate,
  settings,
  setSettings,
  showSettings,
  setShowSettings,
  immersive,
  setImmersive,
  bookmarked,
  setBookmarked,
  onExport,
  onRegenerateCover,
  coverBusy,
  backHref,
  backLabel,
}: {
  book: Book;
  mode: ReaderMode;
  setMode: Dispatch<SetStateAction<ReaderMode>>;
  currentPage: number;
  pageCount: number;
  progress: number;
  onNavigate: (n: number) => void;
  settings: ReaderSettings;
  setSettings: Dispatch<SetStateAction<ReaderSettings>>;
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  immersive: boolean;
  setImmersive: Dispatch<SetStateAction<boolean>>;
  bookmarked: boolean;
  setBookmarked: Dispatch<SetStateAction<boolean>>;
  onExport: () => void;
  onRegenerateCover?: () => void;
  coverBusy?: boolean;
  backHref: string;
  backLabel: string;
}) {
  const isBook = mode === "book";
  const tapClass = TAP_CLASS;
  const { user: accountUser } = useAuthUser();

  return (
    <header className={cn("relative z-40 flex h-[76px] flex-shrink-0 items-center border-b px-3 backdrop-blur-xl sm:px-5", isBook ? "border-white/10 bg-ink-500/92 text-parchment-100" : "border-parchment-200/80 bg-parchment-50/88 text-ink-500")}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href={backHref} className={cn("hidden rounded-2xl border px-4 py-2.5 text-sm font-medium sm:inline-flex", tapClass, isBook ? "border-white/10 bg-white/5 text-parchment-200 hover:bg-white/10" : "border-parchment-300/70 bg-parchment-100/70 text-ink-400 hover:bg-parchment-200/70")}>
          {backLabel}
        </Link>

        <Link href={backHref} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", tapClass, isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70")} aria-label={`Back to ${backLabel.toLowerCase()}`}>
          <ChevronLeft size={22} />
        </Link>

        <button onClick={() => onNavigate(0)} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", tapClass, isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70")} aria-label="Restart book">
          <RotateCcw size={19} />
        </button>

        <div className={cn("mx-2 hidden h-8 w-px sm:block", isBook ? "bg-white/10" : "bg-parchment-300/80")} />

        <div className="hidden md:block">
          <PageSelect currentPage={currentPage} pageCount={pageCount} onNavigate={onNavigate} isBook={isBook} variant="toolbar" />
        </div>

        <div className="min-w-0 px-2">
          <p className={cn("truncate font-serif text-base font-semibold", isBook ? "text-parchment-50" : "text-ink-500")}>{book.title}</p>
          <p className={cn("hidden truncate text-xs sm:block", isBook ? "text-parchment-400" : "text-ink-300")}>Page {currentPage + 1} of {pageCount} · {book.genre}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className={cn("hidden rounded-2xl border p-1 md:flex", isBook ? "border-white/10 bg-white/5" : "border-parchment-300/70 bg-parchment-100/70")}>
          <button onClick={() => setMode("kindle")} className={cn("inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium", tapClass, mode === "kindle" ? "bg-ember-500 text-white shadow-ember" : isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-white/70")}>
            <AlignLeft size={16} /> Read
          </button>
          <button onClick={() => setMode("book")} className={cn("inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium", tapClass, mode === "book" ? "bg-ember-500 text-white shadow-ember" : isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-white/70")}>
            <BookOpen size={16} /> Book
          </button>
        </div>

        <div className="relative">
          <button onClick={() => setShowSettings((value) => !value)} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", tapClass, showSettings ? "bg-ember-500 text-white shadow-ember" : isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70")} aria-label="Reading settings">
            <Type size={20} />
          </button>

          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "absolute right-0 top-14 w-[360px] rounded-[28px] border p-5 shadow-warm-xl",
                  isBook ? "border-white/10 bg-ink-500/96 text-parchment-100 backdrop-blur-xl" : "border-parchment-200 bg-parchment-50 text-ink-500"
                )}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ember-500">Reading</p>
                    <p className={cn("mt-0.5 text-sm", isBook ? "text-parchment-300" : "text-ink-300")}>Tune the view</p>
                  </div>
                  <button
                    onClick={() => setShowSettings(false)}
                    className={cn(
                      "flex-shrink-0 rounded-xl p-2",
                      TAP_CLASS,
                      isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70"
                    )}
                    aria-label="Close settings"
                  >
                    <X size={16} />
                  </button>
                </div>
                <ReadingSettingsBody settings={settings} setSettings={setSettings} dark={isBook} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={() => { setShowSettings(false); setImmersive((value) => !value); }} className={cn("hidden h-11 w-11 items-center justify-center rounded-2xl sm:inline-flex", tapClass, immersive ? "bg-ember-500 text-white shadow-ember" : isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70")} aria-label={immersive ? "Exit full page reading" : "Enter full page reading"}>
          {immersive ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </button>

        <button onClick={() => setBookmarked((value) => !value)} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", tapClass, bookmarked ? "bg-ember-500 text-white shadow-ember" : isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70")} aria-label="Bookmark this page">
          <Bookmark size={19} fill={bookmarked ? "currentColor" : "none"} />
        </button>

        {onRegenerateCover && (
          <button
            onClick={onRegenerateCover}
            disabled={coverBusy}
            className={cn(
              "hidden h-11 w-11 items-center justify-center rounded-2xl sm:inline-flex",
              tapClass,
              coverBusy ? "cursor-not-allowed opacity-50" : "",
              isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70"
            )}
            aria-label="Regenerate cover"
            title={coverBusy ? "Regenerating cover" : "Regenerate cover"}
          >
            <RotateCcw size={18} />
          </button>
        )}

        <button onClick={onExport} className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", tapClass, isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70")} aria-label="Export book">
          <Download size={19} />
        </button>

        <AccountMenu user={accountUser} variant={isBook ? "dark" : "light"} />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
        <motion.div className="h-full bg-ember-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
      </div>
    </header>
  );
}

function ReaderRail({
  mode,
  showContents,
  showSearch,
  setShowContents,
  setShowSearch,
}: {
  mode: ReaderMode;
  showContents: boolean;
  showSearch: boolean;
  setShowContents: Dispatch<SetStateAction<boolean>>;
  setShowSearch: Dispatch<SetStateAction<boolean>>;
}) {
  const isBook = mode === "book";
  const toggleContents = () => {
    setShowSearch(false);
    setShowContents((value) => !value);
  };
  const toggleSearch = () => {
    setShowContents(false);
    setShowSearch((value) => !value);
  };

  return (
    <aside className={cn("z-30 hidden w-16 flex-shrink-0 flex-col items-center gap-3 border-r px-2 py-5 sm:flex", isBook ? "border-white/10 bg-ink-500 text-parchment-300" : "border-parchment-200/80 bg-parchment-50/55 text-ink-300")}>
      <button onClick={toggleContents} className={cn("inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]", showContents ? "bg-ember-500 text-white shadow-ember" : isBook ? "hover:bg-white/10" : "hover:bg-parchment-200/70")} aria-label="Open contents">
        <List size={21} />
      </button>
      <button onClick={toggleSearch} className={cn("inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]", showSearch ? "bg-ember-500 text-white shadow-ember" : isBook ? "hover:bg-white/10" : "hover:bg-parchment-200/70")} aria-label="Search book">
        <Search size={21} />
      </button>
      <div className={cn("mt-auto rounded-full border p-2", isBook ? "border-white/10 text-parchment-500" : "border-parchment-300/70 text-ink-200")}>
        <BookMarked size={18} />
      </div>
    </aside>
  );
}

function ImmersiveReaderControls({
  book,
  mode,
  setMode,
  currentPage,
  pageCount,
  progress,
  onNavigate,
  onExit,
  settings,
  setSettings,
}: {
  book: Book;
  mode: ReaderMode;
  setMode: Dispatch<SetStateAction<ReaderMode>>;
  currentPage: number;
  pageCount: number;
  progress: number;
  onNavigate: (n: number) => void;
  onExit: () => void;
  settings: ReaderSettings;
  setSettings: Dispatch<SetStateAction<ReaderSettings>>;
}) {
  const isBook = mode === "book";
  const { user: accountUser } = useAuthUser();
  const [showSettings, setShowSettings] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = pinned || hovering || showSettings;

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHovering(false), 260);
  }, []);

  const clearHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const buttonClass = cn(
    "inline-flex h-10 items-center justify-center rounded-2xl border px-3 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer",
    isBook
      ? "border-white/10 bg-white/8 text-parchment-200 shadow-black/20 hover:bg-white/14"
      : "border-parchment-300/70 bg-parchment-50/90 text-ink-400 shadow-warm-lg hover:bg-white"
  );

  return (
    <>
      {/* Invisible hover hot-zone at top of viewport - reveals toolbar */}
      <div
        className="fixed inset-x-0 top-0 z-40 h-14"
        onMouseEnter={() => {
          clearHide();
          setHovering(true);
        }}
        onMouseLeave={scheduleHide}
      />

      {/* Peek handle — stays visible when the toolbar is tucked away, signals it can be summoned */}
      <AnimatePresence>
        {!visible && (
          <motion.button
            type="button"
            key="peek-handle"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => {
              clearHide();
              setHovering(true);
            }}
            onClick={() => setPinned(true)}
            aria-label="Reveal toolbar"
            title="Hover to reveal · click to pin"
            className={cn(
              "pointer-events-auto fixed left-1/2 top-2 z-40 -translate-x-1/2 cursor-pointer rounded-full px-3 py-1 backdrop-blur-md transition-colors",
              isBook
                ? "bg-white/10 hover:bg-white/20 border border-white/15"
                : "bg-ink-500/15 hover:bg-ink-500/25 border border-ink-500/15"
            )}
          >
            <span
              className={cn(
                "block h-[3px] w-10 rounded-full",
                isBook ? "bg-parchment-200/80" : "bg-ink-400/60"
              )}
            />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
        initial={false}
        animate={{ y: visible ? 0 : -110, opacity: visible ? 1 : 0 }}
        transition={{
          duration: visible ? 0.5 : 0.3,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <div
          onMouseEnter={() => {
            clearHide();
            setHovering(true);
          }}
          onMouseLeave={scheduleHide}
          className={cn("pointer-events-auto flex max-w-[min(1180px,calc(100vw-2rem))] items-center gap-2 rounded-[24px] border px-3 py-2 backdrop-blur-xl", isBook ? "border-white/10 bg-ink-500/66" : "border-parchment-200/80 bg-parchment-50/80")}
        >
        <div className="hidden min-w-0 px-2 sm:block">
          <p className={cn("truncate font-serif text-sm font-semibold", isBook ? "text-parchment-50" : "text-ink-500")}>{book.title}</p>
          <p className={cn("text-[11px]", isBook ? "text-parchment-400" : "text-ink-300")}>Page {currentPage + 1} of {pageCount}</p>
        </div>

        <button onClick={() => onNavigate(Math.max(0, currentPage - 1))} className={buttonClass} aria-label="Previous page">
          <ArrowLeft size={15} />
        </button>

        <PageSelect currentPage={currentPage} pageCount={pageCount} onNavigate={onNavigate} isBook={isBook} variant="immersive" />

        <button onClick={() => onNavigate(Math.min(pageCount - 1, currentPage + 1))} className={buttonClass} aria-label="Next page">
          <ArrowRight size={15} />
        </button>

        <div className={cn("mx-1 hidden h-7 w-px sm:block", isBook ? "bg-white/10" : "bg-parchment-300/70")} />

        <div className="relative">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={cn(
              buttonClass,
              showSettings && "!bg-ember-500 !text-white !border-transparent shadow-ember"
            )}
            aria-label="Reading settings"
          >
            <Type size={16} />
          </button>
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "absolute right-0 top-12 w-[360px] rounded-[28px] border p-5 shadow-warm-xl z-50 backdrop-blur-xl",
                  isBook ? "border-white/10 bg-ink-500/96 text-parchment-100" : "border-parchment-200 bg-parchment-50/98 text-ink-500"
                )}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ember-500">Reading</p>
                    <p className={cn("mt-0.5 text-sm", isBook ? "text-parchment-300" : "text-ink-300")}>Tune the view</p>
                  </div>
                  <button
                    onClick={() => setShowSettings(false)}
                    className={cn(
                      "flex-shrink-0 rounded-xl p-2",
                      TAP_CLASS,
                      isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70"
                    )}
                    aria-label="Close settings"
                  >
                    <X size={16} />
                  </button>
                </div>
                <ReadingSettingsBody settings={settings} setSettings={setSettings} dark={isBook} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={() => setMode(mode === "kindle" ? "book" : "kindle")} className={buttonClass}>
          {mode === "kindle" ? <BookOpen size={16} /> : <AlignLeft size={16} />}
          <span className="ml-2 hidden sm:inline">{mode === "kindle" ? "Book" : "Read"}</span>
        </button>

        <button
          onClick={() => setPinned((v) => !v)}
          className={cn(
            buttonClass,
            pinned && "!bg-ember-500 !text-white !border-transparent shadow-ember"
          )}
          aria-label={pinned ? "Unpin toolbar" : "Pin toolbar"}
          title={pinned ? "Unpin toolbar" : "Pin toolbar"}
        >
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>

        <button onClick={onExit} className={buttonClass} aria-label="Exit full page reading">
          <Minimize2 size={16} />
          <span className="ml-2 hidden sm:inline">Exit</span>
        </button>

        <AccountMenu user={accountUser} variant={isBook ? "dark" : "light"} />

        <div className="absolute inset-x-6 bottom-0 h-0.5 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full bg-ember-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
        </div>
        </div>
      </motion.div>
    </>
  );
}

function ReaderPanel({
  showContents,
  book,
  chapterStarts,
  currentPage,
  searchQuery,
  setSearchQuery,
  searchResults,
  onNavigate,
  onClose,
  mode,
}: {
  showContents: boolean;
  book: Book;
  chapterStarts: Array<{ chapter: Chapter; pageIndex: number }>;
  currentPage: number;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  searchResults: Array<{ page: Page; index: number; text: string }>;
  onNavigate: (pageIndex: number) => void;
  onClose: () => void;
  mode: ReaderMode;
}) {
  const isBook = mode === "book";
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 340, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "z-20 hidden min-h-0 flex-shrink-0 overflow-hidden border-r shadow-warm-lg backdrop-blur-xl lg:block",
        isBook ? "border-white/10 bg-ink-500/95" : "border-parchment-200/80 bg-parchment-50/92"
      )}
    >
      <div className="flex h-full w-[340px] flex-col">
        <div className={cn("flex flex-shrink-0 items-start justify-between border-b px-5 py-5", isBook ? "border-white/10" : "border-parchment-200/80")}>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ember-500">{showContents ? "Contents" : "Search"}</p>
            <h2 className={cn("mt-1 truncate font-serif text-xl font-bold", isBook ? "text-parchment-50" : "text-ink-500")}>{book.title}</h2>
          </div>
          <button
            onClick={onClose}
            className={cn("rounded-xl p-2", isBook ? "text-parchment-300 hover:bg-white/10" : "text-ink-300 hover:bg-parchment-200/70")}
            aria-label="Close panel"
          >
            <X size={17} />
          </button>
        </div>

        {showContents ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4" style={{ scrollbarWidth: "thin" }}>
            <div className="space-y-1">
              {chapterStarts.map(({ chapter, pageIndex }) => {
                const active = currentPage >= pageIndex;
                return (
                  <button
                    key={chapter.number}
                    onClick={() => onNavigate(pageIndex)}
                    className={cn(
                      "w-full cursor-pointer rounded-2xl px-3 py-3 text-left transition-colors",
                      active
                        ? isBook
                          ? "bg-white/10 text-parchment-50"
                          : "bg-ember-50 text-ink-500"
                        : isBook
                          ? "text-parchment-300 hover:bg-white/8 hover:text-parchment-100"
                          : "text-ink-300 hover:bg-parchment-200/70 hover:text-ink-500"
                    )}
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-ember-500">Chapter {chapter.number}</span>
                    <span className="mt-1 block truncate font-serif text-base font-semibold">{chapter.title}</span>
                    <span className={cn("mt-1 block text-xs", isBook ? "text-parchment-400" : "text-ink-300")}>Page {pageIndex + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-shrink-0 p-4">
              <label className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2.5", isBook ? "border-white/10 bg-white/5 text-parchment-300" : "border-parchment-300 bg-white/70 text-ink-400")}>
                <Search size={17} />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search this book"
                  className={cn(
                    "min-w-0 flex-1 bg-transparent text-sm outline-none",
                    isBook ? "text-parchment-100 placeholder:text-parchment-500" : "text-ink-500 placeholder:text-ink-200"
                  )}
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" style={{ scrollbarWidth: "thin" }}>
              {searchQuery.trim().length < 2 ? (
                <div className={cn("rounded-2xl border border-dashed p-5 text-sm leading-relaxed", isBook ? "border-white/15 text-parchment-400" : "border-parchment-300 text-ink-300")}>
                  Type at least two characters to find a phrase or scene.
                </div>
              ) : searchResults.length ? (
                <div className="space-y-2">
                  {searchResults.map(({ page, index, text }) => (
                    <button
                      key={index}
                      onClick={() => onNavigate(index)}
                      className={cn(
                        "w-full cursor-pointer rounded-2xl px-3 py-3 text-left transition-colors",
                        isBook
                          ? "text-parchment-300 hover:bg-white/8 hover:text-parchment-100"
                          : "text-ink-300 hover:bg-parchment-200/70 hover:text-ink-500"
                      )}
                    >
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-ember-500">Page {index + 1} · Chapter {page.chapterNumber}</span>
                      <span className="mt-1 line-clamp-3 block text-sm leading-relaxed">{text}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={cn("rounded-2xl border border-dashed p-5 text-sm", isBook ? "border-white/15 text-parchment-400" : "border-parchment-300 text-ink-300")}>
                  No matches found.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

function ReaderInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");
  const sampleId = searchParams.get("sample");
  const libraryNav = searchParams.get("library") === "1";

  const staticExample = useMemo(() => {
    if (projectId) return undefined;
    if (!sampleId) return undefined;
    if (sampleId === sampleBook.id) return sampleBook;
    return getExtraExampleBookById(sampleId);
  }, [projectId, sampleId]);

  const invalidSample = Boolean(
    !projectId && sampleId && !staticExample
  );

  const [loadedBook, setLoadedBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(!!projectId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const backHref = projectId
    ? "/dashboard"
    : libraryNav && sampleId
      ? "/dashboard"
      : "/";
  const backLabel =
    projectId || (libraryNav && sampleId) ? "Library" : "Home";

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/project/${projectId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: ApiProject = await r.json();
        if (!cancelled) { setLoadedBook(projectToBook(data)); setLoading(false); }
      })
      .catch((err) => {
        if (!cancelled) { setLoadError(err instanceof Error ? err.message : String(err)); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [projectId]);

  const regenerateCover = useCallback(async () => {
    if (!projectId || coverBusy) return;
    setCoverBusy(true);
    try {
      const res = await fetch(`/api/project/${projectId}/cover/regenerate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      await fetch("/api/jobs/run", { method: "POST" }).catch(() => undefined);

      let attempts = 0;
      const poll = async (): Promise<void> => {
        attempts += 1;
        const r = await fetch(`/api/project/${projectId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: ApiProject = await r.json();
        setLoadedBook(projectToBook(data));
        if (data.coverStatus === "failed") {
          throw new Error(data.coverError ?? "Cover generation failed");
        }
        if ((data.coverStatus === "pending" || data.coverStatus === "generating") && attempts < 120) {
          if (data.coverStatus === "pending" || attempts % 4 === 0) {
            fetch("/api/jobs/run", { method: "POST" }).catch(() => undefined);
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return poll();
        }
      };
      await poll();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setCoverBusy(false);
    }
  }, [coverBusy, projectId]);

  // Scrub em dashes from ALL rendered prose (sample book + agent-generated).
  // Agent output is already cleaned server-side; this also covers the demo book
  // and guarantees the user never sees a dash in the reader, ever.
  const rawBook: Book = useMemo(() => {
    if (projectId) return loadedBook ?? sampleBook;
    return staticExample ?? sampleBook;
  }, [projectId, loadedBook, staticExample]);
  const book = useMemo<Book>(() => ({
    ...rawBook,
    title: stripEmDashes(rawBook.title) || rawBook.title,
    synopsis: stripEmDashes(rawBook.synopsis),
    chapters: rawBook.chapters.map((ch) => ({
      ...ch,
      title: stripEmDashes(ch.title) || ch.title,
      content: stripEmDashes(ch.content),
    })),
  }), [rawBook]);

  const [currentPage, setCurrentPage] = useState(0);
  const [mode, setMode] = useState<ReaderMode>("kindle");
  const [isImmersive, setIsImmersive] = useState(false);

  // Each rendering mode needs its own pagination because the available area per
  // page is very different (kindle = wide single page; book = narrow half of a
  // spread; immersive book = larger half of a spread). Using one pagination
  // causes content to overflow and get clipped, so text appears to skip.
  const kindlePages = useMemo(() => paginateBook(book, WORDS_PER_PAGE), [book]);
  const bookPages = useMeasuredBookPages(book, isImmersive, mode === "book");
  const pages = mode === "kindle" ? kindlePages : bookPages;
  const chapterStarts = useMemo(() => {
    return book.chapters.map((chapter) => ({
      chapter,
      pageIndex: Math.max(0, pages.findIndex((page) => page.chapterNumber === chapter.number)),
    }));
  }, [book.chapters, pages]);

  // When pagination changes (mode switch, or immersive toggle inside book mode),
  // remap currentPage proportionally so the reader stays at roughly the same
  // place in the book instead of jumping to the start or past the end.
  const prevPagesLenRef = useRef(pages.length);
  useEffect(() => {
    const prev = prevPagesLenRef.current;
    if (prev !== pages.length && prev > 0) {
      setCurrentPage((cp) => {
        const fraction = cp / Math.max(1, prev - 1);
        const next = Math.round(fraction * Math.max(0, pages.length - 1));
        return Math.max(0, Math.min(next, pages.length - 1));
      });
    }
    prevPagesLenRef.current = pages.length;
  }, [pages.length]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showContents, setShowContents] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [kindleFormat, setKindleFormat] = useState<ExportFormat>("epub");
  const [kindleEmail, setKindleEmail] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>({
    columns: 2,
    fontSize: 18,
    width: "comfortable",
  });

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return pages
      .map((page, index) => ({
        page,
        index,
        text: page.paragraphs.join(" "),
      }))
      .filter(({ text }) => text.toLowerCase().includes(query))
      .slice(0, 12);
  }, [pages, searchQuery]);

  // Sync kindle page → book spread (snap to even)
  const handleNavigate = useCallback((n: number) => {
    setCurrentPage(Math.max(0, Math.min(n, pages.length - 1)));
  }, [pages.length]);

  const downloadFromResponse = useCallback(async (response: Response) => {
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? "folio-export";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const runExport = useCallback(async (mode: "download" | "kindle") => {
    setExportError(null);
    setExportMessage(null);
    const format = mode === "kindle" ? kindleFormat : exportFormat;

    setExportBusy(true);
    try {
      const response = await fetch("/api/book/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          format,
          kindleEmail: kindleEmail.trim(),
          book: {
            title: book.title,
            author: "Folio",
            synopsis: book.synopsis,
            coverImageUrl: book.coverImageUrl,
            chapters: book.chapters.map((chapter) => ({
              number: chapter.number,
              title: chapter.title,
              content: chapter.content,
            })),
          },
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${response.status}`);
      }
      await downloadFromResponse(response);
      setExportMessage(
        mode === "kindle"
          ? "Kindle email file downloaded. Open it in your mail app and send it to deliver the attachment."
          : `${format.toUpperCase()} export downloaded.`
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportBusy(false);
    }
  }, [book.chapters, book.coverImageUrl, book.synopsis, book.title, downloadFromResponse, exportFormat, kindleEmail, kindleFormat]);

  const currentProgress = pages.length > 1 ? Math.round((currentPage / (pages.length - 1)) * 100) : 100;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-parchment-100">
        <div className="text-ink-300 text-sm">Loading your book…</div>
      </div>
    );
  }
  const blockError = loadError || (invalidSample ? "We couldn’t find that example book." : null);
  if (blockError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-parchment-100 gap-4">
        <p className="text-ink-400">Couldn&apos;t load that book: {blockError}</p>
        <Link href={backHref} className="text-ember-600 underline text-sm">Back to {backLabel === "Home" ? "home" : "library"}</Link>
      </div>
    );
  }

  return (
    <>
      {/* Flip keyframes injected once */}
      <style>{`
        @keyframes bookFlipForward {
          0%   { transform: translateZ(0) rotateY(0deg); }
          42%  { transform: translateZ(10px) rotateY(-88deg); }
          100% { transform: translateZ(0) rotateY(-180deg); }
        }
        @keyframes bookFlipBack {
          0%   { transform: translateZ(0) rotateY(0deg); }
          42%  { transform: translateZ(10px) rotateY(88deg); }
          100% { transform: translateZ(0) rotateY(180deg); }
        }
      `}</style>

      <div className={cn("h-screen flex flex-col overflow-hidden", mode === "book" ? "bg-ink-500" : "bg-parchment-100")}>
        {!isImmersive && (
          <ReaderToolbar
            book={book}
            mode={mode}
            setMode={setMode}
            currentPage={currentPage}
            pageCount={pages.length}
            progress={currentProgress}
            onNavigate={handleNavigate}
            settings={settings}
            setSettings={setSettings}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            immersive={isImmersive}
            setImmersive={setIsImmersive}
            bookmarked={bookmarked}
            setBookmarked={setBookmarked}
            onExport={() => setShowUpgradeModal(true)}
            onRegenerateCover={projectId ? regenerateCover : undefined}
            coverBusy={coverBusy}
            backHref={backHref}
            backLabel={backLabel}
          />
        )}

        {isImmersive && (
          <ImmersiveReaderControls
            book={book}
            mode={mode}
            setMode={setMode}
            currentPage={currentPage}
            pageCount={pages.length}
            progress={currentProgress}
            onNavigate={handleNavigate}
            onExit={() => setIsImmersive(false)}
            settings={settings}
            setSettings={setSettings}
          />
        )}

        <div className="flex min-h-0 flex-1">
          {!isImmersive && (
            <ReaderRail
              mode={mode}
              showContents={showContents}
              showSearch={showSearch}
              setShowContents={setShowContents}
              setShowSearch={setShowSearch}
            />
          )}

          <AnimatePresence initial={false}>
            {!isImmersive && (showContents || showSearch) && (
              <ReaderPanel
                key={showContents ? "contents" : "search"}
                showContents={showContents}
                book={book}
                chapterStarts={chapterStarts}
                currentPage={currentPage}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchResults={searchResults}
                onNavigate={(pageIndex) => {
                  handleNavigate(pageIndex);
                  if (window.innerWidth < 900) {
                    setShowContents(false);
                    setShowSearch(false);
                  }
                }}
                onClose={() => {
                  setShowContents(false);
                  setShowSearch(false);
                }}
                mode={mode}
              />
            )}
          </AnimatePresence>

          <div
            className={cn(
              "min-w-0 flex-1",
              /* Book mode nav buttons sit in the margin; overflow-x hidden would clip them */
              mode === "book" ? "overflow-x-visible overflow-y-hidden" : "overflow-hidden"
            )}
          >
          <AnimatePresence mode="wait">
            {mode === "kindle" ? (
              <motion.div
                key="kindle"
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <KindleReader
                  pages={pages}
                  currentPage={currentPage}
                  onNavigate={handleNavigate}
                  settings={settings}
                  immersive={isImmersive}
                />
              </motion.div>
            ) : (
              <motion.div
                key="book"
                className="h-full relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <BookReader
                  pages={pages}
                  currentPage={currentPage % 2 === 0 ? currentPage : currentPage - 1}
                  onNavigate={handleNavigate}
                  immersive={isImmersive}
                />
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Export modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink-500/40 backdrop-blur-sm z-50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowUpgradeModal(false)}
            />
            <motion.div
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 px-4"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="glass-card relative rounded-[2rem] p-5 sm:p-6">
                <button
                  onClick={() => {
                    setShowUpgradeModal(false);
                    setExportError(null);
                    setExportMessage(null);
                  }}
                  className="absolute right-4 top-4 rounded-lg p-2 text-ink-200 hover:bg-parchment-200/60 hover:text-ink-400"
                >
                  <X size={16} />
                </button>
                <div className="mb-5 flex items-start gap-4 pr-9">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-ember-200 bg-ember-100">
                    <Download size={20} className="text-ember-600" />
                  </div>
                  <div>
                    <h2 className="font-serif text-2xl font-bold text-ink-500">Export your book</h2>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-300">
                      Create a manuscript-style PDF, an EPUB, or a Kindle email package for the book currently open in the reader.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-3xl border border-parchment-300/70 bg-white/75 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
                      Direct download
                    </p>
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      {(["pdf", "epub"] as ExportFormat[]).map((format) => (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setExportFormat(format)}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-sm font-medium uppercase transition",
                            exportFormat === format
                              ? "border-ember-300 bg-ember-100 text-ember-700"
                              : "border-parchment-300 bg-white text-ink-300 hover:text-ink-500"
                          )}
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => runExport("download")}
                      disabled={exportBusy}
                      className="w-full rounded-xl bg-ink-500 py-3 text-sm font-medium text-parchment-50 shadow-warm transition-all hover:bg-ink-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {exportBusy ? "Preparing..." : `Download ${exportFormat.toUpperCase()}`}
                    </button>
                  </div>

                  <div className="rounded-3xl border border-parchment-300/70 bg-parchment-50/85 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
                        Kindle
                      </p>
                      <div className="flex rounded-xl border border-parchment-300 bg-white p-1">
                        {(["epub", "pdf"] as ExportFormat[]).map((format) => (
                          <button
                            key={format}
                            type="button"
                            onClick={() => setKindleFormat(format)}
                            className={cn(
                              "rounded-lg px-3 py-1.5 text-xs font-medium uppercase transition",
                              kindleFormat === format
                                ? "bg-ember-100 text-ember-700"
                                : "text-ink-300 hover:text-ink-500"
                            )}
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      value={kindleEmail}
                      onChange={(event) => setKindleEmail(event.target.value)}
                      placeholder="your-name@kindle.com"
                      className="mb-3 w-full rounded-xl border border-parchment-300 bg-white px-3 py-2.5 text-sm text-ink-500 outline-none transition focus:border-ember-300"
                    />
                    <button
                      onClick={() => runExport("kindle")}
                      disabled={exportBusy}
                      className="w-full rounded-xl bg-ember-500 py-3 text-sm font-medium text-white shadow-ember transition-all hover:bg-ember-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {exportBusy ? "Preparing..." : "Download email file"}
                    </button>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-300">
                      Downloads a ready-to-send .eml with the selected file attached.
                    </p>
                  </div>
                </div>

                {(exportError || exportMessage) && (
                  <p className={cn("mt-4 rounded-xl px-3 py-2 text-sm", exportError ? "bg-red-50 text-red-700" : "bg-sage-100 text-ink-400")}>
                    {exportError || exportMessage}
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-parchment-100">
        <div className="text-ink-300 text-sm">Loading…</div>
      </div>
    }>
      <ReaderInner />
    </Suspense>
  );
}
