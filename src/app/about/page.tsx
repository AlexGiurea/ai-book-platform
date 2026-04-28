"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Feather,
  Heart,
  Lightbulb,
} from "lucide-react";
import Navbar from "@/components/Navbar";

const beliefs = [
  {
    icon: Lightbulb,
    title: "The idea stays yours",
    body: "AI should not replace the strange, personal spark that makes someone want to tell a story. It should help protect it long enough to become real.",
  },
  {
    icon: Feather,
    title: "Structure can serve wonder",
    body: "Planning, chapters, continuity, and covers are not cold machinery. They are scaffolding for imagination to climb higher.",
  },
  {
    icon: Heart,
    title: "Reading is the reward",
    body: "The goal is not a prompt result. The goal is holding a finished piece of art that feels like it came from a dream you almost forgot.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-parchment-100">
      <Navbar />
      <main className="relative mx-auto max-w-7xl px-6 pb-24 pt-28">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute right-[-10rem] top-10 h-[34rem] w-[34rem] rounded-full bg-ember-100/50 blur-[115px]" />
          <div className="absolute bottom-[-12rem] left-[-8rem] h-[30rem] w-[30rem] rounded-full bg-dust-100/45 blur-[110px]" />
        </div>

        <section className="relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10"
          >
            <span className="mb-6 inline-flex items-center rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
              About Folio
            </span>
            <h1 className="font-serif text-5xl font-bold leading-tight text-ink-500 md:text-7xl">
              We are not here to make imagination smaller
            </h1>
            <div className="mt-7 max-w-2xl space-y-5 text-lg leading-relaxed text-ink-300">
              <p>
                Folio exists for the person who has carried a story, a world, a
                memory, or a wild impossible premise for years and never found
                the time, structure, or stamina to turn it into something they
                could actually read.
              </p>
              <p>
                The point is not to inhibit creativity by asking AI to replace
                the author. The point is to let a dream escape the notebook and
                become a finished piece of art: planned, written, covered,
                stored, and ready to be enjoyed.
              </p>
              <p>
                We want Folio to feel less like automation and more like a
                studio assistant that clears the path between a fragile idea and
                the book-shaped thing it always wanted to become.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ember-500 px-6 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
              >
                Start with an idea
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/reader"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-parchment-300 bg-white/70 px-6 py-3 text-sm font-medium text-ink-400 shadow-warm-sm transition hover:bg-white"
              >
                <BookOpen size={15} />
                Read an example
              </Link>
            </div>
          </motion.div>

          <motion.div
            className="relative z-10"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative mx-auto max-w-[520px]">
              <motion.div
                aria-hidden
                className="absolute -inset-5 rounded-[2rem] border border-ember-200/70"
                animate={{ rotate: [-1, 1, -1], y: [0, -8, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative overflow-hidden rounded-[2rem] border border-parchment-300 bg-ink-500 shadow-warm-xl">
                <Image
                  src="/about-vision.png"
                  alt="A luminous book unfolding from an idea in a writer's notebook"
                  width={1024}
                  height={1536}
                  priority
                  className="h-[680px] w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-500 via-ink-500/70 to-transparent p-6 pt-24 text-parchment-50">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ember-300">
                    The vision
                  </p>
                  <p className="mt-2 max-w-sm font-serif text-2xl font-semibold leading-tight">
                    A private spark becoming a book you can return to.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="relative z-10 mt-20 grid gap-5 md:grid-cols-3">
          {beliefs.map(({ icon: Icon, title, body }, index) => (
            <motion.div
              key={title}
              className="rounded-3xl border border-parchment-300/70 bg-white/65 p-6 shadow-warm-sm"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.5 }}
            >
              <Icon size={20} className="mb-5 text-ember-600" />
              <h2 className="font-serif text-2xl font-semibold text-ink-500">
                {title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-300">{body}</p>
            </motion.div>
          ))}
        </section>

        <section className="relative z-10 mx-auto mt-20 max-w-4xl text-center">
          <div className="rounded-[2rem] border border-parchment-300/70 bg-white/65 p-10 shadow-warm-sm">
            <p className="font-serif text-3xl font-semibold leading-tight text-ink-500 md:text-4xl">
              Folio is for the moment when a story stops being something you
              might write someday and becomes something you can finally read.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
