"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  ImageIcon,
  Library,
  MessageSquareText,
  Wand2,
} from "lucide-react";
import Navbar from "@/components/Navbar";

const modules = [
  { icon: MessageSquareText, title: "Idea intake", body: "Start from a sentence, uploaded context, character notes, or a full outline." },
  { icon: FileText, title: "Blueprint studio", body: "Review the book plan, chapters, character arcs, voice guide, and continuity rules before writing." },
  { icon: Wand2, title: "Chapter engine", body: "Generate durable writing batches that remember the story bible and the prose already written." },
  { icon: ImageIcon, title: "Cover direction", body: "Create or regenerate a cover from the approved plan and keep the image tied to the book." },
  { icon: BookOpen, title: "Immersive reader", body: "Read in Kindle-style mode or book-spread mode with search, contents, and reading controls." },
  { icon: Library, title: "Private library", body: "Every signed-in account gets a saved shelf of books, progress, covers, and metadata." },
];

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />
      <main className="relative mx-auto max-w-7xl px-6 pb-24 pt-28">
        <section className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
              <Wand2 size={12} />
              Product
            </span>
            <h1 className="font-serif text-5xl font-bold leading-tight text-ink-500 md:text-7xl">
              The writing studio between idea and finished book
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
              Folio is built as an end-to-end workspace: capture the source
              material, shape a story bible, approve the direction, write in
              chapters, design a cover, and keep the finished book in your
              private library.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ember-500 px-6 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
              >
                Start writing
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/workflow"
                className="inline-flex items-center justify-center rounded-xl border border-parchment-300 bg-white/70 px-6 py-3 text-sm font-medium text-ink-400 shadow-warm-sm transition hover:bg-white"
              >
                See workflow
              </Link>
            </div>
          </motion.div>

          <motion.div
            className="glass-card rounded-3xl p-5"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          >
            <div className="rounded-2xl border border-parchment-300/70 bg-parchment-50/80 p-5">
              <div className="mb-5 flex items-center justify-between border-b border-parchment-300/70 pb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ember-600">
                    Active book
                  </p>
                  <h2 className="mt-1 font-serif text-3xl font-bold text-ink-500">
                    The Last Lighthouse
                  </h2>
                </div>
                <span className="rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-sage-500">
                  42,517 words
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_0.72fr]">
                <div className="space-y-3">
                  {[
                    ["Idea", "A retired sea captain receives letters dated before his birth."],
                    ["Blueprint", "11 chapters, 4 major arcs, continuity locked."],
                    ["Chapter 7", "Drafting the storm sequence in batch 19."],
                    ["Publish", "Cover, reader, and export preparation."],
                  ].map(([label, body], index) => (
                    <motion.div
                      key={label}
                      className="rounded-2xl border border-parchment-300/70 bg-white/80 p-4"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 + index * 0.08, duration: 0.45 }}
                    >
                      <div className="flex gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink-500 text-sm font-semibold text-parchment-50">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-ink-500">{label}</p>
                          <p className="mt-1 text-sm leading-relaxed text-ink-300">{body}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="rounded-2xl border border-parchment-300/70 bg-ink-500 p-4 text-parchment-50">
                  <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-parchment-300">
                    Library proof
                  </p>
                  {["Cover saved", "Reader ready", "Jobs persisted", "Owner scoped"].map((item) => (
                    <div key={item} className="mb-3 flex items-center gap-2 text-sm text-parchment-200">
                      <CheckCircle2 size={15} className="text-ember-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {modules.map(({ icon: Icon, title, body }, index) => (
            <motion.div
              key={title}
              className="glass-card rounded-2xl p-6"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05, duration: 0.45 }}
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-ember-200 bg-ember-100 text-ember-600">
                <Icon size={19} />
              </div>
              <h2 className="font-serif text-xl font-semibold text-ink-500">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-300">{body}</p>
            </motion.div>
          ))}
        </section>
      </main>
    </div>
  );
}
