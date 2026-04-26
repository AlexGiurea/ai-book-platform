"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Feather,
  Globe,
  ImageIcon,
  Layers,
  Library,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { BatchEvent, GenerationJob } from "@/lib/agent/types";
import { estimatePdfPagesFromWordCount } from "@/lib/page-estimate";

/** Single canonical production host for this app (Folio on Vercel). */
const PRODUCTION_APP_URL = "https://ai-book-platform-alex-giureas-projects.vercel.app";

// ─── Steps ────────────────────────────────────────────────────
const steps = [
  { id: "understand", icon: Sparkles, title: "Understanding your idea", detail: "Parsing premise, genre, themes, and creative intent…" },
  { id: "blueprint",  icon: Layers,   title: "Building the story blueprint", detail: "Shaping the opening voice and narrative spine…" },
  { id: "canon",      icon: Globe,    title: "Establishing canon", detail: "Locking characters, world rules, and continuity…" },
  { id: "chapters",   icon: Feather,  title: "Writing chapters", detail: "Drafting section by section with full prior-text memory…" },
  { id: "visuals",    icon: ImageIcon, title: "Designing the cover", detail: "Creating a front cover from the approved story blueprint…" },
  { id: "assembly",   icon: Library,  title: "Assembling your book", detail: "Combining cover, chapters, and reader layout…" },
];

const particles = Array.from({ length: 18 }, (_, i) => ({
  id: i, x: Math.random() * 100, y: Math.random() * 100,
  size: Math.random() * 3 + 1, delay: Math.random() * 4, duration: Math.random() * 6 + 6,
}));

// ─── Types ────────────────────────────────────────────────────
interface ProjectState {
  id: string;
  plan: "free" | "pro";
  status:
    | "pending"
    | "queued"
    | "planning"
    | "awaiting_approval"
    | "writing"
    | "complete"
    | "failed"
    | "cancelled";
  bible?: {
    title: string;
    synopsis: string;
    logline: string;
    premise: string;
    totalBatches: number;
    targetWords: number;
    setting: { world: string; era: string; atmosphere: string; rules: string };
    themes: string[];
    voiceGuide: string;
    characters: Array<{
      name: string;
      role: string;
      description: string;
      motivation: string;
      arc: string;
    }>;
    chapters: Array<{
      number: number;
      title: string;
      summary: string;
      batchStart: number;
      batchEnd: number;
      targetWords: number;
    }>;
  };
  batches: Array<{
    batchNumber: number;
    wordCount: number;
    chapterNumber?: number;
    chapterTitle?: string;
    prose?: string;
    createdAt?: string;
  }>;
  events: BatchEvent[];
  totalWords: number;
  targetWords: number;
  expectedBatches: number;
  title?: string;
  coverStatus: "pending" | "generating" | "complete" | "failed";
  cover?: {
    imageUrl: string;
    prompt: string;
    model: string;
    createdAt: string;
  };
  coverError?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  generationJobs?: GenerationJob[];
}

interface WorkerRunState {
  processed: boolean;
  jobId?: string;
  projectId?: string;
  type?: string;
  status?: "complete" | "failed";
  error?: string;
  checkedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────
function wordsToPages(w: number): number {
  if (!w || w <= 0) return 0;
  return estimatePdfPagesFromWordCount(w, { hasCover: true });
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── Observability panel ─────────────────────────────────────
function ObservabilityPanel({
  events,
  model,
  totalWords,
  targetWords,
  batches,
  expectedBatches,
  etaMs,
  projectId,
  plan,
  status,
  coverStatus,
  updatedAt,
  elapsedMs,
  idleMs,
  lastWorkerRun,
  isStalled,
  generationJobs,
  onCopyDebug,
}: {
  events: BatchEvent[];
  model?: string;
  totalWords: number;
  targetWords: number;
  batches: ProjectState["batches"];
  expectedBatches: number;
  etaMs: number | null;
  projectId?: string;
  plan?: string;
  status?: ProjectState["status"];
  coverStatus?: ProjectState["coverStatus"];
  updatedAt?: string;
  elapsedMs?: number;
  idleMs?: number;
  lastWorkerRun?: WorkerRunState | null;
  isStalled?: boolean;
  generationJobs?: GenerationJob[];
  onCopyDebug?: () => void;
}) {
  const [devOpen, setDevOpen] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events.length]);

  const proseByBatch = new Map<number, string>();
  for (const b of batches) {
    if (b.prose) proseByBatch.set(b.batchNumber, b.prose);
  }

  const completedBatches = events.filter((e) => e.type === "batch_complete");
  const avgMs = completedBatches.length
    ? Math.round(completedBatches.reduce((s, e) => s + (e.durationMs ?? 0), 0) / completedBatches.length)
    : null;
  const totalPages = wordsToPages(totalWords);
  const targetPages = wordsToPages(targetWords);
  const lastEvent = events[events.length - 1];
  const lastSignal = lastEvent
    ? `${lastEvent.type.replace(/_/g, " ")} · ${fmtTime(lastEvent.timestamp)}`
    : updatedAt
      ? `project update · ${fmtTime(updatedAt)}`
      : "waiting";
  const lastWorkerSummary = lastWorkerRun
    ? lastWorkerRun.processed
      ? `${lastWorkerRun.type ?? "job"} ${lastWorkerRun.status ?? "processed"}`
      : "no queued job"
    : "not checked yet";

