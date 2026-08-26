"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import {
  PLAN_DEFINITIONS,
  PLAN_ORDER,
  usdPer1kWords,
  type SubscriptionPlan,
} from "@/lib/plans";
import { useAuthUser } from "@/hooks/useAuthUser";

const plans = PLAN_ORDER.map((id) => PLAN_DEFINITIONS[id]);

export default function PricingPage() {
  const { signedIn, user } = useAuthUser();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function startCheckout(planId: SubscriptionPlan) {
    if (!signedIn) {
      window.location.assign(`/signup?plan=${planId}`);
      return;
    }
    setLoadingPlan(planId);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Could not start billing.");
      }
      window.location.assign(data.url);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Could not start billing."
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-28">
        <section className="mx-auto max-w-3xl text-center">
          <motion.span
            className="mb-6 inline-flex items-center rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
          >
            Pricing
          </motion.span>
          <motion.h1
            className="font-serif text-5xl font-bold leading-tight text-ink-500 md:text-7xl"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.65 }}
          >
            Two plans, one serious writing system
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-300"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.65 }}
          >
            You buy words, not seats. Every plan runs the same pipeline —
            planning, chapter writing, continuity audit, repair — and the only
            thing that changes is how many words a month you get, and which
            model writes them.
          </motion.p>
        </section>

        <section className="mt-8 flex justify-center">
          <motion.div
            className="max-w-3xl rounded-2xl border border-ember-200 bg-ember-100 px-4 py-3 text-sm font-medium text-ember-700 shadow-warm-sm"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.5 }}
          >
            Checkout is wired in code but payments are off, so nothing is
            charged yet. Word allowances are already live and enforced — your
            account meter on the dashboard is real.
          </motion.div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              className={
                plan.featured
                  ? "relative rounded-3xl bg-ink-500 p-6 text-parchment-50 shadow-warm-xl"
                  : "glass-card rounded-3xl p-6"
              }
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.5 }}
            >
              {plan.featured && (
                <div className="absolute right-5 top-5 rounded-full bg-ember-500 px-3 py-1 text-xs font-medium text-white">
                  {plan.badge ?? "Most popular"}
                </div>
              )}
              <h2 className="font-serif text-3xl font-bold">{plan.name}</h2>
              <p className={plan.featured ? "mt-2 text-parchment-300" : "mt-2 text-ink-300"}>
                {plan.summary}
              </p>
              <div className="mt-7 flex items-end gap-2">
                <span className="font-serif text-5xl font-bold">{plan.price}</span>
                <span className={plan.featured ? "mb-2 text-parchment-400" : "mb-2 text-ink-300"}>
                  {plan.cadence}
                </span>
              </div>
              <div
                className={
                  plan.featured
                    ? "mt-5 rounded-2xl border border-white/10 bg-white/8 p-4"
                    : "mt-5 rounded-2xl border border-parchment-300/70 bg-white/65 p-4"
                }
              >
                <p
                  className={
                    plan.featured
                      ? "text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-300"
                      : "text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-600"
                  }
                >
                  Words each month
                </p>
                <p className="mt-2 font-serif text-3xl font-semibold">
                  {plan.monthlyWords.toLocaleString()}
                </p>
                <p className={plan.featured ? "mt-1 text-sm text-parchment-400" : "mt-1 text-sm text-ink-300"}>
                  {plan.allowanceExample}
                </p>
                <p
                  className={
                    plan.featured
                      ? "mt-3 border-t border-white/10 pt-3 text-xs text-parchment-400"
                      : "mt-3 border-t border-ink-100/60 pt-3 text-xs text-ink-300"
                  }
                >
                  {plan.modelLabel}
                  {usdPer1kWords(plan.id) > 0
                    ? ` · $${usdPer1kWords(plan.id).toFixed(2)} per 1,000 words`
                    : " · no card required"}
                </p>
              </div>
              {plan.id !== "free" ? (
                <button
                  type="button"
                  onClick={() => startCheckout(plan.id)}
                  disabled={loadingPlan === plan.id || user?.plan === plan.id}
                  className={
                    plan.featured
                      ? "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ember-500 px-5 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600 disabled:cursor-not-allowed disabled:opacity-70"
                      : "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-ink-500 shadow-warm-sm transition hover:bg-parchment-50 disabled:cursor-not-allowed disabled:opacity-70"
                  }
                >
                  {user?.plan === plan.id
                    ? "Current plan"
                    : loadingPlan === plan.id
                      ? "Opening Checkout..."
                      : plan.cta}
                  <ArrowRight size={15} />
                </button>
              ) : (
                <Link
                  href={plan.href}
                  className={
                    plan.featured
                      ? "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ember-500 px-5 py-3 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600"
                      : "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-ink-500 shadow-warm-sm transition hover:bg-parchment-50"
                  }
                >
                  {user?.plan === "free" ? "Current plan" : plan.cta}
                  <ArrowRight size={15} />
                </Link>
              )}
              <div className="mt-7 space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <CheckCircle2
                      size={16}
                      className={plan.featured ? "mt-0.5 text-ember-300" : "mt-0.5 text-sage-500"}
                    />
                    <span className={plan.featured ? "text-parchment-200" : "text-ink-300"}>
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </section>

        <section className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            { icon: Sparkles, title: "Priced by the word", body: "A short book costs less than an epic, because it costs us less to write." },
            { icon: FileText, title: "Unused words return", body: "A book that lands short, or one you cancel, credits the difference back." },
            { icon: ShieldCheck, title: "Account-owned", body: "Projects stay tied to your signed-in account and private library." },
            { icon: Zap, title: "Billing-ready", body: "Checkout, portal, webhooks, and plan sync are prepared without launching payments." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-parchment-300/70 bg-white/65 p-5 shadow-warm-sm">
              <Icon size={18} className="mb-4 text-ember-600" />
              <h3 className="font-serif text-lg font-semibold text-ink-500">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl border border-parchment-300/70 bg-white/65 shadow-warm-sm">
          <div className="grid gap-px bg-parchment-300/70 md:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-parchment-50/85 p-6">
                <h3 className="font-serif text-2xl font-semibold text-ink-500">
                  {plan.name} operating limits
                </h3>
                <div className="mt-5 space-y-3 text-sm text-ink-300">
                  {Object.entries(plan.limits).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-5 border-b border-parchment-300/60 pb-3 last:border-0 last:pb-0">
                      <span className="capitalize text-ink-200">{label}</span>
                      <span className="max-w-[15rem] text-right text-ink-400">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
