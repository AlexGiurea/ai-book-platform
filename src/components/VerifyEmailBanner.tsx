"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MailCheck } from "lucide-react";
import type { AuthUser } from "@/lib/auth/session";

/**
 * Shown until an address is confirmed.
 *
 * Deliberately not a blocking modal: an unverified account can read, browse its
 * library and change settings. The only thing it cannot do is start a book,
 * because that is the action that costs money — so the banner explains the one
 * restriction rather than holding the whole product hostage.
 */
export default function VerifyEmailBanner({ user }: { user: AuthUser | null }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!user || user.emailVerifiedAt) return null;

  async function resend() {
    setState("sending");
    setMessage(null);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        delivered?: boolean;
      };
      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? "Could not send the email.");
        return;
      }
      setState("sent");
      setMessage(
        data.delivered
          ? "Sent. Check your inbox."
          : "Email delivery is not configured on this deployment yet — the link is in the server log."
      );
    } catch {
      setState("error");
      setMessage("Could not send the email.");
    }
  }

  return (
    <motion.div
      className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border-l-2 border-l-ember-500 p-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-ember-200 bg-ember-100">
          <MailCheck size={18} className="text-ember-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">Confirm your email</p>
          <p className="mt-0.5 text-xs text-ink-300">
            {message ??
              `We sent a link to ${user.email}. You can look around now, but a book cannot start until the address is confirmed.`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={state === "sending" || state === "sent"}
        className="flex-shrink-0 whitespace-nowrap rounded-xl bg-ember-500 px-4 py-2.5 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "sending"
          ? "Sending…"
          : state === "sent"
            ? "Sent"
            : "Send it again"}
      </button>
    </motion.div>
  );
}
