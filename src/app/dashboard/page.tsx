"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Feather,
  FileText,
  Hash,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { dashboardBooks, type Book } from "@/lib/sampleData";
import { estimatePdfPagesFromChapters, estimatePdfPagesFromWordCount } from "@/lib/page-estimate";
import { cn } from "@/lib/utils";

const EXAMPLE_BOOK_IDS = new Set(dashboardBooks.map((b) => b.id));

type LibraryBook = Omit<Book, "chapters"> & { pdfPageCount?: number };

interface ApiProject {
  id: string;
  status:
    | "pending"
    | "queued"
    | "planning"
    | "awaiting_approval"
    | "writing"
    | "complete"
    | "failed"
    | "cancelled";
  totalWords: number;
  batches: Array<{
    batchNumber: number;
    chapterNumber?: number;
    chapterTitle?: string;
    prose: string;
    wordCount: number;
  }>;
  title?: string;
  synopsis?: string;
  createdAt: string;
  bible?: { chapters: Array<{ number: number; title: string }> };
  cover?: { imageUrl: string };
  input: { preferences: { genre: string; tone: string } };
}

const statusMeta: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  complete: {
    label: "Complete",
    color: "text-sage-600",
    bg: "bg-sage-100",
    icon: CheckCircle2,
  },
  draft: {
    label: "Draft",
    color: "text-dust-600",
    bg: "bg-dust-100",
    icon: Clock,
  },
  generating: {
    label: "Generating",
    color: "text-ember-600",
    bg: "bg-ember-100",
    icon: Zap,
  },
  stopped: {
    label: "Stopped",
    color: "text-dust-600",
    bg: "bg-dust-100",
    icon: Clock,
  },
};

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

function projectStatusToLibraryStatus(status: ApiProject["status"]): LibraryBook["status"] {
  if (status === "complete") return "complete";
  if (status === "cancelled") return "stopped";
  if (status === "writing" || status === "planning" || status === "pending" || status === "queued")
    return "generating";
  return "draft";
}

function shortPreviewText(text: string, maxChars = 360): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;

  const clipped = normalized.slice(0, maxChars);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?")
  );
  const end = sentenceEnd > maxChars * 0.45 ? sentenceEnd + 1 : clipped.lastIndexOf(" ");
  return `${clipped.slice(0, Math.max(0, end)).trim()}...`;
}

function projectToLibraryBook(project: ApiProject): LibraryBook {
  const palette = paletteForId(project.id);
  const chapterMap = new Map<number, { title: string; parts: string[] }>();
  for (const batch of project.batches) {
    const chapterNumber = batch.chapterNumber ?? batch.batchNumber;
    const chapter = chapterMap.get(chapterNumber) ?? {
      title: batch.chapterTitle || `Chapter ${chapterNumber}`,
      parts: [],
    };
    chapter.parts.push(batch.prose);
    chapterMap.set(chapterNumber, chapter);
  }
  const chaptersForEstimate = Array.from(chapterMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, chapter]) => ({
      title: chapter.title,
      content: chapter.parts.join("\n\n"),
    }));
  const fallbackChapterCount = project.bible?.chapters.length ?? 1;
  const pdfPageCount = chaptersForEstimate.length
    ? estimatePdfPagesFromChapters(chaptersForEstimate, { hasCover: Boolean(project.cover?.imageUrl) })
    : estimatePdfPagesFromWordCount(project.totalWords, {
        chapterCount: fallbackChapterCount,
        hasCover: Boolean(project.cover?.imageUrl),
      });

  return {
    id: project.id,
    title: project.title ?? project.bible?.chapters[0]?.title ?? "Untitled Book",
    genre: project.input.preferences.genre || "Fiction",
    tone: project.input.preferences.tone || "",
    synopsis: project.synopsis ?? "A Folio-generated book in progress.",
    wordCount: project.totalWords,
    chapterCount: project.bible?.chapters.length ?? 0,
    pdfPageCount,
    createdAt: new Date(project.createdAt).toLocaleDateString(),
    status: projectStatusToLibraryStatus(project.status),
    coverImageUrl: project.cover?.imageUrl,
    ...palette,
  };
}

