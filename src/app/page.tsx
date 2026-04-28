"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  BadgeDollarSign,
  BookOpen,
  CheckCircle2,
  Database,
  Feather,
  ImageIcon,
  KeyRound,
  Layers,
  Maximize2,
  Pause,
  PenTool,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import AccountMenu from "@/components/AccountMenu";
import { useAuthUser } from "@/hooks/useAuthUser";
import { PLAN_DEFINITIONS, PLAN_ORDER } from "@/lib/plans";
import { dashboardBooks } from "@/lib/sampleData";

const smoothEase = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: smoothEase, delay },
  }),
};

const features = [
  {
    icon: Wand2,
    title: "From idea to book",
    body: "Paste a sentence, a thesis, or a full outline. Folio turns any starting point into a structured, multi-chapter book.",
  },
  {
    icon: Layers,
    title: "Chapter-by-chapter craft",
    body: "A structured pipeline writes each chapter with full context of what came before — no plot holes, no voice drift.",
  },
  {
    icon: ImageIcon,
    title: "Illustrated throughout",
    body: "Every book gets a visual style guide. Illustrations are generated consistently, as if from a single artist.",
  },
  {
    icon: BookOpen,
    title: "Beautiful reading experience",
    body: "Read your book inside an elegant digital reader with soft typography and inline art. No PDFs needed.",
  },
];

const capabilityCards = [
  { icon: Wand2, title: "Prompt", label: "Idea intake", body: "Premise, files, notes, characters" },
  { icon: Layers, title: "Plan", label: "Story bible", body: "Chapters, canon, voice, themes" },
  { icon: PenTool, title: "Draft", label: "Batch writing", body: "Tracked jobs with progress events" },
  { icon: ImageIcon, title: "Design", label: "Cover system", body: "Visual direction and cover retries" },
  { icon: Database, title: "Store", label: "Neon library", body: "Private projects and book history" },
  { icon: KeyRound, title: "Protect", label: "Auth scoped", body: "Sessions and account ownership" },
];

const pricingPlans = PLAN_ORDER.map((id) => PLAN_DEFINITIONS[id]);

const manuscripts = [
  {
    genre: "Literary mystery",
    prompt:
      "A lighthouse keeper who receives letters from the future, dated before he was born.",
    title: "The Keeper of Tides",
    chapters: [
      "The Longest Night",
      "A Letter That Shouldn't Exist",
      "Salt and Other Inheritances",
      "Signal From Beneath the Waves",
      "What the Lighthouse Remembers",
    ],
  },
  {
    genre: "Historical fantasy",
    prompt:
      "A cartographer's daughter discovers her father's maps are redrawing themselves overnight.",
    title: "The Cartographer's Daughter",
    chapters: [
      "An Inheritance of Ink",
      "The River That Was Not There",
      "A Name the Map Refused",
      "Where the Compass Turned",
      "The Country That Knew Her",
    ],
  },
  {
    genre: "Speculative fiction",
    prompt:
      "In a city where memories are kept in glass, the last unarchived citizen vanishes.",
    title: "The Last Archive",
    chapters: [
      "The Citizen Without a File",
      "Glass, and What It Keeps",
      "The Hour Between Recollections",
      "A Room That Never Indexed",
      "What the Archive Could Not Hold",
    ],
  },
];

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

