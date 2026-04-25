"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Heart, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";

const principles = [
  {
    title: "Creativity first",
    copy: "AI should expand the surface area of imagination, not flatten it into predictable templates.",
  },
  {
    title: "The user remains the origin",
    copy: "The first spark, the taste, the dream, and the final yes still belong to the person creating.",
  },
  {
    title: "A finished artifact matters",
    copy: "Ideas deserve more than a chat response. They deserve shape, memory, chapters, covers, and a place to be read.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-parchment-100">
      <Navbar />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -left-36 top-16 h-[520px] w-[520px] rounded-full bg-ember-200/35 blur-[110px]" />
        <div className="absolute right-0 top-1/3 h-[560px] w-[560px] rounded-full bg-dust-200/40 blur-[120px]" />
      </div>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-32 lg:grid-cols-[0.95fr_1.05fr]">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
            <Heart size={12} />
            About Folio
          </span>
          <h1 className="mt-7 font-serif text-5xl font-bold leading-[1.05] tracking-tight text-ink-500 md:text-7xl">
            We are not here to replace imagination.
          </h1>
          <p className="mt-7 text-lg leading-relaxed text-ink-300 md:text-xl">
            Folio exists for the person who has carried a world in their head
            for years, the student with a wild premise, the parent with a bedtime
            story, the builder with a vision that has never quite made it onto
            the page.
          </p>
          <p className="mt-5 text-lg leading-relaxed text-ink-300">
            Our purpose is not to inhibit creativity by having AI simply write
            books for people. It is to help a user&apos;s dream unfold into something
            tangible: an idea shaped into structure, structure shaped into prose,
            and prose shaped into a piece of art they can hold, read, revisit,
            and enjoy.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/create"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-ember-500 px-7 py-3.5 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
            >
              Start your book
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/product"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-parchment-300/70 bg-white/70 px-7 py-3.5 text-sm font-medium text-ink-400 shadow-warm-sm backdrop-blur transition hover:bg-white"
            >
              <BookOpen size={15} />
              See how it works
            </Link>
          </div>
        </motion.div>

        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            aria-hidden
            className="absolute -left-4 -top-4 h-20 w-20 rounded-full bg-ember-300/50 blur-2xl"
            animate={{ scale: [1, 1.25, 1], opacity: [0.45, 0.78, 0.45] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative overflow-hidden rounded-[2.2rem] border border-white/70 bg-white/60 p-3 shadow-glass backdrop-blur-xl">
            <Image
              src="/generated/folio-about-vision.svg"
              alt="A glowing idea unfolding into manuscript pages and a finished illustrated book."
              width={1400}
              height={1100}
              priority
              className="h-auto w-full rounded-[1.7rem]"
            />
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Sparkles className="mx-auto mb-4 text-ember-500" size={24} />
          <h2 className="font-serif text-3xl font-semibold text-ink-500 md:text-4xl">
            The vision is simple.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-ink-300">
            Give people a beautiful way to move from &quot;I have an idea&quot; to
            &quot;I made something I can read.&quot;
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {principles.map((principle, index) => (
            <motion.article
              key={principle.title}
              className="glass-card rounded-3xl p-7"
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-ember-100 font-serif text-lg font-semibold text-ember-600">
                {index + 1}
              </span>
              <h3 className="font-serif text-xl font-semibold text-ink-500">
                {principle.title}
              </h3>
              <p className="mt-3 leading-relaxed text-ink-300">{principle.copy}</p>
            </motion.article>
          ))}
        </div>
      </section>
    </main>
  );
}
