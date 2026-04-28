import { NextResponse } from "next/server";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rejectCrossOrigin(request: Request): NextResponse | null {
  if (SAFE_METHODS.has(request.method)) return null;

  const origin = request.headers.get("origin");
  if (!origin) return null;

  const host = request.headers.get("host");
  if (!host) {
    return NextResponse.json(
      { error: "Missing host header." },
      { status: 400 }
    );
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const requestUrl = new URL(request.url);
  const expectedProtocol = forwardedProto
    ? `${forwardedProto}:`
    : requestUrl.protocol;

  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol === expectedProtocol && originUrl.host === host) {
      return null;
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid origin header." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: "Cross-origin request blocked." },
    { status: 403 }
  );
}

export function rateLimit(
  request: Request,
  options: RateLimitOptions
): NextResponse | null {
  const now = Date.now();
  const id = `${options.key}:${clientIp(request)}`;
  const current = buckets.get(id);

  if (!current || current.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  current.count += 1;
  if (current.count <= options.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }
  );
}

export async function readJsonLimited(
  request: Request,
  maxBytes: number
): Promise<{ data: unknown } | { response: NextResponse }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return {
      response: NextResponse.json(
        { error: "Request body is too large." },
        { status: 413 }
      ),
    };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      response: NextResponse.json(
        { error: "Could not read request body." },
        { status: 400 }
      ),
    };
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return {
      response: NextResponse.json(
        { error: "Request body is too large." },
        { status: 413 }
      ),
    };
  }

  try {
    return { data: JSON.parse(text) };
  } catch {
    return {
      response: NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      ),
    };
  }
}