  const jobQueueSummary = generationJobs?.length
    ? generationJobs
        .map(
          (j) =>
            `${j.type}:${j.status}${j.attempts > 1 ? ` (try ${j.attempts})` : ""}${
              j.lockedAt ? ` · lock ${fmtTime(j.lockedAt)}` : ""
            }`
        )
        .join(" | ")
    : "—";

  // User-facing log: planning + heartbeats + batch_complete + project-level events
  const userEvents = events.filter(
    (e) =>
      e.type === "planning_start" ||
      e.type === "planning_heartbeat" ||
      e.type === "planning_complete" ||
      e.type === "cover_start" ||
      e.type === "cover_complete" ||
      e.type === "cover_failed" ||
      e.type === "batch_complete" ||
      e.type === "project_complete" ||
      e.type === "project_failed"
  );

  return (
    <div className="mt-8 rounded-2xl overflow-hidden border border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
      {/* Live diagnostics */}
      <div className="border-b border-white/6 px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={12} className="text-ember-400" />
          <span className="text-xs font-medium text-parchment-300/80 uppercase tracking-wider">Live run status</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Runtime", value: elapsedMs != null ? fmtDuration(elapsedMs) : "—", icon: Clock3 },
            { label: "Idle", value: idleMs != null ? fmtDuration(idleMs) : "—", icon: Activity },
            { label: "Model", value: model ?? "detecting…", icon: Sparkles },
            { label: "Plan", value: plan ? plan.toUpperCase() : "—", icon: BookOpen },
            { label: "Status", value: status ?? "starting", icon: Layers },
            { label: "Cover", value: coverStatus ?? "pending", icon: ImageIcon },
            { label: "Worker", value: lastWorkerSummary, icon: Terminal },
            { label: "Job queue", value: jobQueueSummary, icon: Library },
            { label: "Project", value: projectId ? projectId.slice(0, 8) : "—", icon: Library },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-white/6 px-3 py-2" style={{ background: "rgba(0,0,0,0.14)" }}>
              <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-parchment-500/50">
                <Icon size={10} />
                {label}
              </div>
              <div className="truncate font-mono text-[11px] text-parchment-200/90">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/6 px-3 py-2 text-xs text-parchment-400/80 sm:flex-row sm:items-center sm:justify-between" style={{ background: "rgba(255,255,255,0.025)" }}>
          <span>Last signal: <span className="text-parchment-200/90">{lastSignal}</span></span>
          <div className="flex flex-wrap items-center gap-2">
            {lastWorkerRun?.error && <span className="text-red-300">Worker error: {lastWorkerRun.error}</span>}
            {onCopyDebug && (
              <button
                type="button"
                onClick={onCopyDebug}
                className="rounded-md border border-white/12 bg-white/5 px-2 py-1 text-[10px] font-medium text-parchment-200/90 hover:bg-white/10"
              >
                Copy debug bundle
              </button>
            )}
          </div>
        </div>
        {isStalled && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-300" />
            <p className="text-xs leading-relaxed text-amber-100/90">
              No new signals for more than three and a half minutes. Open{" "}
              <span className="font-mono text-parchment-200/95">/api/jobs/run</span> in Vercel → Logs, or use{" "}
              <span className="font-mono">Copy debug</span> below. Production functions stop at ~5 minutes; stuck plan jobs
              re-queue after about six.
            </p>
          </div>
        )}
      </div>