export default function DashboardPage() {
  const [liveBooks, setLiveBooks] = useState<LibraryBook[]>([]);
  const [previewBook, setPreviewBook] = useState<LibraryBook | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then(async (r) => {
        if (!r.ok) return [];
        const projects = (await r.json()) as ApiProject[];
        return projects.map(projectToLibraryBook);
      })
      .then((books) => {
        if (!cancelled) setLiveBooks(books);
      })
      .catch(() => {
        if (!cancelled) setLiveBooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const onDoc = () => setOpenMenuId(null);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openMenuId]);

  const deleteLiveBook = useCallback(
    async (bookId: string) => {
      if (EXAMPLE_BOOK_IDS.has(bookId)) return;
      if (
        !window.confirm(
          "Remove this book from your library? This cannot be undone."
        )
      ) {
        return;
      }
      setOpenMenuId(null);
      setDeletingId(bookId);
      try {
        const r = await fetch(`/api/project/${bookId}`, { method: "DELETE" });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
        }
        setLiveBooks((prev) => prev.filter((b) => b.id !== bookId));
        setPreviewBook((p) => (p?.id === bookId ? null : p));
      } catch (e) {
        window.alert(
          e instanceof Error ? e.message : "Could not remove this book."
        );
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  const books = [
    ...dashboardBooks,
    ...liveBooks.filter((book) => !EXAMPLE_BOOK_IDS.has(book.id)),
  ];
  const libraryStats = [
    { label: "Books created", value: String(books.length), icon: BookOpen },
    {
      label: "Total words",
      value: `${(books.reduce((total, book) => total + book.wordCount, 0) / 1000).toFixed(1)}k`,
      icon: Edit3,
    },
    { label: "Illustrations", value: "0", icon: Wand2 },
  ];

  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-dust-100/40 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[350px] h-[350px] rounded-full bg-ember-100/30 blur-[80px]" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-24">
        {/* Header */}
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-ink-200 mb-1">Welcome back</p>
              <h1 className="font-serif text-3xl font-bold text-ink-500">
                Your Library
              </h1>
            </div>
            <Link
              href="/create"
              className="flex items-center gap-1.5 px-5 py-2.5 bg-ember-500 hover:bg-ember-600 text-white text-sm font-medium rounded-xl transition-all duration-150 shadow-ember hover:shadow-ember-lg hover:-translate-y-0.5"
            >
              <Plus size={15} />
              New Book
            </Link>
          </div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="grid grid-cols-3 gap-4 mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {libraryStats.map((s) => (
            <div
              key={s.label}
              className="glass-card rounded-2xl p-5 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-ember-100 border border-ember-200/60 flex items-center justify-center flex-shrink-0">
                <s.icon size={17} className="text-ember-600" />
              </div>
              <div>
                <p className="text-xl font-semibold text-ink-500 font-serif">{s.value}</p>
                <p className="text-xs text-ink-200">{s.label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Section header */}
        <motion.div
          className="flex items-center justify-between mb-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <h2 className="text-sm font-medium text-ink-300 uppercase tracking-wider">
            Recent books
          </h2>
          <button className="text-xs text-ink-200 hover:text-ink-400 transition-colors">
            Sort by date
          </button>
        </motion.div>

        {/* Book grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5 mb-8">
          {books.map((book, i) => {
            const status = statusMeta[book.status];
            const StatusIcon = status.icon;
            return (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.15 + i * 0.07,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewBook(book)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreviewBook(book);
                    }
                  }}
                  className="group glass-card rounded-2xl overflow-hidden flex hover:shadow-glass-lg transition-shadow duration-300 text-left w-full cursor-pointer"
                >
                  {/* Cover thumbnail */}
                  <div
                    className="w-24 flex-shrink-0 relative"
                    style={{
                      background: `linear-gradient(to bottom, ${book.coverFrom}, ${book.coverVia}, ${book.coverFrom})`,
                    }}
                  >
                    {book.coverImageUrl ? (
                      <img
                        src={book.coverImageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <>
                        <div
                          className="absolute inset-0 opacity-20"
                          style={{
                            background: `radial-gradient(circle at 50% 40%, ${book.coverAccent}, transparent 70%)`,
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <BookOpen
                            size={18}
                            style={{ color: book.coverAccent }}
                            className="opacity-40"
                          />
                        </div>
                      </>
                    )}
                    <div className="absolute left-0 top-0 bottom-0 w-1 opacity-10 bg-white" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 p-5 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-serif font-semibold text-ink-500 text-base leading-tight group-hover:text-ember-700 transition-colors">
                        {book.title}
                      </h3>
                      <div className="relative flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenMenuId((id) => (id === book.id ? null : book.id));
                          }}
                          className="text-ink-200 hover:text-ink-400 p-1 rounded-md hover:bg-parchment-200/60 transition-colors"
                          aria-expanded={openMenuId === book.id}
                          aria-haspopup="menu"
                          aria-label={`More options for ${book.title}`}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {openMenuId === book.id && !EXAMPLE_BOOK_IDS.has(book.id) && (
                          <div
                            role="menu"
                            className="absolute right-0 top-full z-[100] mt-1 min-w-[9.5rem] rounded-xl border border-parchment-200/80 bg-white py-1 shadow-warm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              disabled={deletingId === book.id}
                              onClick={() => void deleteLiveBook(book.id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-500 hover:bg-parchment-100 disabled:cursor-wait disabled:opacity-50"
                            >
                              <Trash2 size={14} className="text-ember-600" />
                              {deletingId === book.id ? "Removing…" : "Delete from library"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                          status.bg,
                          status.color
                        )}
                      >
                        <StatusIcon size={10} />
                        {status.label}
                      </span>
                      <span className="text-xs text-ink-200">{book.genre}</span>
                    </div>

                    <p className="text-xs text-ink-300 leading-relaxed line-clamp-2 mb-4">
                      {book.synopsis}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-ink-200">
                      <span>{book.wordCount.toLocaleString()} words</span>
                      <span className="w-1 h-1 rounded-full bg-parchment-300" />
                      <span>{book.chapterCount} chapters</span>
                      <span className="w-1 h-1 rounded-full bg-parchment-300" />
                      <span>{book.createdAt}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Create new card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.15 + books.length * 0.07,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Link
              href="/create"
              className="group glass-card rounded-2xl overflow-hidden flex h-full min-h-[120px] items-center justify-center border-2 border-dashed border-parchment-300/80 hover:border-ember-300 hover:bg-ember-100/20 transition-all duration-200"
            >
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-parchment-200 border border-parchment-300 flex items-center justify-center group-hover:bg-ember-100 group-hover:border-ember-200 transition-colors">
                  <Plus size={18} className="text-ink-300 group-hover:text-ember-600 transition-colors" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-300 group-hover:text-ember-600 transition-colors">
                    New book
                  </p>
                  <p className="text-xs text-ink-200 mt-0.5">Start from an idea or document</p>
                </div>
              </div>
            </Link>
          </motion.div>
        </div>

        {/* Premium prompt */}
        <motion.div
          className="glass-card rounded-2xl p-6 flex items-center justify-between gap-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-ember-100 border border-ember-200 flex items-center justify-center flex-shrink-0">
              <Feather size={18} className="text-ember-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-500">
                Unlock the full creative suite
              </p>
              <p className="text-xs text-ink-300 mt-0.5">
                Save projects, export to PDF, generate longer books, and unlock priority generation.
              </p>
            </div>
          </div>
          <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-ember-500 hover:bg-ember-600 text-white text-sm font-medium rounded-xl transition-all shadow-ember hover:shadow-ember-lg whitespace-nowrap">
            <Sparkles size={13} />
            Upgrade
          </button>
        </motion.div>
      </main>

      <AnimatePresence>
        {previewBook && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-ink-500/35 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewBook(null)}
            />
            <motion.div
              className="fixed inset-x-4 top-1/2 z-[90] mx-auto max-h-[calc(100vh-2rem)] max-w-3xl -translate-y-1/2"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="glass-card flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl">
                <div
                  className="relative overflow-hidden px-6 py-5 text-parchment-50"
                  style={{
                    background: `linear-gradient(135deg, ${previewBook.coverFrom}, ${previewBook.coverVia}, ${previewBook.coverFrom})`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-25"
                    style={{
                      background: `radial-gradient(circle at 78% 20%, ${previewBook.coverAccent}, transparent 58%)`,
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-ink-500/25" />
                  <button
                    type="button"
                    onClick={() => setPreviewBook(null)}
                    className="absolute right-4 top-4 z-10 cursor-pointer rounded-lg bg-white/10 p-2 text-parchment-100 transition-colors hover:bg-white/20"
                    aria-label="Close preview"
                  >
                    <X size={16} />
                  </button>
                  <div className="relative flex flex-col gap-5 pr-10 sm:flex-row sm:items-end">
                    <div className="relative mx-auto aspect-[2/3] w-32 flex-shrink-0 overflow-hidden rounded-xl border border-white/15 bg-black/30 shadow-warm sm:mx-0">
                      {previewBook.coverImageUrl ? (
                        <img
                          src={previewBook.coverImageUrl}
                          alt={`${previewBook.title} cover`}
                          className="h-full w-full object-contain"
                          loading="eager"
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(160deg, ${previewBook.coverFrom}, ${previewBook.coverVia}, ${previewBook.coverFrom})`,
                          }}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-parchment-300/75">
                        Book preview
                      </p>
                      <h2 className="font-serif text-3xl font-bold leading-tight">
                        {previewBook.title}
                      </h2>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-parchment-200/78">
                        A non-spoiler look at the premise, cover, and PDF reading scope before opening the full book.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto p-6 pb-0">
                  <p className="text-sm leading-relaxed text-ink-300">
                    {shortPreviewText(previewBook.synopsis)}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <PreviewStat icon={BookOpen} label="Genre" value={previewBook.genre} />
                    <PreviewStat icon={Hash} label="Chapters" value={String(previewBook.chapterCount)} />
                    <PreviewStat
                      icon={FileText}
                      label="PDF pages"
                      value={`${previewBook.pdfPageCount ?? estimatePdfPagesFromWordCount(previewBook.wordCount, {
                        chapterCount: previewBook.chapterCount,
                        hasCover: Boolean(previewBook.coverImageUrl),
                      })}`}
                    />
                    <PreviewStat icon={Calendar} label="Created" value={previewBook.createdAt} />
                  </div>

                  <div className="mt-5 rounded-2xl border border-parchment-300/60 bg-parchment-100/70 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-ink-200">
                      Reading notes
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-300 shadow-warm-sm">
                        {previewBook.tone}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-300 shadow-warm-sm">
                        {previewBook.wordCount.toLocaleString()} words
                      </span>
                      <span className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium shadow-warm-sm",
                        statusMeta[previewBook.status].bg,
                        statusMeta[previewBook.status].color
                      )}>
                        {statusMeta[previewBook.status].label}
                      </span>
                    </div>
                  </div>

                  <div className="sticky bottom-0 -mx-6 mt-6 flex flex-col-reverse gap-3 border-t border-parchment-200/70 bg-parchment-50/95 px-6 py-4 backdrop-blur sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setPreviewBook(null)}
                      className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-ink-300 transition-colors hover:bg-parchment-200/70 hover:text-ink-500"
                    >
                      Back to library
                    </button>
                    <Link
                      href={
                        EXAMPLE_BOOK_IDS.has(previewBook.id)
                          ? `/reader?sample=${encodeURIComponent(previewBook.id)}&library=1`
                          : `/reader?id=${previewBook.id}`
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-500 px-5 py-2.5 text-sm font-medium text-parchment-50 shadow-warm transition-all hover:bg-ink-400"
                    >
                      <BookOpen size={14} />
                      Open book
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function PreviewStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-parchment-300/60 bg-white/65 p-3 shadow-warm-sm">
      <Icon size={14} className="mb-2 text-ember-600" />
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-200">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-tight text-ink-500">
        {value}
      </p>
    </div>
  );
}
