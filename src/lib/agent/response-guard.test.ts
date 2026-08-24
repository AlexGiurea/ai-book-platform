/**
 * Response guard — truncated structured output must name itself.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TruncatedResponseError,
  asTruncation,
  callStructured,
  isJsonTruncationError,
} from "./response-guard";

describe("truncation detection", () => {
  it("recognises the error that cost a whole book generation", () => {
    // The literal message from the failed planner run.
    assert.equal(
      isJsonTruncationError(
        new SyntaxError("Unterminated string in JSON at position 2881 (line 1 column 2882)")
      ),
      true
    );
  });

  it("recognises the other shapes a cut-off JSON body produces", () => {
    for (const message of [
      "Unexpected end of JSON input",
      "Unexpected end of input",
      "Unexpected token } in JSON at position 91",
    ]) {
      assert.equal(isJsonTruncationError(new SyntaxError(message)), true, message);
    }
  });

  it("does not swallow unrelated failures", () => {
    for (const message of [
      "Request was aborted.",
      "429 rate limit exceeded",
      "Project abc not found",
      "Connection error",
    ]) {
      assert.equal(isJsonTruncationError(new Error(message)), false, message);
    }
  });
});

describe("error conversion", () => {
  it("names the role, the budget, and the reasoning-token cause", () => {
    const converted = asTruncation(
      new SyntaxError("Unterminated string in JSON at position 2881"),
      "planner",
      32000
    );
    assert.ok(converted instanceof TruncatedResponseError);
    const message = (converted as Error).message;
    assert.match(message, /planner/);
    assert.match(message, /32000/);
    assert.match(message, /[Rr]easoning tokens/);
    assert.match(message, /2881/); // original preserved for debugging
  });

  it("passes non-truncation errors through by identity", () => {
    const original = new Error("Request was aborted.");
    assert.equal(asTruncation(original, "writer", 12000), original);
  });

  it("preserves cancellation, which must keep its own handling", () => {
    const cancelled = new Error("Cancelled");
    assert.equal(asTruncation(cancelled, "critic", 8000), cancelled);
  });
});

describe("callStructured wrapper", () => {
  it("returns the value when the call succeeds", async () => {
    const result = await callStructured("critic", 8000, async () => ({ ok: true }));
    assert.deepEqual(result, { ok: true });
  });

  it("converts a truncation thrown from inside the call", async () => {
    await assert.rejects(
      () =>
        callStructured("book_auditor", 16000, async () => {
          throw new SyntaxError("Unterminated string in JSON at position 40");
        }),
      (err: unknown) => {
        assert.ok(err instanceof TruncatedResponseError);
        assert.equal((err as TruncatedResponseError).role, "book_auditor");
        assert.equal((err as TruncatedResponseError).maxOutputTokens, 16000);
        return true;
      }
    );
  });

  it("rethrows anything else unchanged", async () => {
    const original = new Error("boom");
    await assert.rejects(
      () => callStructured("writer", 12000, async () => { throw original; }),
      (err: unknown) => err === original
    );
  });
});
