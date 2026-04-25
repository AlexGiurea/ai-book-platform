"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Feather,
  FileText,
  ImageIcon,
  Orbit,
  Sparkles,
} from "lucide-react";
import Navbar from "@/components/Navbar";

const stages = [
  {
    icon: Sparkles,
    title: "Dream Capture",
    copy: "Start with a sentence, a scene, uploaded notes, or a messy world bible.",
    x: "12%",
    y: "20%",
  },
  {
    icon: Brain,
    title: "Story Memory",
    copy: "Folio turns your blueprint into canon, characters, locations, and retrievable context.",
    x: "67%",
    y: "14%",
  },
  {
    icon: Feather,
    title: "Chapter Forge",
    copy: "A writer agent drafts in batches, carrying voice, plot, and emotional threads forward.",
    x: "38%",
    y: "45%",
  },
  {
    icon: ImageIcon,
    title: "Visual Atmosphere",
    copy: "Cover art and visual direction grow from the book's actual world, not a generic prompt.",
    x: "76%",
    y: "62%",
  },
  {
    icon: BookOpen,
    title: "Living Reader",
    copy: "The finished book opens in a soft, immersive reader built for enjoying the work.",
    x: "18%",
    y: "72%",
  },
];

const capabilities = [
  "Long-form planning before writing",
  "Approval gate before chapters begin",
  "Persistent project storage",
  "Memory retrieval for continuity",
  "Generated covers and regeneration",
  "Dashboard and immersive reader",
];

function ProductConstellation() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 70, damping: 18 });
  const springY = useSpring(mouseY, { stiffness: 70, damping: 18 });
  const rotateX = useTransform(springY, [-240, 240], [8, -8]);
  const rotateY = useTransform(springX, [-240, 240], [-10, 10]);

  return (
    <motion.div
      className="relative h-[620px] overflow-hidden rounded-[2rem] border border-white/60 bg-parchment-50/75 shadow-glass backdrop-blur-xl"
      style={{ rotateX, rotateY, transformPerspective: 1200 }}
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        mouseX.set(event.clientX - bounds.left - bounds.width / 2);
        mouseY.set(event.clientY - bounds.top - bounds.height / 2);
      }}
      onMouseLeave={() => {
        mouseX.set(0);
        mouseY.set(0);
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(201,125,48,0.20),transparent_34%),radial-gradient(circle_at_78%_20%,rgba(139,132,176,0.22),transparent_28%),radial-gradient(circle_at_20%_78%,rgba(122,158,119,0.18),transparent_30%)]" />
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ember-300/50"
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dust-500/30"
        animate={{ rotate: -360 }}
        transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute left-1/2 top-1/2 z-10 flex h-40 w-40 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] bg-ink-500 text-parchment-50 shadow-warm-xl">
        <div className="text-center">
          <Orbit className="mx-auto mb-3 text-ember-300" size={28} />
          <p className="font-serif text-2xl font-semibold">Folio</p>
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-parchment-300">
            creative engine
          </p>
        </div>
      </div>
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        {stages.map((stage) => (
          <line
            key={stage.title}
            x1="50%"
            y1="50%"
            x2={stage.x}
            y2={stage.y}
            stroke="#C97D30"
            strokeOpacity="0.22"
            strokeWidth="2"
          />
        ))}
      </svg>
      {stages.map((stage, index) => (
        <motion.div
          key={stage.title}
          className="absolute z-20 w-56 rounded-3xl border border-white/70 bg-white/70 p-5 shadow-warm backdrop-blur-xl"
          style={{ left: stage.x, top: stage.y }}
          initial={{ opacity: 0, scale: 0.88, y: 18 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.12, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ y: -8, scale: 1.03 }}
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-ember-100 text-ember-600">
            <stage.icon size={19} />
          </div>
          <h3 className="font-serif text-lg font-semibold text-ink-500">{stage.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">{stage.copy}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

export default function ProductPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-parchment-100">
      <Navbar />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -left-40 top-0 h-[560px] w-[560px] rounded-full bg-ember-200/35 blur-[120px]" />
        <div className="absolute -right-32 bottom-0 h-[520px] w-[520px] rounded-full bg-dust-200/45 blur-[110px]" />
      </div>

      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-32">
        <motion.div
          className="mx-auto mb-14 max-w-3xl text-center"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
            <Sparkles size={12} />
            Product
          </span>
          <h1 className="mt-7 font-serif text-5xl font-bold leading-[1.05] tracking-tight text-ink-500 md:text-7xl">
            A book studio that behaves like a living imagination.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-300 md:text-xl">
            Folio is not a blank chat box. It is an agentic creative system that
            plans, remembers, writes, illustrates, and assembles your idea into a
            book you can actually read.
          </p>
        </motion.div>

        <ProductConstellation />
      </section>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-6 px-6 pb-24 md:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          className="glass-card rounded-[2rem] p-8 md:p-10"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          <FileText className="mb-8 text-ember-500" size={30} />
          <h2 className="font-serif text-3xl font-semibold text-ink-500 md:text-4xl">
            The architecture is designed for coherence.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-300">
            A planner builds the story bible first. The user approves it. Then a
            writer agent drafts the book in durable batches while retrieval
            keeps prior canon and generated prose close at hand.
          </p>
          <Link
            href="/create"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-ink-500 px-6 py-3 text-sm font-medium text-parchment-50 shadow-warm transition hover:bg-ink-400"
          >
            Start creating
            <ArrowRight size={15} />
          </Link>
        </motion.div>

        <motion.div
          className="rounded-[2rem] border border-ink-500/10 bg-ink-500 p-8 text-parchment-50 shadow-warm-xl md:p-10"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-sm uppercase tracking-[0.28em] text-ember-300">Inside Folio</p>
          <div className="mt-8 grid gap-4">
            {capabilities.map((capability, index) => (
              <motion.div
                key={capability}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/6 p-4"
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + index * 0.05, duration: 0.5 }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ember-400 text-xs font-semibold text-ink-500">
                  {index + 1}
                </span>
                <span className="text-sm text-parchment-200">{capability}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
    </main>
  );
}
