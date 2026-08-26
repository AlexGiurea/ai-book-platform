/**
 * The application's own base URL.
 *
 * Lives here rather than in the Stripe module because verification emails and
 * auth redirects need it, and importing that module pulls the Stripe SDK into
 * routes that have nothing to do with payments.
 */
export function getAppBaseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ??
    new URL(request.url).origin
  ).replace(/\/$/, "");
}
