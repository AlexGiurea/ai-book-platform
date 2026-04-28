"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  CreditCard,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Palette,
  Settings as SettingsIcon,
  Sparkles,
  Type,
  User as UserIcon,
  Wand2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getPlanDefinition } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface Preferences {
  reduceMotion: boolean;
  warmTheme: boolean;
  emailUpdates: boolean;
  readerFontScale: "compact" | "comfortable" | "spacious";
  defaultTone: "literary" | "warm" | "epic" | "playful" | "clinical";
  defaultLength: "short" | "standard" | "long";
}

const PREFS_KEY = "folio.preferences.v1";

const defaultPrefs: Preferences = {
  reduceMotion: false,
  warmTheme: true,
  emailUpdates: true,
  readerFontScale: "comfortable",
  defaultTone: "literary",
  defaultLength: "standard",
};

function loadPrefs(): Preferences {
  if (typeof window === "undefined") return defaultPrefs;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs;
    return { ...defaultPrefs, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return defaultPrefs;
  }
}

export default function SettingsPage() {
  const { user, signedIn } = useAuthUser();
  const [prefs, setPrefs] = useState<Preferences>(() => loadPrefs());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  const persistPrefs = useCallback(
    async (next: Preferences) => {
      if (!signedIn) return;
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => undefined);
    },
    [signedIn]
  );

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { preferences?: Partial<Preferences> } | null) => {
        if (cancelled || !data?.preferences) return;
        const next = { ...loadPrefs(), ...data.preferences };
        setPrefs(next);
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const updatePref = <K extends keyof Preferences>(
    key: K,
    value: Preferences[K]
  ) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
        setSavedAt(Date.now());
      } catch {
        // ignore storage failures
      }
      void persistPrefs(next);
      return next;
    });
  };

  const planDefinition = useMemo(
    () => getPlanDefinition(user?.plan ?? "pro"),
    [user?.plan]
  );

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      })
    : "—";

  const billingStatus = user?.billing?.stripeSubscriptionStatus;
  const billingManagedByStripe = Boolean(user?.billing?.stripeCustomerId);
  const renewalDate = user?.billing?.stripeCurrentPeriodEnd
    ? new Date(user.billing.stripeCurrentPeriodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const openBilling = async () => {
    if (!signedIn) {
      window.location.href = "/signin";
      return;
    }
    setBillingLoading(true);
    try {
      const endpoint = billingManagedByStripe
        ? "/api/billing/portal"
        : "/api/billing/checkout";
      const response = await fetch(endpoint, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Billing is not available yet.");
      }
      window.location.href = data.url;
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Billing is not available yet."
      );
    } finally {
      setBillingLoading(false);
    }
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    } finally {
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen bg-parchment-100">
      <Navbar />

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute right-[-8rem] top-10 h-[28rem] w-[28rem] rounded-full bg-ember-100/40 blur-[110px]" />
        <div className="absolute bottom-[-10rem] left-[-6rem] h-[26rem] w-[26rem] rounded-full bg-dust-100/40 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-24">
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-100 px-3 py-1 text-xs font-medium text-ember-600">
              <SettingsIcon size={12} />
              Settings
            </span>
            {savedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-200">
                <CheckCircle2 size={12} className="text-sage-600" />
                Saved
              </span>
            )}
          </div>
          <h1 className="mt-4 font-serif text-4xl font-bold text-ink-500">
            Studio settings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-300">
            Tune the writing studio to your taste — your preferences are kept
            on this device and applied across the reader and creation flow.
          </p>
        </motion.header>

        {/* Profile */}
        <Section title="Profile" icon={UserIcon} delay={0.05}>
          {signedIn && user ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" value={user.name || "Folio reader"} />
              <Field label="Email" value={user.email} />
              <Field label="Plan" value={planDefinition.name} accent />
              <Field label="Member since" value={memberSince} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-parchment-300/70 bg-parchment-50 p-4">
              <p className="text-sm text-ink-300">
                Sign in to manage your profile and account preferences.
              </p>
              <Link
                href="/signin"
                className="inline-flex items-center gap-1.5 rounded-xl bg-ink-500 px-4 py-2 text-sm font-medium text-parchment-50 hover:bg-ink-400"
              >
                Sign in
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </Section>

        {/* Plan */}
        <Section title="Plan & billing" icon={CreditCard} delay={0.1}>
          <div className="flex flex-col gap-4 rounded-2xl border border-ember-200/80 bg-gradient-to-br from-ember-100/60 via-parchment-50 to-parchment-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-ember-500 text-white shadow-ember">
                <BadgeCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-500">
                  You&apos;re on {planDefinition.name}
                </p>
                <p className="mt-0.5 text-xs text-ink-300">
                  {billingStatus
                    ? `Stripe status: ${billingStatus}${renewalDate ? ` until ${renewalDate}` : ""}.`
                    : planDefinition.summary}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={openBilling}
                disabled={billingLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-ember-500 px-4 py-2.5 text-sm font-medium text-white shadow-ember hover:bg-ember-600 disabled:cursor-wait disabled:opacity-70"
              >
                {billingLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                {billingManagedByStripe ? "Manage billing" : "Open billing"}
              </button>
            </div>
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance" icon={Palette} delay={0.15}>
          <Toggle
            icon={Moon}
            title="Reduce motion"
            description="Tones down the floating book cards and writing animations."
            value={prefs.reduceMotion}
            onChange={(v) => updatePref("reduceMotion", v)}
          />
          <Divider />
          <Toggle
            icon={Palette}
            title="Warm parchment theme"
            description="Soft amber and ink palette inspired by old-paper bookcraft. Always on for now — dark mode is on the roadmap."
            value={prefs.warmTheme}
            onChange={(v) => updatePref("warmTheme", v)}
            disabled
          />
          <Divider />
          <SegmentedRow
            icon={Type}
            title="Reader font scale"
            description="Spacing and line height inside the in-app reader."
            value={prefs.readerFontScale}
            onChange={(v) => updatePref("readerFontScale", v)}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
              { value: "spacious", label: "Spacious" },
            ]}
          />
        </Section>

        {/* Generation defaults */}
        <Section title="Generation defaults" icon={Wand2} delay={0.2}>
          <SegmentedRow
            title="Default tone"
            description="Pre-selected on the New Book screen — you can still override per project."
            value={prefs.defaultTone}
            onChange={(v) => updatePref("defaultTone", v)}
            options={[
              { value: "literary", label: "Literary" },
              { value: "warm", label: "Warm" },
              { value: "epic", label: "Epic" },
              { value: "playful", label: "Playful" },
              { value: "clinical", label: "Clinical" },
            ]}
          />
          <Divider />
          <SegmentedRow
            title="Default length"
            description="A starting target — Pro accounts can extend on a per-book basis."
            value={prefs.defaultLength}
            onChange={(v) => updatePref("defaultLength", v)}
            options={[
              { value: "short", label: "Short" },
              { value: "standard", label: "Standard" },
              { value: "long", label: "Long" },
            ]}
          />
        </Section>

        {/* Notifications */}
        <Section title="Notifications" icon={Bell} delay={0.25}>
          <Toggle
            icon={Mail}
            title="Email updates"
            description="Quiet, occasional notes when major features ship. No marketing blasts."
            value={prefs.emailUpdates}
            onChange={(v) => updatePref("emailUpdates", v)}
          />
        </Section>

        {/* Danger zone */}
        <Section title="Account" icon={LogOut} delay={0.3} tone="danger">
          <div className="flex flex-col gap-3 rounded-2xl border border-parchment-300/70 bg-parchment-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-500">
                Sign out of this device
              </p>
              <p className="mt-0.5 text-xs text-ink-300">
                Your library and projects stay intact — you&apos;ll just need to
                sign in again to keep working.
              </p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut || !signedIn}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-ember-200 bg-white px-4 py-2.5 text-sm font-medium text-ember-700 hover:bg-ember-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingOut ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Signing out…
                </>
              ) : (
                <>
                  <LogOut size={14} />
                  Sign out
                </>
              )}
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-ember-200/70 bg-parchment-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-500">
                Request account deletion
              </p>
              <p className="mt-0.5 text-xs text-ink-300">
                We&apos;ll remove your account and all generated books within 7
                days. Send the request from the email tied to your account.
              </p>
            </div>
            <a
              href="mailto:hello@folio.app?subject=Delete%20my%20Folio%20account"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink-500 px-4 py-2.5 text-sm font-medium text-parchment-50 hover:bg-ink-400"
            >
              <Mail size={14} />
              Email support
            </a>
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  delay = 0,
  tone = "default",
}: {
  title: string;
  icon: typeof SettingsIcon;
  children: React.ReactNode;
  delay?: number;
  tone?: "default" | "danger";
}) {
  return (
    <motion.section
      className="mb-6 glass-card rounded-3xl p-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="mb-5 flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            tone === "danger"
              ? "bg-ember-100 text-ember-600"
              : "bg-parchment-200 text-ink-400"
          )}
        >
          <Icon size={14} />
        </span>
        <h2 className="font-serif text-lg font-semibold text-ink-500">
          {title}
        </h2>
      </div>
      {children}
    </motion.section>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-parchment-300/70 bg-parchment-50 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-200">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          accent ? "text-ember-700" : "text-ink-500"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Toggle({
  icon: Icon,
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  icon?: typeof SettingsIcon;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-parchment-200 text-ink-400">
            <Icon size={14} />
          </span>
        )}
        <div>
          <p className="text-sm font-semibold text-ink-500">{title}</p>
          <p className="mt-0.5 text-xs text-ink-300">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200",
          value ? "bg-ember-500" : "bg-parchment-300",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <span
          style={{
            transform: `translateX(${value ? 22 : 2}px)`,
            transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-warm-sm"
        />
      </button>
    </div>
  );
}

function Divider() {
  return <div className="my-4 h-px bg-parchment-200/80" />;
}

function SegmentedRow<T extends string>({
  icon: Icon,
  title,
  description,
  value,
  onChange,
  options,
}: {
  icon?: typeof SettingsIcon;
  title: string;
  description: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-parchment-200 text-ink-400">
            <Icon size={14} />
          </span>
        )}
        <div>
          <p className="text-sm font-semibold text-ink-500">{title}</p>
          <p className="mt-0.5 max-w-md text-xs text-ink-300">{description}</p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 rounded-xl border border-parchment-300/70 bg-parchment-50 p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              value === opt.value
                ? "bg-ink-500 text-parchment-50 shadow-warm-sm"
                : "text-ink-300 hover:bg-parchment-200"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
