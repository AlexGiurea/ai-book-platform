/**
 * Planner abort margin before the route's maxDuration of 300s. Browser-safe export.
 *
 * Measured: the staged spine call takes ~208s at medium reasoning effort. The
 * previous 230s left only 22s of headroom, so ordinary variance would abort a
 * valid planning run. 270s keeps ~60s of headroom above the measurement while
 * still leaving 30s under the platform limit for the abort to propagate and the
 * failure to be recorded.
 *
 * If this needs raising again, lower the planner's reasoning effort instead —
 * the platform ceiling is fixed and effort is what drives the latency.
 */
export const PLANNER_TIMEOUT_MS = 270_000;
