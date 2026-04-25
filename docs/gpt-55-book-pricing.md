# GPT-5.5 Book Generation Cost Estimate

Source: OpenAI API pricing, accessed April 24, 2026, lists GPT-5.5 at $5.00 per 1M input tokens, $0.50 per 1M cached input tokens, and $30.00 per 1M output tokens.

These estimates are for text generation only. They exclude cover/image generation, database/storage costs, Vercel costs, and unusually large uploaded context files.

## Assumptions

- Model: `gpt-5.5`
- App flow: one planner call, then one writer call per manuscript batch.
- Batch size: 2,800 target words from `WORDS_PER_BATCH`.
- Preset targets: `dev` 12,000 words, `short` 24,000, `medium` 40,000, `long` 60,000, `large` 120,000, `tome` 188,000.
- Token conversion: about 1.33 output tokens per English prose word.
- Planner output and rolling writer context are estimated from the current prompt structure.
- Headline cost assumes no prompt cache hits. Real runs may be lower because GPT-5.5 supports prompt caching, but cache effectiveness depends on repeated prompt prefixes and request timing.

## Estimate Table

| Preset | Target words | Writer batches | Estimated input tokens | Estimated output tokens | GPT-5.5 estimate | Budget with 30% buffer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `dev` | 12,000 | 4 | 55,125 | 20,352 | $0.89 | $1.15 |
| `short` | 24,000 | 9 | 146,205 | 41,917 | $1.99 | $2.59 |
| `medium` | 40,000 | 14 | 259,345 | 63,982 | $3.22 | $4.18 |
| `long` | 60,000 | 21 | 442,297 | 94,473 | $5.05 | $6.56 |
| `large` | 120,000 | 43 | 1,247,249 | 191,159 | $11.97 | $15.56 |
| `tome` | 188,000 | 67 | 2,491,713 | 296,271 | $21.35 | $27.75 |

For comparison, GPT-5.4 is priced at half the GPT-5.5 text rates, so the same estimates would be roughly 50% lower before caching or Batch API discounts.
