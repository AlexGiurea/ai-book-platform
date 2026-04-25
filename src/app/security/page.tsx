"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Cookie,
  Database,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";

const layers = [
  { icon: UserRoundCheck, title: "Account identity", body: "Users are stored in Neon with normalized unique emails and server-side password hashes." },
  { icon: Cookie, title: "Session boundary", body: "The browser only receives an HTTP-only session cookie; client JavaScript never handles the session secret." },
  { icon: LockKeyhole, title: "Project ownership", body: "Project APIs check the signed-in account before listing, reading, approving, replanning, or regenerating covers." },
  { icon: ServerCog, title: "Job processing", body: "Background jobs can continue safely without depending on a user's active browser tab." },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-28">
        <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
              <ShieldCheck size={12} />
              Security
            </span>
            <h1 className="font-serif text-5xl font-bold leading-tight text-ink-500 md:text-7xl">
              Private book storage with account boundaries
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
              Folio&apos;s auth and project storage now share the same Neon-backed
              foundation. Books, chapters, jobs, generation events, sessions,
              and user records live in one durable Postgres system.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-ember-500 px-6 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
            >
              Create secure account
              <ArrowRight size={15} />
            </Link>
          </motion.div>

          <motion.div
            className="rounded-3xl bg-ink-500 p-6 text-parchment-50 shadow-warm-xl"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-ember-300">
              Storage model
            </p>
            <div className="space-y-3">
              {[
                ["users", "Account profile and password hash"],
                ["user_sessions", "Hashed session tokens and expiry"],
                ["projects", "Book ownership and metadata"],
                ["book_batches", "Generated chapter prose"],
                ["generation_events", "Traceable progress history"],
                ["generation_jobs", "Durable writing and cover jobs"],
              ].map(([table, detail], index) => (
                <motion.div
                  key={table}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + index * 0.06, duration: 0.35 }}
                >
                  <Database size={16} className="text-ember-300" />
                  <div>
                    <p className="font-mono text-sm text-parchment-100">{table}</p>
                    <p className="text-xs text-parchment-400">{detail}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {layers.map(({ icon: Icon, title, body }, index) => (
            <motion.div
              key={title}
              className="glass-card rounded-2xl p-6"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.06, duration: 0.45 }}
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-ember-200 bg-ember-100 text-ember-600">
                <Icon size={19} />
              </div>
              <h2 className="font-serif text-xl font-semibold text-ink-500">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-300">{body}</p>
            </motion.div>
          ))}
        </section>

        <section className="mt-12 rounded-3xl border border-parchment-300/70 bg-white/65 p-6 shadow-warm-sm">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              "Passwords are salted and hashed server-side",
              "Session tokens are stored hashed in Neon",
              "Project records carry user ownership",
              "Unauthorized project reads return 401/404",
              "Existing background job processing remains durable",
              "Storage migration is idempotent",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-ink-300">
                <CheckCircle2 size={16} className="mt-0.5 text-sage-500" />
                {item}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
