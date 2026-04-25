"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Feather,
  ImageIcon,
  Layers,
  Sparkles,
  Wand2,
} from "lucide-react";

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

// ── Feather-pen CTA: pen writes the text in, then rests to the left, floating
function FeatherPenCTA() {
  const WRITE_MS = 1900;
  const [phase, setPhase] = useState<"writing" | "resting">("writing");

  useEffect(() => {
    const t = setTimeout(() => setPhase("resting"), WRITE_MS + 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <Link
      href="/create"
      className="group relative flex items-center justify-center px-7 py-3.5 bg-ember-500 hover:bg-ember-600 text-white text-base font-medium rounded-xl transition-all duration-200 shadow-ember hover:shadow-ember-lg hover:-translate-y-0.5 overflow-visible"
    >
      {/* Feather pen */}
      <motion.span
        aria-hidden
        className="absolute pointer-events-none z-10 origin-bottom-left"
        initial={{
          left: 24,
          top: -4,
          rotate: -32,
          opacity: 0,
          scale: 0.9,
        }}
        animate={
          phase === "writing"
            ? {
                left: [24, 265],
                top: [-4, -10, -2, -8, -4],
                rotate: [-32, -28, -34, -28, -30],
                opacity: [0, 1, 1, 1, 1],
                scale: 1,
              }
            : {
                left: -26,
                top: 0,
                rotate: -18,
                opacity: 1,
                scale: 1,
              }
        }
        transition={
          phase === "writing"
            ? {
                duration: WRITE_MS / 1000,
                ease: "linear",
                opacity: { duration: 0.35, ease: "easeOut" },
              }
            : {
                left: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
                top: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
                rotate: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
              }
        }
      >
        <motion.span
          className="block text-white drop-shadow-[0_3px_6px_rgba(120,53,15,0.55)]"
          animate={
            phase === "resting"
              ? { y: [0, -5, 0], rotate: [0, 4, 0] }
              : { y: 0, rotate: 0 }
          }
          transition={
            phase === "resting"
              ? {
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              : { duration: 0 }
          }
        >
          <Feather size={20} strokeWidth={2.1} />
        </motion.span>
      </motion.span>

      {/* Tiny ink-trail dots under the nib during writing */}
      {phase === "writing" && (
        <motion.span
          aria-hidden
          className="absolute left-6 bottom-2 h-[2px] bg-white/50 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: 235 }}
          transition={{ duration: WRITE_MS / 1000, ease: "linear" }}
        />
      )}

      {/* Text with left-to-right reveal */}
      <motion.span
        className="inline-block whitespace-nowrap"
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: WRITE_MS / 1000, ease: "linear" }}
      >
        Start creating — it&apos;s free
      </motion.span>
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

export default function LandingPage() {
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
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-ember-500 flex items-center justify-center shadow-ember">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="font-serif text-lg font-semibold text-ink-500 tracking-tight">
            Folio
          </span>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/product"
            className="text-sm font-medium text-ink-300 hover:text-ink-500 transition-colors px-3 py-2 rounded-lg hover:bg-parchment-200/60"
          >
            Product
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-ink-300 hover:text-ink-500 transition-colors px-3 py-2 rounded-lg hover:bg-parchment-200/60"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium text-ink-300 hover:text-ink-500 transition-colors px-3 py-2 rounded-lg hover:bg-parchment-200/60"
          >
            About
          </Link>
          <Link
            href="/create"
            className="flex items-center gap-1.5 px-4 py-2 bg-ink-500 hover:bg-ink-400 text-parchment-50 text-sm font-medium rounded-lg transition-all duration-150 shadow-warm-sm hover:shadow-warm"
          >
            Start creating
            <ArrowRight size={13} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 pt-24 pb-20 text-center">
        <motion.div
          initial="hidden"
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
          initial="hidden"
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
          initial="hidden"
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
          initial="hidden"
          animate="visible"
          custom={0.3}
          variants={fadeUp}
        >
          <FeatherPenCTA />
          <Link
            href="/reader"
            className="flex items-center gap-2 px-7 py-3.5 bg-white/70 hover:bg-white/90 text-ink-400 text-base font-medium rounded-xl border border-parchment-300/60 transition-all duration-200 shadow-warm-sm hover:shadow-warm backdrop-blur-sm"
          >
            <BookOpen size={16} />
            See an example book
          </Link>
        </motion.div>
      </section>

      {/* Living manuscript — interactive idea → book preview */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-28">
        <LivingManuscript />
      </section>

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
            href="/create"
            className="inline-flex items-center gap-2 px-8 py-4 bg-ember-500 hover:bg-ember-600 text-white text-base font-medium rounded-xl transition-all duration-200 shadow-ember hover:shadow-ember-lg hover:-translate-y-0.5"
          >
            <Feather size={16} />
            Create your first book
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-parchment-300/50 py-8 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-ember-500 flex items-center justify-center">
              <Sparkles size={10} className="text-white" />
            </div>
            <span className="font-serif text-sm font-semibold text-ink-300">
              Folio
            </span>
          </div>
          <p className="text-xs text-ink-200">
            © 2026 Folio · An AI book-writing platform
          </p>
        </div>
      </footer>
    </div>
  );
}
