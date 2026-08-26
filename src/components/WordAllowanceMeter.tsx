"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Feather, Infinity as InfinityIcon } from "lucide-react";
import type { WordAllowance } from "@/hooks/useWordAllowance";

function monthName(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, 1)).toLocaleString(undefined, {
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * How many words are left this month.
 *
 * Words are what Folio sells, so this is the account's primary readout — not a
 * detail buried in settings. `compact` renders the single line the create page
 * wants above the length picker; the full form is for the dashboard.
 */
export default function WordAllowanceMeter({
  allowance,
  compact = false,
}: {
  allowance: WordAllowance | null;
  compact?: boolean;
}) {
  if (!allowance) return null;

  if (allowance.unlimited) {
    if (compact) {
      return (
        <p className="flex items-center gap-1.5 text-xs text-ink-300">
          <InfinityIcon size={13} className="text-ember-600" />
          Unmetered account
        </p>
      );
    }
    return (
      <div className="glass-card flex items-center gap-4 rounded-2xl p-6">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-ember-200 bg-ember-100">
          <InfinityIcon size={18} className="text-ember-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">
            {allowance.plan.name} account · unmetered
          </p>
          <p className="mt-0.5 text-xs text-ink-200">
            {allowance.used.toLocaleString()} words written in {monthName(allowance.period.start)} ·{" "}
            {allowance.concurrency.active} of {allowance.concurrency.limit} books running
          </p>
        </div>
      </div>
    );
  }

  const total = allowance.allowance ?? 0;
  const remaining = allowance.remaining ?? 0;
  const usedFraction = total > 0 ? Math.min(1, allowance.used / total) : 0;
  const nearlyOut = remaining <= total * 0.15;

  if (compact) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100/70">
          <div
            className={nearlyOut ? "h-full rounded-full bg-ember-600" : "h-full rounded-full bg-ember-400"}
            style={{ width: `${usedFraction * 100}%` }}
          />
        </div>
        <p className="text-xs text-ink-300">
          <span className={nearlyOut ? "font-medium text-ember-600" : "font-medium text-ink-400"}>
            {remaining.toLocaleString()}
          </span>{" "}
          of {total.toLocaleString()} words left
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="glass-card rounded-2xl p-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-500">
            {remaining.toLocaleString()} words left
          </p>
          <p className="mt-0.5 text-xs text-ink-200">
            {allowance.plan.name} · {total.toLocaleString()} words each month · resets 1 {monthName(allowance.period.end)}
          </p>
          {allowance.concurrency.active > 0 ? (
            <p className="mt-0.5 text-xs text-ink-200">
              {allowance.concurrency.active} of {allowance.concurrency.limit}{" "}
              {allowance.concurrency.limit === 1 ? "book slot" : "book slots"} in use
            </p>
          ) : null}
        </div>
        {allowance.plan.id === "free" ? (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ember-200 bg-ember-100 px-3 py-1.5 text-xs font-medium text-ember-600 transition hover:bg-ember-200"
          >
            <Feather size={13} />
            Get more words
          </Link>
        ) : null}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100/70">
        <motion.div
          className={nearlyOut ? "h-full rounded-full bg-ember-600" : "h-full rounded-full bg-ember-400"}
          initial={{ width: 0 }}
          animate={{ width: `${usedFraction * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-200">
        {allowance.lengths.map((entry) => (
          <span
            key={entry.preset}
            className={entry.affordable ? "text-ink-300" : "text-ink-200/60 line-through"}
            title={
              entry.affordable
                ? `${entry.words.toLocaleString()} words`
                : `${entry.shortfall.toLocaleString()} words short`
            }
          >
            {entry.preset}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
