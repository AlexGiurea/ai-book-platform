"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  CreditCard,
  Download,
  Feather,
  HelpCircle,
  LifeBuoy,
  Mail,
  MessageCircle,
  Search,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { cn } from "@/lib/utils";

const quickStart = [
  {
    icon: Sparkles,
    title: "Capture an idea",
    body: "Type a premise, paste a brief, or upload notes on the New Book screen. A single sentence is enough to start.",
  },
  {
    icon: Wand2,
    title: "Review the blueprint",
    body: "The planning agent builds a story bible — characters, world, chapters. Approve it before drafting starts.",
  },
  {
    icon: Feather,
    title: "Watch chapters land",
    body: "The writing agent drafts in batches with full memory of prior text. You can leave the tab and come back.",
  },
  {
    icon: BookOpen,
    title: "Read or export",
    body: "Open the in-app reader to enjoy the finished book. Pro plans can export to PDF and prepare EPUB.",
  },
];

const faqs: Array<{
  category: string;
  q: string;
  a: string;
}> = [
  {
    category: "Generation",
    q: "How long does a full book take to generate?",
    a: "A standard-length book typically finishes in 8–20 minutes depending on queue load and length. Generation is durable — you can close the tab and come back to a finished book.",
  },
  {
    category: "Generation",
    q: "What happens if I close the browser mid-generation?",
    a: "Nothing is lost. Each chapter batch is saved as a durable job in the database. When you return to the dashboard, the project will still be writing or already complete.",
  },
  {
    category: "Generation",
    q: "Can I edit the story bible before chapters are written?",
    a: "Yes — that's the point of the approval gate. You can re-roll the plan or tweak the premise before any chapter is drafted.",
  },
  {
    category: "Plans",
    q: "What's included in Pro?",
    a: "Pro unlocks full-length manuscripts, premium planning, priority generation, cover generation with retries, and the prepared PDF/EPUB export path.",
  },
  {
    category: "Plans",
    q: "Can I cancel anytime?",
    a: "Yes. Folio is month-to-month. Your library stays accessible after cancellation, and you can resume Pro generation any time.",
  },
  {
    category: "Reader",
    q: "Where are my books stored?",
    a: "Generated books are stored in your private library, backed by Postgres. Cover images are uploaded to durable blob storage. They're tied to your account and not shared.",
  },
  {
    category: "Reader",
    q: "Can I export to PDF?",
    a: "Pro plans can export the finished book — including cover and chapter layout — to PDF. EPUB is on the roadmap.",
  },
  {
    category: "Account",
    q: "How do I change my password or email?",
    a: "Email and password updates are coming with the upcoming account-management release. In the meantime, send a request from your account email and we'll handle it manually.",
  },
  {
    category: "Account",
    q: "How do I delete my account?",
    a: "Email hello@folio.app from the address tied to your account. We remove your account and all generated books within 7 days.",
  },
];

