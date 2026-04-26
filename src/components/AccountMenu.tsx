"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CreditCard,
  LifeBuoy,
  LogIn,
  LogOut,
  Settings,
  User,
  UserPlus,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

function initialsFor(user: AuthUser) {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase() || "U";
    }
    return user.name.slice(0, 2).toUpperCase() || "U";
  }
  return user.email.slice(0, 2).toUpperCase() || "U";
}

const itemVariants: Record<"light" | "dark", string> = {
  light: "text-ink-500 hover:bg-parchment-200/80",
  dark: "text-parchment-100 hover:bg-white/10",
};

export default function AccountMenu({
  user,
  variant = "light",
}: {
  user: AuthUser | null;
  variant?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/";
  }

  const v = variant;
  const itemClass = (extra?: string) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
      itemVariants[v],
      extra
    );
  const subIcon = v === "dark" ? "text-parchment-400" : "text-ink-400";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 shadow-warm-sm transition",
          v === "light" &&
            "border-parchment-200/90 bg-parchment-50 text-ink-500 hover:border-ember-200 hover:bg-white hover:shadow-warm focus:ring-2 focus:ring-ember-500/25 focus:ring-offset-2 focus:ring-offset-parchment-50",
          v === "dark" &&
            "border-white/20 bg-white/10 text-parchment-100 shadow-black/20 hover:border-white/30 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-ember-500/40 focus:ring-offset-2 focus:ring-offset-ink-500"
        )}
        aria-label="Account"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {user ? (
          <span className="text-xs font-bold tabular-nums tracking-tight">{initialsFor(user)}</span>
        ) : (
          <User className={cn("h-[22px] w-[22px]", v === "dark" ? "text-parchment-300" : "text-ink-400")} strokeWidth={1.75} />
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full z-[60] mt-2 w-60 origin-top-right overflow-hidden rounded-2xl border py-1.5 shadow-warm-xl backdrop-blur-md",
            v === "light" && "border-parchment-200/80 bg-parchment-50/98",
            v === "dark" && "border-white/10 bg-ink-500/96 text-parchment-100"
          )}
          role="menu"
        >
          {user && (
            <div
              className={cn("border-b px-3.5 py-2.5", v === "light" && "border-parchment-200/70", v === "dark" && "border-white/10")}
            >
              <p className={cn("truncate text-sm font-semibold", v === "light" && "text-ink-500", v === "dark" && "text-parchment-50")}>
                {user.name || "Folio reader"}
              </p>
              <p className={cn("truncate text-xs", v === "light" && "text-ink-400", v === "dark" && "text-parchment-400")}>
                {user.email}
              </p>
            </div>
          )}

          <div className="p-1.5">
            {user && (
              <>
                <Link href="/dashboard" className={itemClass()} onClick={() => setOpen(false)} role="menuitem">
                  <BookOpen size={16} className={subIcon} />
                  Library
                </Link>
                <Link href="/settings" className={itemClass()} onClick={() => setOpen(false)} role="menuitem">
                  <Settings size={16} className={subIcon} />
                  Settings
                </Link>
                <Link href="/pricing" className={itemClass()} onClick={() => setOpen(false)} role="menuitem">
                  <CreditCard size={16} className={subIcon} />
                  Plan &amp; billing
                </Link>
                <Link href="/help" className={itemClass()} onClick={() => setOpen(false)} role="menuitem">
                  <LifeBuoy size={16} className={subIcon} />
                  Help
                </Link>
                <div
                  className={cn("my-1.5 h-px", v === "light" && "bg-parchment-200/80", v === "dark" && "bg-white/10")}
                />
                <button type="button" className={itemClass()} onClick={logout} role="menuitem">
                  <LogOut size={16} className={subIcon} />
                  Sign out
                </button>
              </>
            )}
            {!user && (
              <>
                <Link href="/signin" className={itemClass()} onClick={() => setOpen(false)} role="menuitem">
                  <LogIn size={16} className={subIcon} />
                  Sign in
                </Link>
                <Link href="/signup" className={itemClass()} onClick={() => setOpen(false)} role="menuitem">
                  <UserPlus size={16} className={subIcon} />
                  Create account
                </Link>
                <Link href="/product" className={itemClass()} onClick={() => setOpen(false)} role="menuitem">
                  <Settings size={16} className={subIcon} />
                  Product
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
