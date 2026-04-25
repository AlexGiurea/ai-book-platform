"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  FilePenLine,
  ImageIcon,
  Layers,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import Navbar from "@/components/Navbar";

const steps = [
  {
    icon: FilePenLine,
    title: "Capture",
    body: "Add the premise, notes, files, characters, world rules, and style preferences.",
    output: "Raw source material",
  },
  {
    icon: Layers,
    title: "Plan",
    body: "Folio creates the story bible: chapters, voice, themes, structure, and continuity flags.",
    output: "Reviewable blueprint",
  },
  {
    icon: BookOpenCheck,
    title: "Approve",
    body: "You approve the plan or regenerate it before any long-form prose is written.",
    output: "Locked direction",
  },
  {
    icon: ScrollText,
    title: "Write",
    body: "The writer drafts in durable batches and logs progress, word count, and chapter state.",
    output: "Chapter manuscript",
  },
  {
    icon: ImageIcon,
    title: "Finish",
    body: "Cover generation, reader assembly, and library storage complete the book package.",
    output: "Readable book",
  },
];

export default function WorkflowPage() {
  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-28">
        <section className="mx-auto max-w-4xl text-center">
          <motion.span
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <RotateCcw size={12} />
            Workflow
          </motion.span>
          <motion.h1
            className="font-serif text-5xl font-bold leading-tight text-ink-500 md:text-7xl"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.65 }}
          >
            A book pipeline with decision points
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-300"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.65 }}
          >
            Folio is intentionally staged. It does not bury you in a blank chat
            thread. You move through source capture, blueprint review, writing,
            finishing, and reading with a clear state at every step.
          </motion.p>
        </section>

        <section className="relative mt-16">
          <motion.div
            aria-hidden
            className="absolute left-8 right-8 top-12 hidden h-px bg-gradient-to-r from-ember-200 via-sage-500/50 to-dust-200 lg:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "left" }}
          />
          <div className="grid gap-5 lg:grid-cols-5">
            {steps.map(({ icon: Icon, title, body, output }, index) => (
              <motion.div
                key={title}
                className="glass-card relative rounded-2xl p-5"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.5 }}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-500 text-parchment-50 shadow-warm">
                  <Icon size={20} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ember-600">
                  Step {index + 1}
                </p>
                <h2 className="mt-2 font-serif text-2xl font-semibold text-ink-500">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-300">
                  {body}
                </p>
                <div className="mt-5 rounded-xl border border-parchment-300/70 bg-white/70 px-3 py-2 text-xs font-medium text-ink-300">
                  Output: {output}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="glass-card rounded-3xl p-7">
            <h2 className="font-serif text-3xl font-bold text-ink-500">
              Review before the expensive work starts
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-300">
              The blueprint gate is the practical center of the workflow. You
              can regenerate the plan before chapters and covers consume more
              time, then approve once the book has the right shape.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ember-500 px-5 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
            >
              Try the workflow
              <ArrowRight size={15} />
            </Link>
          </div>

          <div className="rounded-3xl border border-parchment-300/70 bg-ink-500 p-7 text-parchment-50 shadow-warm-lg">
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-ember-300">
              Live generation log
            </p>
            {[
              "Planning started",
              "Story bible generated",
              "Awaiting approval",
              "Writer job queued",
              "Batch 1 complete",
            ].map((item, index) => (
              <motion.div
                key={item}
                className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.35 }}
              >
                <CheckCircle2 size={16} className="text-ember-300" />
                <span className="text-sm text-parchment-200">{item}</span>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
