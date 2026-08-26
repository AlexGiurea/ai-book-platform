/**
 * The parts of verification that decide whether people can use the product.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { verificationRequired, verificationUrl } from "./verification";

const KEYS = ["FOLIO_REQUIRE_EMAIL_VERIFICATION", "RESEND_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};
for (const key of KEYS) saved[key] = process.env[key];

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("when verification is enforced", () => {
  it("does not gate when no mail provider is configured", () => {
    // The important case. Blocking generation behind a link the app cannot
    // send would lock every new account out of the product with no way through.
    setEnv({ RESEND_API_KEY: undefined, FOLIO_REQUIRE_EMAIL_VERIFICATION: undefined });
    assert.equal(verificationRequired(), false);
  });

  it("gates as soon as mail can actually be delivered", () => {
    setEnv({ RESEND_API_KEY: "re_test", FOLIO_REQUIRE_EMAIL_VERIFICATION: undefined });
    assert.equal(verificationRequired(), true);
  });

  it("treats a blank provider key as no provider", () => {
    setEnv({ RESEND_API_KEY: "   ", FOLIO_REQUIRE_EMAIL_VERIFICATION: undefined });
    assert.equal(verificationRequired(), false);
  });

  it("lets the flag force it off even with a provider", () => {
    setEnv({ RESEND_API_KEY: "re_test", FOLIO_REQUIRE_EMAIL_VERIFICATION: "false" });
    assert.equal(verificationRequired(), false);
    setEnv({ RESEND_API_KEY: "re_test", FOLIO_REQUIRE_EMAIL_VERIFICATION: "0" });
    assert.equal(verificationRequired(), false);
  });

  it("lets the flag force it on with no provider, for a staging environment", () => {
    setEnv({ RESEND_API_KEY: undefined, FOLIO_REQUIRE_EMAIL_VERIFICATION: "true" });
    assert.equal(verificationRequired(), true);
    setEnv({ RESEND_API_KEY: undefined, FOLIO_REQUIRE_EMAIL_VERIFICATION: "1" });
    assert.equal(verificationRequired(), true);
  });

  it("ignores an unrecognised flag rather than guessing", () => {
    setEnv({ RESEND_API_KEY: "re_test", FOLIO_REQUIRE_EMAIL_VERIFICATION: "maybe" });
    assert.equal(verificationRequired(), true, "falls back to provider presence");
  });
});

describe("verification links", () => {
  it("builds a link against the app's own origin", () => {
    assert.equal(
      verificationUrl("abc123", "https://folio.example.com"),
      "https://folio.example.com/api/auth/verify?token=abc123"
    );
  });

  it("does not double the slash when the base URL has a trailing one", () => {
    assert.equal(
      verificationUrl("abc", "https://folio.example.com/"),
      "https://folio.example.com/api/auth/verify?token=abc"
    );
  });

  it("escapes a token so a stray character cannot truncate the query", () => {
    const link = verificationUrl("a+b/c=d&e", "https://x.dev");
    assert.ok(!link.includes("&e="), "an unescaped & would start a second param");
    assert.match(link, /token=a%2Bb%2Fc%3Dd%26e$/);
  });
});