      {/* User-facing log */}
      <div className="px-4 py-3 border-b border-white/6">
        <div className="flex items-center gap-2 mb-3">
          <Feather size={12} className="text-ember-400" />
          <span className="text-xs font-medium text-parchment-300/80 uppercase tracking-wider">Writing log</span>
        </div>
        <div
          ref={listRef}
          className="space-y-2 max-h-40 overflow-y-auto pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
        >
          {userEvents.length === 0 && (
            <p className="text-xs text-parchment-500/40 italic">Waiting for first section…</p>
          )}
          {userEvents.map((ev, i) => {
            if (ev.type === "planning_start") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                  <Layers size={12} className="text-sky-400/80" />
                  <span className="text-xs text-parchment-300">Architecting book blueprint…</span>
                </motion.div>
              );
            }
            if (ev.type === "planning_heartbeat") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 pl-1">
                  <Activity size={12} className="text-sky-300/70" />
                  <span className="text-[11px] text-parchment-400/90">
                    Planner still working
                    {ev.durationMs != null ? ` · ${fmtDuration(ev.durationMs)} since start` : ""}
                  </span>
                  <span className="text-[10px] text-parchment-500/40 ml-auto font-mono">{fmtTime(ev.timestamp)}</span>
                </motion.div>
              );
            }
            if (ev.type === "planning_complete") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5">
                  <CheckCircle2 size={12} className="text-sky-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-parchment-300">Book blueprint ready{ev.bookTitle ? ` — “${ev.bookTitle}”` : ""}</span>
                    <span className="text-xs text-parchment-500/60 ml-1.5">
                      {ev.totalChapters ? `${ev.totalChapters} chapters` : ""}
                      {ev.totalBatches ? ` · ${ev.totalBatches} batches` : ""}
                    </span>
                  </div>
                  <span className="text-[10px] text-parchment-500/40 flex-shrink-0 font-mono">{fmtTime(ev.timestamp)}</span>
                </motion.div>
              );
            }
            if (ev.type === "batch_complete") {
              const pct = ev.totalWords && targetWords
                ? Math.round((ev.totalWords / targetWords) * 100)
                : 0;
              const batchPages = wordsToPages(ev.wordsInBatch ?? 0);
              const prose = ev.batchNumber != null ? proseByBatch.get(ev.batchNumber) : undefined;
              const isExpanded = expandedBatch === ev.batchNumber;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={12} className="text-ember-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-parchment-300">
                        Section {ev.batchNumber} written
                      </span>
                      <span className="text-xs text-parchment-500/60 ml-1.5">
                        +{(ev.wordsInBatch ?? 0).toLocaleString()} words
                        {batchPages ? ` · ~${batchPages}p` : ""}
                        {ev.durationMs ? ` · ${fmtMs(ev.durationMs)}` : ""}
                        {ev.totalWords ? ` · ${pct}%` : ""}
                      </span>
                      {prose && (
                        <button
                          onClick={() =>
                            setExpandedBatch((cur) =>
                              cur === ev.batchNumber ? null : (ev.batchNumber ?? null)
                            )
                          }
                          className="ml-1.5 text-[10px] text-ember-400/80 hover:text-ember-300 transition-colors"
                        >
                          {isExpanded ? "hide preview" : "preview"}
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-parchment-500/40 flex-shrink-0 font-mono">
                      {fmtTime(ev.timestamp)}
                    </span>
                  </div>
                  <AnimatePresence>
                    {isExpanded && prose && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-5 overflow-hidden"
                      >
                        <div
                          className="rounded-lg border border-white/8 px-3 py-2 max-h-36 overflow-y-auto text-[11px] leading-relaxed text-parchment-300/90 font-serif whitespace-pre-wrap"
                          style={{
                            background: "rgba(0,0,0,0.25)",
                            scrollbarWidth: "thin",
                            scrollbarColor: "rgba(255,255,255,0.15) transparent",
                          }}
                        >
                          {prose}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            }
            if (ev.type === "cover_start") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                  <ImageIcon size={12} className="text-dust-200" />
                  <span className="text-xs text-parchment-300">Designing front cover…</span>
                  <span className="text-[10px] text-parchment-500/40 ml-auto font-mono">{fmtTime(ev.timestamp)}</span>
                </motion.div>
              );
            }
            if (ev.type === "cover_complete") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5">
                  <CheckCircle2 size={12} className="text-dust-200 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-parchment-300">Front cover ready</span>
                    <span className="text-xs text-parchment-500/60 ml-1.5">hidden until the book opens</span>
                  </div>
                  <span className="text-[10px] text-parchment-500/40 flex-shrink-0 font-mono">{fmtTime(ev.timestamp)}</span>
                </motion.div>
              );
            }
            if (ev.type === "cover_failed") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5">
                  <ImageIcon size={12} className="text-red-300 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-300">Cover generation failed. The book will use a fallback cover.</span>
                </motion.div>
              );
            }
            if (ev.type === "project_complete") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-medium">Book complete — {(ev.totalWords ?? 0).toLocaleString()} words total</span>
                </motion.div>
              );
            }
            if (ev.type === "project_failed") {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                  <span className="text-xs text-red-400">{ev.error}</span>
                </motion.div>
              );
            }
            return null;
          })}
        </div>
      </div>

      {/* Dev panel toggle */}
      <button
        onClick={() => setDevOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <Terminal size={11} className="text-parchment-500/50" />
        <span className="text-[11px] text-parchment-500/50 flex-1">Full developer trace</span>
        {devOpen ? <ChevronUp size={11} className="text-parchment-500/40" /> : <ChevronDown size={11} className="text-parchment-500/40" />}
      </button>

      <AnimatePresence>
        {devOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-px bg-white/5 border-t border-white/6">
              {[
                { label: "Model", value: model ?? "—" },
                { label: "Plan", value: plan ?? "—" },
                { label: "Status", value: status ?? "—" },
                { label: "Avg batch", value: avgMs != null ? fmtMs(avgMs) : "—" },
                { label: "ETA remaining", value: etaMs != null ? fmtDuration(etaMs) : "—" },
                { label: "Words / target", value: `${totalWords.toLocaleString()} / ${targetWords.toLocaleString()}` },
                { label: "Pages / target", value: `~${totalPages} / ${targetPages}` },
                { label: "Batches", value: `${completedBatches.length} / ${expectedBatches || "?"}` },
              ].map(({ label, value }) => (
                <div key={label} className="px-3 py-2.5" style={{ background: "rgba(0,0,0,0.15)" }}>
                  <div className="text-[9px] uppercase tracking-widest text-parchment-500/40 mb-0.5">{label}</div>
                  <div className="text-[11px] font-mono text-parchment-300/80 truncate">{value}</div>
                </div>
              ))}
            </div>

            {/* Full event trace */}
            <div
              className="px-3 py-3 max-h-64 overflow-y-auto font-mono text-[10px] space-y-1"
              style={{ background: "rgba(0,0,0,0.2)", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
            >
              {events.map((ev, i) => {
                const color =
                  ev.type === "batch_complete" ? "text-emerald-400/80"
                  : ev.type === "batch_start" ? "text-sky-400/70"
                  : ev.type === "project_complete" ? "text-emerald-400"
                  : ev.type === "project_failed" ? "text-red-400"
                  : "text-parchment-500/50";

                const details: string[] = [];
                if (ev.batchNumber != null) details.push(`batch=${ev.batchNumber}`);
                if (ev.wordsInBatch != null) details.push(`words=${ev.wordsInBatch}`);
                if (ev.totalWords != null) details.push(`total=${ev.totalWords}`);
                if (ev.durationMs != null) details.push(`duration=${fmtMs(ev.durationMs)}`);
                if (ev.coverImageUrl) details.push(`cover=${ev.coverImageUrl}`);
                if (ev.error) details.push(`error="${ev.error}"`);

                return (
                  <div key={i} className="flex gap-2">
                    <span className="text-parchment-500/30 flex-shrink-0">{fmtTime(ev.timestamp)}</span>
                    <span className={`${color} flex-shrink-0`}>[{ev.type}]</span>
                    {details.length > 0 && (
                      <span className="text-parchment-400/50">{details.join(" ")}</span>
                    )}
                  </div>
                );
              })}
              {events.length === 0 && (
                <span className="text-parchment-500/30">No events yet…</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
// ─── Blueprint Review Panel ──────────────────────────────────
function BibleReviewPanel({
  bible,
  targetWords,
  estTotalPages,
  onApprove,
  onReplan,
  onStop,
  stopBusy,
  showStop,
  busy,
}: {
  bible: NonNullable<ProjectState["bible"]>;
  targetWords: number;
  estTotalPages: number;
  onApprove: () => void;
  onReplan: () => void;
  onStop?: () => void;
  stopBusy?: boolean;
  showStop?: boolean;
  busy: "approving" | "replanning" | null;
}) {
  const [tab, setTab] = useState<"overview" | "characters" | "chapters">("overview");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      {/* Header */}
      <div className="text-center mb-6">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/25 bg-gradient-to-b from-emerald-500/15 to-emerald-600/5 shadow-[0_0_24px_-8px_rgba(16,185,129,0.45)]">
            <Layers size={24} className="text-emerald-200/90" />
          </div>
          <div className="absolute -right-0.5 -top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300/30 bg-ink-500/80 shadow-sm">
            <CheckCircle2 size={13} className="text-emerald-400" aria-hidden />
          </div>
        </div>
        <motion.p
          className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/95"
          animate={{ opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          Blueprint ready
        </motion.p>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-sky-400/70">Book bible · review & approve</p>
        <h1 className="font-serif text-3xl font-bold text-parchment-50 mb-2 leading-tight">{bible.title}</h1>
        <p className="text-parchment-400 text-sm italic max-w-lg mx-auto">{bible.logline}</p>
        <p className="mt-3 max-w-md mx-auto text-sm leading-relaxed text-parchment-300/90">
          Your story map is in place. Review the outline below — when you approve, we&apos;ll start drafting. Everything is on track.
        </p>
        <p className="mt-2 text-center text-xs font-mono text-parchment-200/80">
          ~{estTotalPages.toLocaleString()} pages · {targetWords.toLocaleString()} words
          <span className="ml-1 text-parchment-500/60">(target)</span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-1 mb-4">
        {(["overview", "characters", "chapters"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === t
                ? "bg-white/10 text-parchment-100"
                : "text-parchment-500/60 hover:text-parchment-300"
            }`}
          >
            {t[0].toUpperCase() + t.slice(1)}
            {t === "characters" ? ` (${bible.characters.length})` : ""}
            {t === "chapters" ? ` (${bible.chapters.length})` : ""}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className="rounded-2xl border border-white/8 p-5 mb-5 max-h-[420px] overflow-y-auto"
        style={{ background: "rgba(255,255,255,0.04)", scrollbarWidth: "thin" }}
      >
        {tab === "overview" && (
          <div className="space-y-4 text-sm">
            <Field label="Synopsis" value={bible.synopsis} />
            <Field label="Premise" value={bible.premise} />
            <Field label="World" value={bible.setting.world} />
            <Field label="Era" value={bible.setting.era} />
            <Field label="Atmosphere" value={bible.setting.atmosphere} />
            <Field label="Rules" value={bible.setting.rules} />
            <Field label="Voice" value={bible.voiceGuide} />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-parchment-500/60 mb-1.5">Themes</p>
              <div className="flex flex-wrap gap-1.5">
                {bible.themes.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-ember-500/10 border border-ember-400/20 text-ember-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-white/6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Stat label="Target words" value={targetWords.toLocaleString()} />
              <Stat label="Est. total pages" value={`~${estTotalPages.toLocaleString()}`} />
              <Stat label="Chapters" value={String(bible.chapters.length)} />
              <Stat label="Batches" value={String(bible.totalBatches)} />
            </div>
          </div>
        )}

        {tab === "characters" && (
          <div className="space-y-4">
            {bible.characters.map((c, i) => (
              <div key={i} className="pb-4 border-b border-white/5 last:border-0 last:pb-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <h3 className="font-serif text-base font-semibold text-parchment-100">{c.name}</h3>
                  <span className="text-[10px] uppercase tracking-wider text-ember-400/80">{c.role}</span>
                </div>
                <p className="text-xs text-parchment-300/90 mb-1.5 leading-relaxed">{c.description}</p>
                <p className="text-[11px] text-parchment-400/80 leading-relaxed"><span className="text-parchment-500/60">Motivation — </span>{c.motivation}</p>
                <p className="text-[11px] text-parchment-400/80 leading-relaxed mt-0.5"><span className="text-parchment-500/60">Arc — </span>{c.arc}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "chapters" && (
          <div className="space-y-3">
            {bible.chapters.map((ch) => (
              <div key={ch.number} className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-[10px] font-mono text-parchment-300">
                  {ch.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h4 className="font-serif text-sm font-semibold text-parchment-100 leading-tight">{ch.title}</h4>
                    <span className="text-[10px] text-parchment-500/50 font-mono flex-shrink-0">
                      batches {ch.batchStart}–{ch.batchEnd} · ~{(ch.targetWords ?? 0).toLocaleString()}w
                      {ch.targetWords != null && ch.targetWords > 0 ? ` · ~${wordsToPages(ch.targetWords)} pp.` : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-parchment-400/80 mt-1 leading-relaxed">{ch.summary}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={onApprove}
          disabled={busy !== null}
          className="flex-1 py-3 rounded-xl bg-ember-500 hover:bg-ember-600 text-white text-sm font-medium transition-all shadow-ember disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy === "approving" ? "Starting writer…" : (<><Feather size={14} /> Approve & start writing</>)}
        </button>
        <button
          onClick={onReplan}
          disabled={busy !== null}
          className="py-3 px-4 rounded-xl border border-white/15 text-parchment-300 hover:bg-white/5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy === "replanning" ? "Regenerating…" : "Regenerate blueprint"}
        </button>
      </div>
      <p className="text-center text-[11px] text-parchment-500/40 mt-3">
        The blueprint is the book&apos;s creative map — approve when it captures what you want to read.
      </p>
      {showStop && onStop && (
        <p className="mt-2 text-center text-[10px] text-parchment-500/30">
          <button
            type="button"
            onClick={onStop}
            disabled={stopBusy}
            className="cursor-pointer border-b border-transparent text-parchment-500/50 transition hover:border-parchment-500/30 hover:text-parchment-400/70 disabled:cursor-wait disabled:opacity-50"
          >
            {stopBusy ? "Stopping…" : "Stop generation (discard)"}
          </button>
        </p>
      )}
    </motion.div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-parchment-500/60 mb-1">{label}</p>
      <p className="text-xs text-parchment-200 leading-relaxed">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-parchment-500/50 mb-0.5">{label}</p>
      <p className="text-sm font-mono text-parchment-200">{value}</p>
    </div>
  );
}

function XIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function GeneratingPage() {
  const router = useRouter();
  const [project, setProject] = useState<ProjectState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dots, setDots] = useState(".");
  const [approvalBusy, setApprovalBusy] = useState<"approving" | "replanning" | null>(null);
  const [modelName, setModelName] = useState<string | undefined>(undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastWorkerRun, setLastWorkerRun] = useState<WorkerRunState | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [halted, setHalted] = useState(false);
  const startedRef = useRef(false);
  const pageStartedAtRef = useRef(Date.now());
  const pollStopRef = useRef(false);

  const copyDebugBundle = useCallback(() => {
    if (!project) return;
    const bundle = {
      productionAppUrl: PRODUCTION_APP_URL,
      projectId: project.id,
      status: project.status,
      plan: project.plan,
      targetWords: project.targetWords,
      expectedBatches: project.expectedBatches,
      lastEvents: project.events.slice(-16),
      generationJobs: project.generationJobs,
      lastWorkerRun,
      howToInvestigate: [
        "Vercel dashboard → this project → Logs (or Runtime → Functions).",
        "Filter for path /api/jobs/run or search logs for [planner] and [generation-job].",
        "Production limit is 300s per invocation; a single plan call that exceeds that is killed and the job re-queues after ~6m lock expiry.",
      ],
    };
    void navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
  }, [project, lastWorkerRun]);

  const handleStopGeneration = useCallback(async () => {
    if (!project || cancelBusy) return;
    setCancelBusy(true);
    try {
      const r = await fetch(`/api/project/${project.id}/cancel`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      pollStopRef.current = true;
      setHalted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelBusy(false);
    }
  }, [project, cancelBusy]);

  const kickWorker = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs/run", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as Omit<WorkerRunState, "checkedAt">;
      setLastWorkerRun({ ...data, checkedAt: new Date().toISOString() });
    } catch (err) {
      setLastWorkerRun({
        processed: false,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      });
    }
  }, []);

  const handleApprove = async () => {
    if (!project) return;
    setApprovalBusy("approving");
    try {
      const r = await fetch(`/api/project/${project.id}/approve`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      await kickWorker();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovalBusy(null);
    }
  };

  const handleReplan = async () => {
    if (!project) return;
    setApprovalBusy("replanning");
    try {
      const r = await fetch(`/api/project/${project.id}/replan`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      await kickWorker();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovalBusy(null);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
      setNowMs(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const raw = typeof window !== "undefined" ? sessionStorage.getItem("bookParams") : null;
    if (!raw) { router.replace("/create"); return; }

    let params: Record<string, unknown>;
    try { params = JSON.parse(raw); }
    catch { router.replace("/create"); return; }

    const rawMode = String(params.mode ?? "text");
    const inputMode =
      rawMode === "upload" || rawMode === "canvas" ? rawMode : "text";
    const payload = {
      idea: String(params.idea ?? ""),
      inputMode,
      preferences: {
        genre: String(params.genre ?? ""),
        tone: String(params.tone ?? ""),
        length: ["dev", "short", "medium", "long", "large", "tome"].includes(String(params.length)) ? params.length : "medium",
        imageStyle: String(params.imageStyle ?? ""),
        pov: String(params.pov ?? ""),
      },
      contextFileNames: Array.isArray(params.contextFiles) ? (params.contextFiles as string[]) : undefined,
      canvas:
        params.canvas && typeof params.canvas === "object"
          ? (params.canvas as Record<string, unknown>)
          : undefined,
    };

    (async () => {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const { projectId } = (await res.json()) as { projectId: string };
        await kickWorker();
        pollProject(projectId);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    })();

    function pollProject(id: string) {
      let stopped = false;
      const tick = async () => {
        if (stopped || pollStopRef.current) return;
        try {
          const r = await fetch(`/api/project/${id}`);
          if (r.ok) {
            const p = (await r.json()) as ProjectState;
            // Prefer the latest model-bearing event. A project can start planning
            // on an older deployment, then write on a newer one after a redeploy.
            const latestModel = p.events.slice().reverse().find((e) => e.model)?.model;
            if (latestModel) setModelName(latestModel);
            setProject(p);
            if (p.status === "complete") { stopped = true; setTimeout(() => router.push(`/reader?id=${id}`), 1200); return; }
            if (p.status === "failed") { stopped = true; setErrorMessage(p.error ?? "Generation failed"); return; }
            if (p.status === "cancelled") { stopped = true; setHalted(true); return; }
            if (p.status !== "awaiting_approval") {
              kickWorker();
            }
          }
        } catch { /* retry */ }
        setTimeout(tick, 1500);
      };
      tick();
    }
  }, [kickWorker, router]);

  const progressFraction = project ? Math.min(1, project.totalWords / Math.max(1, project.targetWords)) : 0;

  // ─── Linear progress + ETA based on completed batch durations ───
  const completedBatchEvents = project?.events.filter((e) => e.type === "batch_complete") ?? [];
  const batchDurations = completedBatchEvents
    .map((e) => e.durationMs ?? 0)
    .filter((ms) => ms > 0);
  const avgBatchMs = batchDurations.length
    ? batchDurations.reduce((s, v) => s + v, 0) / batchDurations.length
    : null;
  const expectedBatchesSafe = Math.max(project?.expectedBatches ?? 0, completedBatchEvents.length);
  const remainingBatches = Math.max(0, expectedBatchesSafe - completedBatchEvents.length);
  const etaMs =
    avgBatchMs != null && expectedBatchesSafe > 0 && project?.status !== "complete"
      ? Math.round(avgBatchMs * remainingBatches)
      : null;
  const lastSignalIso =
    project?.events[project.events.length - 1]?.timestamp ??
    project?.updatedAt ??
    project?.createdAt;
  const elapsedMs = project?.createdAt
    ? Math.max(0, nowMs - new Date(project.createdAt).getTime())
    : Math.max(0, nowMs - pageStartedAtRef.current);
  const idleMs = lastSignalIso
    ? Math.max(0, nowMs - new Date(lastSignalIso).getTime())
    : elapsedMs;
  const effectiveModelName =
    modelName ??
    project?.events.slice().reverse().find((e) => e.model)?.model ??
    (project?.plan === "pro" ? "gpt-5.5" : undefined);
  const isStalled =
    project?.status === "planning" &&
    idleMs > 3.5 * 60 * 1000 &&
    !errorMessage;

  // Linear progress: prefer batch-count ratio once writing has begun (more linear than word ratio)
  const batchProgress =
    expectedBatchesSafe > 0 ? completedBatchEvents.length / expectedBatchesSafe : 0;
  const linearFraction =
    project?.status === "complete"
      ? 1
      : expectedBatchesSafe > 0 && completedBatchEvents.length > 0
        ? Math.min(0.98, batchProgress)
        : progressFraction;
  let currentStep = 0;
  if (!project) currentStep = 0;
  else if (project.status === "complete") currentStep = steps.length;
  else if (project.status === "pending" || project.status === "queued") currentStep = 0;
  else if (project.status === "planning") currentStep = 1;
  else if (project.status === "awaiting_approval") currentStep = 2;
  else if (project.batches.length === 0) currentStep = 2;
  else if (project.coverStatus === "generating" && progressFraction >= 0.9) currentStep = 4;
  else if (progressFraction < 0.95) currentStep = 3;
  else if (project.coverStatus === "complete" || project.coverStatus === "failed") currentStep = 5;
  else currentStep = 4;

  const awaitingApproval = project?.status === "awaiting_approval" && project.bible;

  // Current chapter (for the "writing" status line)
  const lastBatch = project?.batches?.[project.batches.length - 1];
  const currentChapterNum = lastBatch?.chapterNumber;
  const currentChapterTitle = lastBatch?.chapterTitle;

  const done = project?.status === "complete";
  const progress = done ? 100 : Math.min(98, Math.round(linearFraction * 100));

  const canStop =
    !errorMessage &&
    !halted &&
    project &&
    ["pending", "queued", "planning", "awaiting_approval", "writing"].includes(
      project.status
    );

  const showHalted = halted || project?.status === "cancelled";

  return (
    <div className="min-h-screen bg-ink-500 flex flex-col items-center justify-center relative overflow-hidden">
      {particles.map((p) => (
        <motion.div key={p.id} className="absolute rounded-full bg-ember-400"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, opacity: 0 }}
          animate={{ opacity: [0, 0.4, 0], y: [0, -40, -80], scale: [1, 1.5, 0.5] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-ember-700/20 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-dust-600/10 blur-[80px]" />
      </div>

      <div className={`relative z-10 w-full ${awaitingApproval ? "max-w-2xl" : "max-w-xl"} px-6 py-10`}>
        {/* Logo */}
        <motion.div className="flex items-center gap-2 justify-center mb-12"
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="w-8 h-8 rounded-xl bg-ember-500 flex items-center justify-center shadow-ember">
            <Sparkles size={15} className="text-white" />
          </div>
          <span className="font-serif text-xl font-semibold text-parchment-100 tracking-tight">Folio</span>
        </motion.div>

        {/* Status heading */}
        <motion.div className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
          <AnimatePresence mode="wait">
            {errorMessage ? (
              <motion.div key="error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-400/30 flex items-center justify-center mx-auto mb-5">
                  <XIcon size={26} className="text-red-300" />
                </div>
                <h1 className="font-serif text-3xl font-bold text-parchment-50 mb-2">Something went wrong</h1>
                <p className="text-parchment-400 text-sm max-w-md mx-auto">{errorMessage}</p>
                <button onClick={() => router.push("/create")} className="mt-6 px-5 py-2 rounded-full bg-ember-500 text-white text-sm font-medium hover:bg-ember-600 transition">
                  Back to create
                </button>
              </motion.div>
            ) : showHalted ? (
              <motion.div key="halted" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="w-16 h-16 rounded-full border border-parchment-400/20 bg-parchment-200/5 flex items-center justify-center mx-auto mb-5">
                  <XIcon size={24} className="text-parchment-300" />
                </div>
                <h1 className="font-serif text-3xl font-bold text-parchment-50 mb-2">Generation stopped</h1>
                <p className="text-parchment-400 text-sm max-w-md mx-auto">
                  The process was interrupted. Any partial work is still listed in your library.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="mt-6 px-5 py-2 rounded-full border border-parchment-400/25 bg-white/5 text-parchment-100 text-sm font-medium hover:bg-white/10 transition"
                >
                  Back to library
                </button>
              </motion.div>
            ) : awaitingApproval && project?.bible ? (
              <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <BibleReviewPanel
                  bible={project.bible}
                  targetWords={project.targetWords}
                  estTotalPages={wordsToPages(project.targetWords)}
                  onApprove={handleApprove}
                  onReplan={handleReplan}
                  onStop={handleStopGeneration}
                  stopBusy={cancelBusy}
                  showStop={!!canStop}
                  busy={approvalBusy}
                />
              </motion.div>
            ) : done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <div className="w-16 h-16 rounded-full bg-ember-500/20 border border-ember-400/30 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={28} className="text-ember-400" />
                </div>
                <h1 className="font-serif text-3xl font-bold text-parchment-50 mb-2">{project?.title ?? "Your book is ready"}</h1>
                <p className="text-parchment-400 text-base">Opening reader now…</p>
              </motion.div>
            ) : (
              <motion.div key="working">
                <div className="w-16 h-16 rounded-full bg-parchment-200/5 border border-parchment-300/10 flex items-center justify-center mx-auto mb-5 relative">
                  <BookOpen size={26} className="text-parchment-300" />
                  <motion.div className="absolute inset-0 rounded-full border-2 border-ember-500"
                    style={{ borderTopColor: "transparent", borderRightColor: "transparent" }}
                    animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                <h1 className="font-serif text-3xl font-bold text-parchment-50 mb-2">Writing your book{dots}</h1>
                {project?.status === "planning" && (
                  <div className="mx-auto mb-4 max-w-lg rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-left text-xs leading-relaxed text-parchment-200/90">
                    <p className="mb-1 font-medium text-sky-200/95">Step 1 can take a few minutes</p>
                    <p className="text-parchment-400/90">
                      The blueprint is <strong className="text-parchment-200/90">one large model call</strong>. The UI updates every ~30s
                      with heartbeats in the log below. If it sits past ~5 minutes with no new lines, the serverless
                      time limit is the usual cause — use <strong className="text-parchment-200/90">Copy debug bundle</strong> in the
                      panel and check Vercel function logs for <span className="font-mono text-[10px]">/api/jobs/run</span>.
                    </p>
                    <p className="mt-2 text-[10px] text-parchment-500/80">
                      Test at:{" "}
                      <span className="font-mono text-parchment-400/90">{PRODUCTION_APP_URL}</span>
                    </p>
                  </div>
                )}
                <p className="text-parchment-400 text-sm">
                  {!project
                    ? "Preparing your manuscript…"
                    : project.status === "planning"
                      ? "Architecting book blueprint — characters, chapters, and scene beats…"
                      : (
                          <>
                            {project.totalWords.toLocaleString()} / {project.targetWords.toLocaleString()} words
                            {" · "}~{wordsToPages(project.totalWords)} / {wordsToPages(project.targetWords)} pages
                            {" · batch "}{Math.max(1, project.batches.length)} of ~{project.expectedBatches}
                            {etaMs != null && (
                              <span className="block text-xs text-parchment-500/70 mt-1">
                                ~{fmtDuration(etaMs)} remaining
                              </span>
                            )}
                            {currentChapterNum && currentChapterTitle && (
                              <span className="block text-xs text-parchment-500/70 mt-1 italic">
                                Chapter {currentChapterNum} — “{currentChapterTitle}”
                              </span>
                            )}
                            {isStalled && (
                              <span className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-left text-xs leading-relaxed text-amber-100/90">
                                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-300" />
                                No fresh signal for {fmtDuration(idleMs)}. You can wait a little longer, but this may need a restart if Vercel times out.
                              </span>
                            )}
                          </>
                        )}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Progress bar */}
        {!errorMessage && !showHalted && !awaitingApproval && (
          <motion.div className="mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }}>
            <div className="h-1 bg-parchment-300/10 rounded-full overflow-hidden">
              <motion.div className="h-full bg-gradient-to-r from-ember-600 to-ember-400 rounded-full"
                animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-parchment-500">{progress}%</span>
              <span className="text-xs text-parchment-500">Step {Math.min(currentStep + 1, steps.length)} of {steps.length}</span>
            </div>
          </motion.div>
        )}

        {/* Steps */}
        {!errorMessage && !showHalted && !awaitingApproval && (
          <motion.div className="space-y-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
            {steps.map((step, i) => {
              const isCompleted = i < currentStep;
              const isActive = i === currentStep && !done;
              return (
                <motion.div key={step.id} className="flex items-start gap-4 p-3 rounded-xl transition-colors duration-300"
                  style={{ background: isActive ? "rgba(253,251,247,0.06)" : isCompleted ? "rgba(253,251,247,0.03)" : "transparent" }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300"
                    style={{ background: isCompleted ? "rgba(201,125,48,0.2)" : isActive ? "rgba(201,125,48,0.15)" : "rgba(253,251,247,0.05)" }}>
                    {isCompleted ? <CheckCircle2 size={14} className="text-ember-400" /> : <step.icon size={13} className={isActive ? "text-ember-400" : "text-parchment-500/40"} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium transition-colors duration-300"
                        style={{ color: isCompleted ? "rgba(201,125,48,0.8)" : isActive ? "rgba(247,243,236,0.9)" : "rgba(247,243,236,0.25)" }}>
                        {step.title}
                      </p>
                      {isActive && (
                        <motion.div className="flex gap-0.5 items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          {[0, 1, 2].map((j) => (
                            <motion.span key={j} className="w-1 h-1 rounded-full bg-ember-400"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.2, delay: j * 0.2, repeat: Infinity }} />
                          ))}
                        </motion.div>
                      )}
                    </div>
                    <AnimatePresence>
                      {isActive && (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="text-xs text-parchment-500/60 mt-1 leading-relaxed">{step.detail}</motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Observability panel */}
        {!errorMessage && !showHalted && project && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <ObservabilityPanel
              events={project.events}
              model={effectiveModelName}
              totalWords={project.totalWords}
              targetWords={project.targetWords}
              batches={project.batches}
              expectedBatches={project.expectedBatches}
              etaMs={etaMs}
              projectId={project.id}
              plan={project.plan}
              status={project.status}
              coverStatus={project.coverStatus}
              updatedAt={project.updatedAt}
              elapsedMs={elapsedMs}
              idleMs={idleMs}
              lastWorkerRun={lastWorkerRun}
              isStalled={isStalled}
              generationJobs={project.generationJobs}
              onCopyDebug={copyDebugBundle}
            />
          </motion.div>
        )}

        {canStop && !awaitingApproval && (
          <p className="mb-3 text-center text-[10px] text-parchment-500/30">
            <button
              type="button"
              onClick={handleStopGeneration}
              disabled={cancelBusy}
              className="cursor-pointer border-b border-transparent text-parchment-500/45 transition hover:border-parchment-500/35 hover:text-parchment-400/75 disabled:cursor-wait disabled:opacity-50"
            >
              {cancelBusy ? "Stopping…" : "Stop generation"}
            </button>
          </p>
        )}

        <motion.p className="text-center text-xs text-parchment-500/40 mt-8"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.5 }}>
          Folio maintains canon and continuity across every section
        </motion.p>
      </div>
    </div>
  );
}
