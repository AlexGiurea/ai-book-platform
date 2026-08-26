"use client";

import { useCallback, useEffect, useState } from "react";
import type { LengthPreset } from "@/lib/agent/types";

export interface LengthAffordability {
  preset: LengthPreset;
  words: number;
  affordable: boolean;
  shortfall: number;
  shortfallUsd: number;
}

export interface WordAllowance {
  plan: { id: string; name: string; price: string; monthlyWords: number };
  /** Books in flight now, against how many this plan may run at once. */
  concurrency: { limit: number; active: number };
  unlimited: boolean;
  /** Null when the account is unmetered — Infinity is not valid JSON. */
  allowance: number | null;
  used: number;
  remaining: number | null;
  period: { start: string; end: string };
  overageUsdPer1kWords: number;
  lengths: LengthAffordability[];
  recent: {
    id: string;
    projectId: string | null;
    kind: string;
    words: number;
    note: string | null;
    createdAt: string;
  }[];
}

/**
 * The signed-in account's word allowance for this month.
 *
 * `refresh` exists because creating a book spends words: the create page has to
 * re-read after a submit, or the meter shows a balance that is one book stale.
 */
export function useWordAllowance(enabled = true) {
  const [allowance, setAllowance] = useState<WordAllowance | null>(null);
  const [settled, setSettled] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch("/api/usage");
      setAllowance(response.ok ? ((await response.json()) as WordAllowance) : null);
    } catch {
      setAllowance(null);
    } finally {
      setSettled(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  // Derived rather than assigned in the effect body — a synchronous setState
  // there costs an extra render pass on every mount.
  const loading = enabled && !settled;

  return { allowance, loading, refresh };
}
