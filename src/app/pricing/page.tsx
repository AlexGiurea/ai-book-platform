import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";

const included = [
  "Idea capture and creative preferences",
  "Story bible planning with approval",
  "Batch-based book generation",
  "AI cover generation",
  "Dashboard and reader experience",
  "Project memory for long-form coherence",
];

export default function PricingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-parchment-100">
      <Navbar />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-ember-200/35 blur-[130px]" />
        <div className="absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full bg-dust-200/40 blur-[110px]" />
      </div>

      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-32 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
          <Sparkles size={12} />
          Pricing
        </span>
        <h1 className="mx-auto mt-7 max-w-3xl font-serif text-5xl font-bold leading-[1.05] tracking-tight text-ink-500 md:text-7xl">
          Start shaping your first book for free.
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-300 md:text-xl">
          Folio is currently in its early creative studio phase. The core
          experience is free while we refine generation quality, memory, and the
          reader.
        </p>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-28">
        <div className="glass-card overflow-hidden rounded-[2rem]">
          <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-ink-500 p-8 text-parchment-50 md:p-10">
              <p className="text-sm uppercase tracking-[0.28em] text-ember-300">
                Early access
              </p>
              <div className="mt-10 flex items-end gap-2">
                <span className="font-serif text-6xl font-bold">$0</span>
                <span className="pb-2 text-parchment-300">for now</span>
              </div>
              <p className="mt-6 leading-relaxed text-parchment-300">
                Create, test, and read with the current Folio experience while
                the product is still evolving.
              </p>
              <Link
                href="/create"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ember-500 px-6 py-3.5 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
              >
                Start creating
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="p-8 md:p-10">
              <h2 className="font-serif text-3xl font-semibold text-ink-500">
                Included today
              </h2>
              <div className="mt-7 grid gap-4">
                {included.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember-100 text-ember-600">
                      <Check size={14} />
                    </span>
                    <span className="text-ink-300">{item}</span>
                  </div>
                ))}
              </div>
              <p className="mt-8 rounded-2xl border border-parchment-300/70 bg-parchment-50/70 p-5 text-sm leading-relaxed text-ink-300">
                Future paid plans may add larger books, higher generation
                limits, collaboration, export formats, and premium image
                workflows.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
