"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Compass,
  FileText,
  Library,
  PenLine,
  Sparkles,
  Wand2,
} from "lucide-react";
import Navbar from "@/components/Navbar";

const smoothEase = [0.16, 1, 0.3, 1] as const;

const stages = [
  {
    id: "spark",
    icon: Sparkles,
    label: "Spark",
    title: "The first sentence becomes a world",
    body: "Drop in a rough premise, a scene, a research note, or a character fragment. Folio treats it like source material, not a command.",
    artifact: "A living creative brief",
    sample: "A lighthouse keeper receives letters dated before he was born.",
  },
  {
    id: "map",
    icon: Compass,
    label: "Map",
    title: "The story gets architecture",
    body: "The system builds a story bible with chapters, arcs, continuity, tone, setting rules, and open questions for approval.",
    artifact: "A reviewable book blueprint",
    sample: "11 chapters, 4 character arcs, 38 continuity anchors.",
  },
  {
    id: "draft",
    icon: PenLine,
    label: "Draft",
    title: "Chapters arrive with memory",
    body: "Writing happens in durable batches that remember the plan and recent prose, so the book can grow without losing itself.",
    artifact: "A coherent manuscript",
    sample: "Batch 19 is writing the storm sequence with prior context.",
  },
  {
    id: "form",
    icon: BookOpen,
    label: "Form",
    title: "The manuscript becomes an object",
    body: "Folio pairs the draft with cover direction, reader controls, metadata, and account storage so it feels like a book you can return to.",
    artifact: "A private finished book",
    sample: "Cover saved, reader ready, library indexed.",
  },
];

const craftSignals = [
  "Canon-aware generation",
  "Blueprint approval gate",
  "Chapter memory",
  "Cover direction",
  "Private library",
  "Plan-based model routing",
];

export default function ProductPage() {
  const [active, setActive] = useState(0);
  const current = stages[active];
  const ActiveIcon = current.icon;

  return (
    <div className="min-h-screen overflow-hidden bg-parchment-100">
      <Navbar />
      <main className="relative mx-auto max-w-7xl px-6 pb-24 pt-28">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-[-12rem] top-20 h-[34rem] w-[34rem] rounded-full bg-ember-100/55 blur-[110px]" />
          <div className="absolute bottom-[-10rem] right-[-8rem] h-[30rem] w-[30rem] rounded-full bg-dust-100/45 blur-[110px]" />
        </div>

        <section className="relative grid min-h-[680px] gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10"
          >
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
              <Wand2 size={12} />
              Product
            </span>
            <h1 className="font-serif text-5xl font-bold leading-tight text-ink-500 md:text-7xl">
              A book engine that feels like opening a secret room
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
              Folio is not a blank chatbot. It is a staged creative environment
              where an idea moves through memory, structure, drafting, cover
              direction, and a private reader.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ember-500 px-6 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
              >
                Start creating
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/reader"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-parchment-300 bg-white/70 px-6 py-3 text-sm font-medium text-ink-400 shadow-warm-sm transition hover:bg-white"
              >
                <BookOpen size={15} />
                Open sample book
              </Link>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-2 gap-3">
              {craftSignals.map((signal) => (
                <div
                  key={signal}
                  className="flex items-center gap-2 rounded-xl border border-parchment-300/70 bg-white/65 px-3 py-2 text-sm text-ink-300 shadow-warm-sm"
                >
                  <CheckCircle2 size={14} className="text-sage-500" />
                  {signal}
                </div>
              ))}
            </div>
          </motion.div>

          <div className="relative z-10 min-h-[500px] lg:min-h-[560px]">
            <motion.div
              aria-hidden
              className="absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember-200/25 blur-3xl"
              animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.7, 0.45] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute left-1/2 top-1/2 w-full max-w-[31rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[2rem] border border-parchment-300/70 bg-ink-500 p-6 text-parchment-50 shadow-warm-xl"
              whileHover={{ y: -6, rotate: 0.4 }}
              transition={{ duration: 0.35, ease: smoothEase }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(244,160,67,0.24),transparent_32%),radial-gradient(circle_at_82%_80%,rgba(139,132,176,0.22),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%)]" />
              <motion.div
                aria-hidden
                className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-ember-300/25"
                animate={{ rotate: 360 }}
                transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                aria-hidden
                className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full border border-parchment-50/10"
                animate={{ rotate: -360 }}
                transition={{ duration: 44, repeat: Infinity, ease: "linear" }}
              />

              <div className="relative z-10 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-parchment-300/70">
                <span>Folio Engine</span>
                <motion.span
                  animate={{ opacity: [0.45, 1, 0.45] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  Live
                </motion.span>
              </div>

              <div className="relative z-10 mt-7 grid grid-cols-4 gap-2">
                {stages.map((stage, index) => {
                  const Icon = stage.icon;
                  const selected = index === active;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setActive(index)}
                      className={`group rounded-2xl border p-3 text-left transition ${
                        selected
                          ? "border-ember-300 bg-ember-500 text-white shadow-ember"
                          : "border-white/10 bg-white/7 text-parchment-300 hover:border-white/20 hover:bg-white/12"
                      }`}
                    >
                      <Icon size={17} />
                      <span className="mt-2 block text-[11px] font-semibold">
                        {stage.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative z-10 mt-5 rounded-[1.7rem] border border-white/10 bg-parchment-50/96 p-5 text-ink-500 shadow-warm-xl backdrop-blur">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.38, ease: smoothEase }}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-500 text-parchment-50 shadow-warm-sm">
                      <ActiveIcon size={20} />
                    </div>
                    <span className="rounded-full bg-ember-100 px-3 py-1 text-[11px] font-medium text-ember-700">
                      {current.artifact}
                    </span>
                  </div>
                  <h2 className="font-serif text-2xl font-bold leading-tight">
                    {current.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink-300">
                    {current.body}
                  </p>
                  <div className="mt-4 rounded-2xl border border-parchment-300 bg-white/80 p-3">
                    <p className="font-serif text-base leading-snug text-ink-500">
                      {current.sample}
                    </p>
                  </div>
                </motion.div>
              </div>

              <div className="relative z-10 mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-ember-500"
                  animate={{ width: `${((active + 1) / stages.length) * 100}%` }}
                  transition={{ duration: 0.45, ease: smoothEase }}
                />
              </div>
            </motion.div>
          </div>
        </section>

        <section className="relative z-10 mt-10 grid gap-5 lg:grid-cols-3">
          {[
            {
              icon: Brain,
              title: "Memory before words",
              body: "Folio stores the plan, batches, events, covers, and ownership so each creative step has context.",
            },
            {
              icon: FileText,
              title: "Approval before scale",
              body: "Users can inspect the blueprint before the book starts writing, which keeps authors in the loop.",
            },
            {
              icon: Library,
              title: "A shelf, not an export pile",
              body: "Finished work lands in a private library with covers, metadata, reader views, and project state.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-3xl border border-parchment-300/70 bg-white/65 p-6 shadow-warm-sm"
            >
              <Icon size={20} className="mb-5 text-ember-600" />
              <h3 className="font-serif text-2xl font-semibold text-ink-500">
                {title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-300">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
