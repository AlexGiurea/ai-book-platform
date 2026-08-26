import { NextResponse } from "next/server";
import {
  LENGTH_ORDER,
  LENGTH_TARGET_WORDS,
  OVERAGE_USD_PER_1K_WORDS,
  checkAffordability,
  monthlyWordsFor,
  periodEnd,
} from "@/lib/billing/allowance";
import { getUsage, recentEntries } from "@/lib/billing/ledger";
import { getCurrentUser } from "@/lib/auth/session";
import { concurrentBooksFor, getPlanDefinition, isOwnerEmail } from "@/lib/plans";
import { store } from "@/lib/agent";
import { rateLimit } from "@/lib/security/request";

export const runtime = "nodejs";

/**
 * Where the signed-in account stands this month, plus which lengths they can
 * still afford. The create page needs the second part to disable a preset
 * before someone picks it rather than after they submit.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    key: "usage:read",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = isOwnerEmail(user.email);
  const usage = await getUsage({ userId: user.id, plan: user.plan, isOwner });
  const allowance = monthlyWordsFor(user.plan, isOwner);
  const definition = getPlanDefinition(user.plan);

  const lengths = LENGTH_ORDER.map((preset) => {
    const words = LENGTH_TARGET_WORDS[preset];
    const check = checkAffordability({
      allowance,
      used: usage.used,
      requested: words,
    });
    return {
      preset,
      words,
      affordable: check.ok,
      shortfall: check.shortfall,
      shortfallUsd: check.shortfallUsd,
    };
  });

  const activeBooks = await store.countActiveProjectsForUser(user.id);

  return NextResponse.json({
    concurrency: {
      limit: concurrentBooksFor(user.plan),
      active: activeBooks,
    },
    plan: {
      id: definition.id,
      name: definition.name,
      price: definition.price,
      monthlyWords: definition.monthlyWords,
    },
    unlimited: usage.unlimited,
    // Infinity is not valid JSON; the client reads `unlimited` instead.
    allowance: usage.unlimited ? null : usage.allowance,
    used: usage.used,
    remaining: usage.unlimited ? null : usage.remaining,
    period: { start: usage.period, end: periodEnd() },
    overageUsdPer1kWords: OVERAGE_USD_PER_1K_WORDS,
    lengths,
    recent: await recentEntries(user.id, 10),
  });
}
