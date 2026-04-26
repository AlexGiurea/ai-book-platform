import Link from "next/link";
import { Feather } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  href?: string;
}

export default function BrandLogo({
  className,
  markClassName,
  textClassName,
  href = "/",
}: BrandLogoProps) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2", className)}>
      <span
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-xl text-ember-600 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105",
          markClassName
        )}
        aria-hidden
      >
        <Feather size={24} strokeWidth={1.8} className="-rotate-12" />
        <span className="absolute bottom-1.5 right-1.5 h-px w-3 rotate-[-18deg] rounded-full bg-current opacity-70" />
      </span>
      <span
        className={cn(
          "font-serif text-lg font-semibold tracking-tight text-ink-500",
          textClassName
        )}
      >
        Folio
      </span>
    </Link>
  );
}
