"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  LogIn,
  LogOut,
  Plus,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

interface NavbarProps {
  variant?: "transparent" | "solid";
}

export default function Navbar({ variant = "solid" }: NavbarProps) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { user?: unknown }) => {
        if (!cancelled) setSignedIn(Boolean(data.user));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/";
  }

  const navLinks = [
    { href: "/pricing", label: "Pricing", icon: BadgeDollarSign },
  ];

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        variant === "solid" ? "glass-nav" : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <BrandLogo markClassName="h-7 w-7" />

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                pathname === href
                  ? "bg-parchment-200 text-ink-500"
                  : "text-ink-300 hover:text-ink-500 hover:bg-parchment-200/60"
              )}
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-2">
          {signedIn ? (
            <button
              type="button"
              onClick={logout}
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:bg-parchment-200/60 hover:text-ink-500 sm:flex"
            >
              <LogOut size={14} />
              Sign out
            </button>
          ) : (
            <Link
              href="/signin"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:bg-parchment-200/60 hover:text-ink-500 sm:flex"
            >
              <LogIn size={14} />
              Sign in
            </Link>
          )}
          <Link
            href={signedIn ? "/create" : "/signup"}
            className="flex items-center gap-1.5 px-4 py-2 bg-ink-500 hover:bg-ink-400 text-parchment-50 text-sm font-medium rounded-lg transition-all duration-150 shadow-warm-sm hover:shadow-warm"
          >
            <Plus size={14} />
            {signedIn ? "New Book" : "Start free"}
          </Link>
        </div>
      </div>
    </nav>
  );
}
