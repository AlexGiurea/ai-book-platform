"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Feather } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

interface AuthFormProps {
  mode: "signin" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";
  const requestedNext = searchParams.get("next") || "/dashboard";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    try {
      const res = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment-100 px-6 py-10">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute left-10 top-16 h-80 w-80 rounded-full bg-ember-100/45 blur-[90px]" />
        <div className="absolute bottom-8 right-12 h-72 w-72 rounded-full bg-dust-100/45 blur-[90px]" />
      </div>

      <BrandLogo className="relative z-10 mx-auto w-fit" textClassName="text-xl" />

      <main className="relative z-10 mx-auto mt-16 max-w-md">
        <div className="glass-card rounded-3xl p-8">
          <div className="mb-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-ember-200 bg-ember-100 text-ember-600">
              <Feather size={20} />
            </div>
            <h1 className="font-serif text-3xl font-bold text-ink-500">
              {isSignup ? "Create your Folio account" : "Welcome back"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              {isSignup
                ? "Save your books, keep generation history, and return to your private library."
                : "Sign in to continue writing, reviewing, and reading your books."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {isSignup && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-ink-300">
                  Name
                </span>
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  className="w-full rounded-2xl border border-parchment-300 bg-white/70 px-4 py-3 text-sm text-ink-500 outline-none transition focus:border-ember-300 focus:bg-white"
                  placeholder="A. R. Marlowe"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-ink-300">
                Email
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-parchment-300 bg-white/70 px-4 py-3 text-sm text-ink-500 outline-none transition focus:border-ember-300 focus:bg-white"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-ink-300">
                Password
              </span>
              <input
                name="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                minLength={8}
                className="w-full rounded-2xl border border-parchment-300 bg-white/70 px-4 py-3 text-sm text-ink-500 outline-none transition focus:border-ember-300 focus:bg-white"
                placeholder="At least 8 characters"
              />
            </label>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ember-500 px-5 py-3.5 text-sm font-medium text-white shadow-ember transition hover:bg-ember-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Working..." : isSignup ? "Create account" : "Sign in"}
              {!busy && <ArrowRight size={15} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-300">
            {isSignup ? "Already have an account?" : "New to Folio?"}{" "}
            <Link
              href={isSignup ? "/signin" : "/signup"}
              className="font-medium text-ember-600 hover:text-ember-700"
            >
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