// ── Feather-pen CTA: a single smooth sweep from the left edge to the right
// edge of the button, then settles there with a gentle bob. Pen stays inside
// its box. Animated with one smooth ease for buttery 60fps motion.
function FeatherPenCTA({
  href = "/signup",
  label = "Start creating - it's free",
}: {
  href?: string;
  label?: string;
}) {
  const PEN_SIZE = 26;
  const EDGE_INSET = 10;
  const WRITE_MS = 1700;
  type Phase = "idle" | "writing" | "resting";
  const [phase, setPhase] = useState<Phase>("idle");
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<HTMLSpanElement | null>(null);

  const measureTrack = (node: HTMLSpanElement | null) => {
    trackRef.current = node;
    if (!node) return;
    const w = node.offsetWidth - PEN_SIZE;
    if (w > 0) setTrackWidth(w);
  };

  useEffect(() => {
    const onResize = () => {
      if (trackRef.current) {
        const w = trackRef.current.offsetWidth - PEN_SIZE;
        if (w > 0) setTrackWidth(w);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startedRef = useRef(false);
  useEffect(() => {
    if (trackWidth <= 0 || startedRef.current) return;
    startedRef.current = true;
    const start = setTimeout(() => setPhase("writing"), 60);
    const rest = setTimeout(() => setPhase("resting"), 60 + WRITE_MS + 80);
    return () => {
      clearTimeout(start);
      clearTimeout(rest);
    };
  }, [trackWidth]);

  // 8 ink sparks puffing from the nib during the writing pass — kept inside box
  const sparks = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    at: 0.1 + (i / 8) * 0.85,
    drift: (i % 2 === 0 ? 1 : -1) * (3 + (i % 3) * 2),
    delay: 0.06 * i,
  }));

  return (
    <Link
      href={href}
      className="group relative flex items-center justify-center overflow-hidden px-7 py-3.5 bg-ember-500 hover:bg-ember-600 text-white text-base font-medium rounded-xl transition-all duration-200 shadow-ember hover:shadow-ember-lg hover:-translate-y-0.5"
    >
      {/* Track — measures the inner width of the button so the pen sweeps to the right edge */}
      <span
        ref={measureTrack}
        aria-hidden
        className="pointer-events-none absolute inset-x-2 inset-y-0"
      />
      {/* Soft amber aura under the button */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-[18px] blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,200,130,0.45), rgba(201,125,48,0.0))",
        }}
        initial={{ opacity: 0 }}
        animate={{
          opacity:
            phase === "writing" ? 0.85 : phase === "resting" ? 0.35 : 0,
        }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />

      {/* Ink trail — drawn under the pen as it sweeps */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute bottom-2 h-[2px] rounded-full"
        style={{
          left: EDGE_INSET + 4,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 30%, rgba(255,255,255,0.85) 75%, rgba(255,255,255,0) 100%)",
          willChange: "width, opacity",
        }}
        initial={{ width: 0, opacity: 0 }}
        animate={{
          width: phase === "idle" ? 0 : trackWidth,
          opacity: phase === "writing" ? 1 : 0,
        }}
        transition={{
          width:
            phase === "writing"
              ? { duration: WRITE_MS / 1000, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0 },
          opacity:
            phase === "writing"
              ? { duration: 0.4, ease: "easeOut" }
              : { duration: 1.2, ease: "easeOut" },
        }}
      />

      {/* Feather pen — single smooth sweep, then bobs at the right edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute z-10"
        style={{
          left: EDGE_INSET,
          top: "50%",
          willChange: "transform, opacity",
          opacity: phase === "idle" ? 0 : 1,
          transform:
            phase === "idle"
              ? `translate(0px, ${-PEN_SIZE / 2}px) rotate(-28deg)`
              : phase === "writing"
              ? `translate(${trackWidth}px, ${-PEN_SIZE / 2}px) rotate(-28deg)`
              : `translate(${trackWidth}px, ${-PEN_SIZE / 2}px) rotate(-22deg)`,
          transition:
            phase === "writing"
              ? `transform ${WRITE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 350ms ease-out`
              : phase === "resting"
              ? "transform 600ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "none",
        }}
      >
        {/* Gentle bob while resting */}
        <motion.span
          className="block text-white drop-shadow-[0_4px_10px_rgba(120,53,15,0.6)]"
          animate={
            phase === "resting"
              ? { y: [0, -3, 0, -2, 0], rotate: [0, 3, -1, 2, 0] }
              : { y: 0, rotate: 0 }
          }
          transition={
            phase === "resting"
              ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0 }
          }
        >
          <Feather size={PEN_SIZE} strokeWidth={2.05} />
        </motion.span>

        {/* Nib shimmer */}
        <motion.span
          aria-hidden
          className="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 rounded-full bg-white"
          animate={{
            opacity: phase === "writing" ? [0.4, 1, 0.4] : 0,
            scale: phase === "writing" ? [0.6, 1.3, 0.6] : 0.6,
          }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>

      {/* Ink sparks during the writing pass */}
      {phase === "writing" &&
        trackWidth > 0 &&
        sparks.map((s) => (
          <motion.span
            key={s.id}
            aria-hidden
            className="pointer-events-none absolute bottom-2 h-1 w-1 rounded-full bg-white/85"
            style={{ left: EDGE_INSET + 4 + s.at * trackWidth }}
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{
              y: [0, s.drift, s.drift * 1.5],
              opacity: [0, 1, 0],
              scale: [0.4, 1, 0.2],
            }}
            transition={{
              duration: 0.9,
              delay: s.delay,
              ease: "easeOut",
              repeat: Infinity,
              repeatDelay: 0.5,
            }}
          />
        ))}

      <span className="relative z-0 inline-block whitespace-nowrap">{label}</span>
    </Link>
  );
}