const categories = ["All", "Generation", "Plans", "Reader", "Account"] as const;
type Category = (typeof categories)[number];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filtered = faqs.filter((f) => {
    if (category !== "All" && f.category !== category) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute right-[-10rem] top-10 h-[32rem] w-[32rem] rounded-full bg-ember-100/45 blur-[115px]" />
        <div className="absolute bottom-[-12rem] left-[-8rem] h-[28rem] w-[28rem] rounded-full bg-dust-100/45 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-24">
        {/* Hero */}
        <motion.section
          className="mb-12"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
            <LifeBuoy size={12} />
            Help & Support
          </span>
          <h1 className="mt-4 font-serif text-4xl font-bold text-ink-500 sm:text-5xl">
            How can we help you write?
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-300">
            Quick guides, common questions, and a way to reach a human. If
            you&apos;re stuck mid-draft, scroll to the FAQ or send us a note.
          </p>

          {/* Search */}
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-parchment-300/80 bg-parchment-50 px-4 py-3 shadow-warm-sm focus-within:border-ember-300 focus-within:ring-2 focus-within:ring-ember-500/20">
            <Search size={16} className="text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help — e.g. ‘export PDF’, ‘cancel plan’"
              className="flex-1 bg-transparent text-sm text-ink-500 placeholder:text-ink-200 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs text-ink-300 hover:text-ink-500"
              >
                Clear
              </button>
            )}
          </div>
        </motion.section>

        {/* Quick start cards */}
        <motion.section
          className="mb-14"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-ink-300">
            Getting started
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickStart.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  delay: 0.1 + i * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="glass-card rounded-2xl p-5"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-ember-100 text-ember-600">
                  <step.icon size={18} />
                </div>
                <p className="text-sm font-semibold text-ink-500">
                  {step.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-300">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* FAQ */}
        <motion.section
          className="mb-14"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-ink-300">
              Frequently asked
            </h2>
            <div className="flex flex-wrap gap-1 rounded-xl border border-parchment-300/70 bg-parchment-50 p-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    category === c
                      ? "bg-ink-500 text-parchment-50"
                      : "text-ink-300 hover:bg-parchment-200"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card overflow-hidden rounded-3xl">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <HelpCircle size={20} className="text-ink-300" />
                <p className="text-sm font-medium text-ink-500">
                  No matches for that search.
                </p>
                <p className="text-xs text-ink-300">
                  Try a different phrase, or send us a note below.
                </p>
              </div>
            ) : (
              filtered.map((f, i) => {
                const isOpen = openIndex === i;
                return (
                  <div
                    key={`${f.q}-${i}`}
                    className={cn(
                      "border-b border-parchment-200/70 last:border-b-0"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : i)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-parchment-200/40"
                      aria-expanded={isOpen}
                    >
                      <span className="hidden flex-shrink-0 rounded-full bg-parchment-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:inline-block">
                        {f.category}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-ink-500">
                        {f.q}
                      </span>
                      <motion.span
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-shrink-0 text-ink-300"
                      >
                        <ChevronDown size={16} />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-5 text-sm leading-relaxed text-ink-300">
                            {f.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </motion.section>

        {/* Contact + shortcuts */}
        <motion.section
          className="grid gap-5 sm:grid-cols-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="glass-card rounded-3xl p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-ember-500 text-white shadow-ember">
              <MessageCircle size={18} />
            </div>
            <h3 className="font-serif text-lg font-semibold text-ink-500">
              Talk to a human
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-300">
              We read every message. Expect a reply within one working day —
              usually faster.
            </p>
            <a
              href="mailto:hello@folio.app?subject=Folio%20support"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-ink-500 px-4 py-2.5 text-sm font-medium text-parchment-50 hover:bg-ink-400"
            >
              <Mail size={14} />
              hello@folio.app
            </a>
          </div>

          <div className="glass-card rounded-3xl p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-parchment-200 text-ink-400">
              <Zap size={18} />
            </div>
            <h3 className="font-serif text-lg font-semibold text-ink-500">
              Useful shortcuts
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <Shortcut
                href="/dashboard"
                icon={BookOpen}
                label="Open your library"
              />
              <Shortcut href="/create" icon={Sparkles} label="Start a new book" />
              <Shortcut
                href="/pricing?from=help"
                icon={CreditCard}
                label="Compare plans"
              />
              <Shortcut
                href="/settings"
                icon={Download}
                label="Adjust preferences"
              />
            </ul>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function Shortcut({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Sparkles;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-xl border border-parchment-200/70 bg-parchment-50 px-3 py-2.5 text-ink-500 transition hover:border-ember-200 hover:bg-ember-100/40"
      >
        <Icon size={14} className="text-ember-600" />
        <span className="flex-1 text-sm font-medium">{label}</span>
        <ArrowRight
          size={14}
          className="text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ember-600"
        />
      </Link>
    </li>
  );
}