function useTypewriter(text: string, active: boolean, speed = 28) {
  const [typingState, setTypingState] = useState({ text, count: 0 });

  useEffect(() => {
    if (!active) return;

    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTypingState({ text, count: i });
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  if (!active || typingState.text !== text) return "";
  return text.slice(0, typingState.count);
}

function DemoVideoShowcase() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const enterFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    type FsTarget = HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    const target = v as FsTarget;
    if (typeof v.requestFullscreen === "function") {
      void v.requestFullscreen().catch(() => undefined);
    } else if (target.webkitRequestFullscreen) {
      void target.webkitRequestFullscreen();
    } else if (target.webkitEnterFullscreen) {
      target.webkitEnterFullscreen();
    } else if (target.msRequestFullscreen) {
      void target.msRequestFullscreen();
    }
  };

  const highlights = [
    {
      icon: Wand2,
      title: "From a sentence",
      body: "A premise becomes a planned, voiced book in minutes.",
    },
    {
      icon: Layers,
      title: "Chapter-aware drafting",
      body: "Each chapter is written with full memory of every word before it.",
    },
    {
      icon: ImageIcon,
      title: "Cover and atmosphere",
      body: "A bespoke cover and visual mood land alongside the prose.",
    },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      {/* Copy column */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.7, ease: smoothEase }}
      >
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
          <Play size={11} />
          See Folio in motion
        </span>
        <h2 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink-500 md:text-5xl">
          A studio that
          <br />
          <span className="gradient-text">writes with you</span>
        </h2>
        <p className="mt-5 max-w-md text-base leading-relaxed text-ink-300 md:text-lg">
          Watch a single idea travel through Folio&apos;s pipeline — from the
          first prompt, through planning and chapter drafting, to a finished
          illustrated book you can read end to end.
        </p>

        <ul className="mt-8 space-y-4">
          {highlights.map((h) => (
            <li key={h.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-ember-100 text-ember-600 ring-1 ring-ember-200/60">
                <h.icon size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-500">{h.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-300">
                  {h.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Video column */}
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.8, ease: smoothEase, delay: 0.1 }}
        className="relative"
      >
        {/* Soft ambient halos */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-6 -z-10 rounded-[36px] blur-3xl"
          style={{
            background:
              "radial-gradient(60% 70% at 30% 30%, rgba(201,125,48,0.18), transparent 70%), radial-gradient(50% 60% at 80% 70%, rgba(186,168,140,0.22), transparent 70%)",
          }}
        />

        {/* Subtle stacked paper behind the video card */}
        <motion.div
          aria-hidden
          className="absolute -inset-x-3 -bottom-3 top-3 -z-10 rounded-[28px] border border-parchment-300/70 bg-parchment-100/80"
          animate={{ rotate: [-1.1, -1.4, -1.1] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "blur(0.5px)" }}
        />

        <div className="glass-card group relative overflow-hidden rounded-[28px] p-3 shadow-warm-xl">
          {/* Window-chrome dots, like a polished demo capture */}
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-ember-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-dust-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-sage-400/80" />
            <span className="ml-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-200">
              folio.app — live demo
            </span>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-ink-500">
            <video
              ref={videoRef}
              src="/folio-demo.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="block h-full w-full"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {/* Soft inner edge for cinematic feel */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />

            {/* Bottom gradient + controls */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause demo" : "Play demo"}
                className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25"
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute demo" : "Mute demo"}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-white/25"
                >
                  {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  {muted ? "Tap to listen" : "Sound on"}
                </button>
                <button
                  type="button"
                  onClick={enterFullscreen}
                  aria-label="Open demo fullscreen"
                  className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25"
                >
                  <Maximize2 size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function LivingManuscript() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = manuscripts[index];
  const typed = useTypewriter(active.prompt, true, 26);
  const typingDone = typed.length >= active.prompt.length;

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % manuscripts.length);
    }, 9500);
    return () => clearTimeout(id);
  }, [index, paused]);

  return (
    <div
      className="relative mx-auto w-full max-w-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Stacked paper shadows behind */}
      <motion.div
        aria-hidden
        className="absolute inset-x-6 -bottom-3 top-6 rounded-[28px] bg-parchment-200/70 border border-parchment-300/60"
        style={{ filter: "blur(0.5px)" }}
        animate={{ rotate: [-1.2, -1.5, -1.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-x-3 -bottom-1 top-3 rounded-[28px] bg-parchment-100/90 border border-parchment-300/60"
        animate={{ rotate: [0.8, 1.1, 0.8] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* The page */}
      <motion.div
        className="relative glass-card rounded-[28px] overflow-hidden"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: smoothEase }}
      >
        {/* Accent wash */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ember-100/40 via-transparent to-dust-100/30" />
        {/* Top binding line */}
        <div className="pointer-events-none absolute left-10 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-parchment-300/70 to-transparent" />

        <div className="relative px-10 pt-9 pb-10 sm:px-14 sm:pt-11 sm:pb-12">
          {/* Eyebrow */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-ember-500"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <AnimatePresence mode="wait">
                <motion.span
                  key={active.genre}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="text-[10px] uppercase tracking-[0.24em] font-semibold text-ember-600"
                >
                  {active.genre}
                </motion.span>
              </AnimatePresence>
            </div>
            <span className="text-[10px] uppercase tracking-[0.24em] font-medium text-ink-200">
              From idea · to book
            </span>
          </div>

          {/* Prompt (typewriter) */}
          <div className="min-h-[5.5rem] sm:min-h-[4.5rem]">
            <p className="font-serif text-xl sm:text-2xl text-ink-500 leading-snug italic">
              <span className="text-ember-500 mr-1 not-italic">“</span>
              {typed}
              <motion.span
                aria-hidden
                className="inline-block w-[2px] h-[1em] align-[-2px] bg-ink-400 ml-0.5"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
              {typingDone && (
                <span className="text-ember-500 ml-1 not-italic">”</span>
              )}
            </p>
          </div>

          {/* Ornament divider */}
          <div className="flex items-center gap-3 my-7">
            <motion.div
              className="h-px bg-gradient-to-r from-transparent via-parchment-300 to-transparent flex-1"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: typingDone ? 1 : 0 }}
              transition={{ duration: 0.8, ease: smoothEase }}
              style={{ transformOrigin: "right" }}
            />
            <motion.div
              animate={{ rotate: typingDone ? 360 : 0, opacity: typingDone ? 1 : 0 }}
              transition={{ duration: 1.4, ease: smoothEase }}
              className="text-ember-500"
            >
              <Sparkles size={13} />
            </motion.div>
            <motion.div
              className="h-px bg-gradient-to-r from-transparent via-parchment-300 to-transparent flex-1"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: typingDone ? 1 : 0 }}
              transition={{ duration: 0.8, ease: smoothEase }}
              style={{ transformOrigin: "left" }}
            />
          </div>

          {/* Title */}
          <AnimatePresence mode="wait">
            <motion.h3
              key={active.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: typingDone ? 1 : 0,
                y: typingDone ? 0 : 10,
              }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.6, ease: smoothEase, delay: 0.1 }}
              className="font-serif text-2xl sm:text-3xl font-bold text-ink-500 mb-5"
            >
              {active.title}
            </motion.h3>
          </AnimatePresence>

          {/* Chapter list — cascades in */}
          <ul className="space-y-2.5">
            <AnimatePresence mode="wait">
              {active.chapters.map((ch, i) => (
                <motion.li
                  key={`${active.title}-${ch}`}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{
                    opacity: typingDone ? 1 : 0,
                    x: typingDone ? 0 : -12,
                  }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{
                    duration: 0.5,
                    ease: smoothEase,
                    delay: typingDone ? 0.25 + i * 0.12 : 0,
                  }}
                  className="flex items-baseline gap-4 group"
                >
                  <span className="font-serif text-xs uppercase tracking-[0.2em] text-ember-500/80 w-8 text-right">
                    {ROMAN[i]}.
                  </span>
                  <span className="flex-1 font-serif text-base sm:text-lg text-ink-400 group-hover:text-ink-500 transition-colors">
                    {ch}
                  </span>
                  <motion.span
                    className="h-px bg-parchment-300/80 flex-1 max-w-[120px] opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-hidden
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {/* Footer: nav dots + pause hint */}
          <div className="flex items-center justify-between mt-9 pt-6 border-t border-parchment-300/50">
            <div className="flex items-center gap-2">
              {manuscripts.map((m, i) => (
                <button
                  key={m.title}
                  onClick={() => setIndex(i)}
                  aria-label={`Show ${m.title}`}
                  className="group relative h-1.5 cursor-pointer"
                  style={{ width: i === index ? 28 : 10 }}
                >
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    animate={{
                      backgroundColor:
                        i === index
                          ? "rgb(217, 119, 6)"
                          : "rgba(120, 113, 108, 0.25)",
                      width: "100%",
                    }}
                    transition={{ duration: 0.4, ease: smoothEase }}
                  />
                </button>
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-ink-200">
              {paused ? "Paused" : `${index + 1} / ${manuscripts.length}`}
            </span>
          </div>

          {/* Sweeping shimmer across the page when a new manuscript begins */}
          <motion.div
            key={`shimmer-${index}`}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-1/3"
            initial={{ x: "-120%", opacity: 0 }}
            animate={{ x: "420%", opacity: [0, 0.45, 0] }}
            transition={{ duration: 1.8, ease: smoothEase }}
            style={{
              background:
                "linear-gradient(110deg, transparent, rgba(255, 241, 214, 0.7), transparent)",
            }}
          />
        </div>
      </motion.div>

      {/* Floating ornaments */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-8 top-8 text-ember-400/70"
        animate={{ y: [0, -6, 0], rotate: [0, 6, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <Feather size={22} />
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-6 bottom-10 text-dust-400/80"
        animate={{ y: [0, 8, 0], rotate: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <BookOpen size={20} />
      </motion.div>
    </div>
  );
}

function CapabilityRibbon() {
  return (
    <section id="capabilities" className="relative z-10 mx-auto max-w-6xl px-8 pb-32">
      <motion.div
        className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: smoothEase }}
      >
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-ember-600">
            Capability map
          </p>
          <h2 className="font-serif text-3xl font-bold text-ink-500 md:text-4xl">
            Everything moves through one calm studio
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-ink-300">
          Capture source material, approve the structure, generate chapters,
          design covers, and keep the result saved to your account.
        </p>
      </motion.div>

      <div className="glass-card overflow-hidden rounded-3xl p-5">
        <div className="relative rounded-2xl border border-parchment-300/70 bg-parchment-50/70 p-5">
          <motion.div
            aria-hidden
            className="absolute left-8 right-8 top-1/2 hidden h-px bg-gradient-to-r from-ember-200 via-sage-500/50 to-dust-200 md:block"
            initial={{ scaleX: 0, opacity: 0 }}
            whileInView={{ scaleX: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: smoothEase }}
            style={{ transformOrigin: "left" }}
          />
          <div className="relative grid gap-4 md:grid-cols-6">
            {capabilityCards.map((card, index) => (
              <motion.div
                key={card.title}
                className="rounded-2xl border border-parchment-300/70 bg-white/80 p-4 shadow-warm-sm"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease: smoothEase, delay: index * 0.08 }}
              >
                <motion.div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-ink-500 text-parchment-50"
                  animate={{ y: [0, -4, 0] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: index * 0.18,
                  }}
                >
                  <card.icon size={17} />
                </motion.div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-600">
                  {card.label}
                </p>
                <h3 className="mt-2 font-serif text-lg font-semibold text-ink-500">
                  {card.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-300">
                  {card.body}
                </p>
              </motion.div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-parchment-300/60 pt-5 text-xs text-ink-300">
            {["Private library", "Persistent jobs", "Cover retries", "Reader mode", "Export-ready"].map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-warm-sm"
              >
                <CheckCircle2 size={12} className="text-sage-500" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniLibraryCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeBook = dashboardBooks[activeIndex];

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex((index) => (index + 1) % dashboardBooks.length);
    }, 5200);
    return () => clearInterval(id);
  }, []);

  return (
    <section id="library" className="relative z-10 mx-auto max-w-6xl px-8 pb-32">
      <motion.div
        className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: smoothEase }}
      >
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-ember-600">
            Mini library
          </p>
          <h2 className="font-serif text-3xl font-bold text-ink-500 md:text-4xl">
            Browse example books before signing up
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-ink-300">
          A visitor-facing preview of the same sample shelf used in the library.
          Explore covers, genres, page scope, and story premises before creating
          an account.
        </p>
      </motion.div>

      <div className="glass-card overflow-hidden rounded-3xl p-5">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-parchment-300/70 bg-ink-500 p-6 text-parchment-50">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeBook.id}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.98 }}
                transition={{ duration: 0.45, ease: smoothEase }}
                className="relative z-10 flex h-full flex-col"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ember-300">
                    Featured read
                  </span>
                  <span className="text-xs text-parchment-400">
                    {activeIndex + 1} / {dashboardBooks.length}
                  </span>
                </div>

                <div className="mt-8 grid flex-1 gap-6 sm:grid-cols-[170px_1fr] sm:items-center">
                  <div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden rounded-xl shadow-warm-xl sm:w-full">
                    {activeBook.coverImageUrl ? (
                      <Image
                        src={activeBook.coverImageUrl}
                        alt={`${activeBook.title} cover`}
                        fill
                        sizes="170px"
                        className="object-cover"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background: `linear-gradient(160deg, ${activeBook.coverFrom}, ${activeBook.coverVia}, ${activeBook.coverTo})`,
                        }}
                      />
                    )}
                  </div>

                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-ember-300">
                      {activeBook.genre}
                    </p>
                    <h3 className="font-serif text-4xl font-bold leading-tight text-parchment-50">
                      {activeBook.title}
                    </h3>
                    <p className="mt-4 max-w-lg text-sm leading-relaxed text-parchment-300">
                      {activeBook.synopsis}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2 text-xs text-parchment-300">
                      <span className="rounded-full bg-white/8 px-3 py-1.5">
                        {activeBook.wordCount.toLocaleString()} words
                      </span>
                      <span className="rounded-full bg-white/8 px-3 py-1.5">
                        {activeBook.chapterCount} chapters
                      </span>
                      <span className="rounded-full bg-white/8 px-3 py-1.5">
                        {activeBook.tone}
                      </span>
                    </div>
                    <Link
                      href={`/reader?sample=${encodeURIComponent(activeBook.id)}`}
                      className="mt-7 inline-flex items-center gap-2 rounded-xl bg-ember-500 px-5 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
                    >
                      Open sample reader
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
            <motion.div
              aria-hidden
              className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-ember-500/20 blur-[80px]"
              animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.75, 0.45] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {dashboardBooks.map((book, index) => {
              const active = index === activeIndex;
              return (
                <motion.button
                  key={book.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`group flex min-h-[126px] cursor-pointer gap-4 rounded-2xl border p-3 text-left transition-all ${
                    active
                      ? "border-ember-300 bg-ember-100/45 shadow-warm"
                      : "border-parchment-300/70 bg-white/72 hover:border-ember-200 hover:bg-white"
                  }`}
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3 }}
                  whileHover={{ y: -2 }}
                >
                  <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg shadow-warm-sm">
                    {book.coverImageUrl ? (
                      <Image
                        src={book.coverImageUrl}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background: `linear-gradient(160deg, ${book.coverFrom}, ${book.coverVia}, ${book.coverTo})`,
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-serif text-base font-semibold text-ink-500">
                        {book.title}
                      </p>
                      <motion.span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          active ? "bg-ember-500" : "bg-parchment-300"
                        }`}
                        animate={active ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                        transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ember-600">
                      {book.genre}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-300">
                      {book.synopsis}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingPreview() {
  return (
    <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-8 pb-32">
      <motion.div
        className="mb-10 text-center"
        initial={false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: smoothEase }}
      >
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          <BadgeDollarSign size={12} />
          Pricing
        </p>
        <h2 className="font-serif text-3xl font-bold text-ink-500 md:text-4xl">
          Start free, move to Pro when the book gets serious
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-300">
          Free is wired for GPT-5.4 mini. Pro is wired for GPT-5.5 and is the
          current beta default while payments are off.
        </p>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-2">
        {pricingPlans.map((plan, index) => (
          <motion.div
            key={plan.name}
            className={
              plan.featured
                ? "relative rounded-3xl bg-ink-500 p-6 text-parchment-50 shadow-warm-xl"
                : "glass-card rounded-3xl p-6"
            }
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.08, duration: 0.5 }}
          >
            {plan.featured && (
              <span className="absolute right-5 top-5 rounded-full bg-ember-500 px-3 py-1 text-xs font-medium text-white">
                Popular
              </span>
            )}
            <h3 className="font-serif text-2xl font-bold">{plan.name}</h3>
            <div className="mt-5 flex items-end gap-2">
              <span className="font-serif text-4xl font-bold">{plan.price}</span>
              <span className={plan.featured ? "mb-1 text-parchment-400" : "mb-1 text-ink-300"}>
                {plan.cadence}
              </span>
            </div>
            <p className={plan.featured ? "mt-4 text-sm leading-relaxed text-parchment-300" : "mt-4 text-sm leading-relaxed text-ink-300"}>
              {plan.summary}
            </p>
            <div
              className={
                plan.featured
                  ? "mt-5 rounded-2xl border border-white/10 bg-white/8 p-4"
                  : "mt-5 rounded-2xl border border-parchment-300/70 bg-white/65 p-4"
              }
            >
              <p
                className={
                  plan.featured
                    ? "text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-300"
                    : "text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-600"
                }
              >
                Generation model
              </p>
              <p className="mt-1 font-serif text-xl font-semibold">
                {plan.modelLabel}
              </p>
            </div>
            <div className="mt-5 space-y-2">
              {plan.features.slice(0, 4).map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm">
                  <CheckCircle2
                    size={15}
                    className={plan.featured ? "text-ember-300" : "text-sage-500"}
                  />
                  <span className={plan.featured ? "text-parchment-200" : "text-ink-300"}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-7 text-center">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 rounded-xl border border-parchment-300 bg-white/70 px-5 py-3 text-sm font-medium text-ink-400 shadow-warm-sm transition hover:bg-white"
        >
          View full pricing
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user, signedIn } = useAuthUser();

  return (
    <div className="min-h-screen bg-parchment-100 overflow-hidden">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-ember-200/30 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full bg-dust-200/25 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-parchment-200/40 blur-[140px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <BrandLogo markClassName="h-7 w-7" />
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {[
            ["Product", "/product"],
            ["Pricing", "/pricing"],
            ["About", "/about"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:bg-parchment-200/60 hover:text-ink-500"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {!signedIn && (
            <Link
              href="/signin"
              className="text-sm font-medium text-ink-300 hover:text-ink-500 transition-colors px-3 py-2 rounded-lg hover:bg-parchment-200/60"
            >
              Sign in
            </Link>
          )}
          <Link
            href={signedIn ? "/dashboard" : "/signup"}
            className="flex items-center gap-1.5 px-4 py-2 bg-ink-500 hover:bg-ink-400 text-parchment-50 text-sm font-medium rounded-lg transition-all duration-150 shadow-warm-sm hover:shadow-warm"
          >
            {signedIn ? "Dashboard" : "Start free"}
            <ArrowRight size={13} />
          </Link>
          <AccountMenu user={user} variant="light" />
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 pt-24 pb-20 text-center">
        <motion.div
          initial={false}
          animate="visible"
          custom={0}
          variants={fadeUp}
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember-100 border border-ember-200 text-ember-600 text-xs font-medium mb-8">
            <Sparkles size={11} />
            Powered by AI · Built for storytellers
          </span>
        </motion.div>

        <motion.h1
          className="font-serif text-5xl md:text-7xl font-bold text-ink-500 leading-[1.1] tracking-tight mb-8"
          initial={false}
          animate="visible"
          custom={0.1}
          variants={fadeUp}
        >
          Turn any idea into
          <br />
          <span className="gradient-text">a beautiful book</span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-ink-300 leading-relaxed max-w-2xl mx-auto mb-12"
          initial={false}
          animate="visible"
          custom={0.2}
          variants={fadeUp}
        >
          Write a premise. Upload notes. Paste an outline. Folio&apos;s AI pipeline
          structures your idea into a full multi-chapter book — complete with
          illustrations, in a beautiful reading experience.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={false}
          animate="visible"
          custom={0.3}
          variants={fadeUp}
        >
          <FeatherPenCTA
            href={signedIn ? "/dashboard" : "/signup"}
            label={signedIn ? "Return to dashboard" : "Start creating - it's free"}
          />
          <Link
            href="/reader"
            className="flex items-center gap-2 px-7 py-3.5 bg-white/70 hover:bg-white/90 text-ink-400 text-base font-medium rounded-xl border border-parchment-300/60 transition-all duration-200 shadow-warm-sm hover:shadow-warm backdrop-blur-sm"
          >
            <BookOpen size={16} />
            See an example book
          </Link>
        </motion.div>
      </section>
      {/* Reading proposition */}
      <section className="relative z-10 mx-auto max-w-5xl px-8 pb-24">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.65, ease: smoothEase }}
        >
          <p className="font-serif text-3xl font-bold leading-tight text-ink-500 md:text-5xl">
            Start reading books
            <br />
            <span className="gradient-text">created from your own ideas.</span>
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-300 md:text-lg">
            For the first time, your notes, prompts, and half-formed concepts
            can become polished books written for you, ready to open in a
            private reader and enjoy end to end.
          </p>
        </motion.div>
      </section>


      {/* Demo video — Folio in motion */}
      <section className="relative z-10 mx-auto max-w-6xl px-8 pb-28">
        <DemoVideoShowcase />
      </section>

      {/* Living manuscript — interactive idea → book preview */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-28">
        <LivingManuscript />
      </section>

      <MiniLibraryCarousel />

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-32">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-500 mb-4">
            A creative engine, not a chatbot
          </h2>
          <p className="text-ink-300 text-lg max-w-xl mx-auto">
            Folio runs a structured pipeline behind the scenes so your book stays
            coherent from first chapter to last.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="glass-card rounded-2xl p-7 group hover:shadow-glass-lg transition-shadow duration-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1],
                delay: i * 0.08,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-ember-100 border border-ember-200/60 flex items-center justify-center mb-5 group-hover:bg-ember-200/60 transition-colors">
                <f.icon size={18} className="text-ember-600" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-ink-500 mb-3">
                {f.title}
              </h3>
              <p className="text-ink-300 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <CapabilityRibbon />

      <PricingPreview />

      {/* CTA section */}
      <section className="relative z-10 max-w-3xl mx-auto px-8 pb-32 text-center">
        <motion.div
          className="glass-card rounded-3xl p-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-500 mb-5">
            Bring your idea.
            <br />
            Leave with a book.
          </h2>
          <p className="text-ink-300 text-lg mb-10 max-w-md mx-auto">
            No prompting expertise needed. No setup. Just your idea and a few
            minutes.
          </p>
          <Link
            href={signedIn ? "/dashboard" : "/signup"}
            className="inline-flex items-center gap-2 px-8 py-4 bg-ember-500 hover:bg-ember-600 text-white text-base font-medium rounded-xl transition-all duration-200 shadow-ember hover:shadow-ember-lg hover:-translate-y-0.5"
          >
            <Feather size={16} />
            {signedIn ? "Return to your dashboard" : "Create your first book"}
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-parchment-300/50 py-8 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo
              markClassName="h-5 w-5"
              textClassName="text-sm text-ink-300"
            />
          </div>
          <p className="text-xs text-ink-200">
            © 2026 Folio · An AI book-writing platform
          </p>
        </div>
      </footer>
    </div>
  );
}
