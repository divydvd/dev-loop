# Budget Mode Live A/B Benchmark Report (`2026-11-27`)

## Abstract
Standard `dev-loop` runs dispatch a multi-specialist Step-5 review panel and run per-test verification loops even on routine non-risky features.
This live A/B benchmark compares Standard mode (`Budget mode: off`) against Budget mode (`Budget mode: on`) on task `B7-webhook-queue` at plugin commit `eb2599c` (`v0.5.24`, [#54](https://github.com/divydvd/dev-loop/pull/54)) with `claude-sonnet-5.5` held constant on both arms.
Budget mode reduced total AI Units (`AIUs`, where `1 AIU = 1,000,000,000 nanoAiu`) from `70.15 AIUs` to `34.25 AIUs` (`-51.2%`, or `2.05x` cheaper), cut API requests from `30` to `16` (`-46.7%`), and passed `11/11` blind oracle invariants (`O1`–`O11`).

## Test setup
Both arms ran inside isolated temporary `COPILOT_HOME` and Git sandboxes with identical model, flags, task prompt, and hidden oracle grading.

- **Date:** `2026-11-27`
- **Plugin version:** `v0.5.24` (`eb2599c`, [#54](https://github.com/divydvd/dev-loop/pull/54))
- **Model on both arms:** `claude-sonnet-5.5` (`1x` multiplier)
- **CLI invocation flags:** `--autopilot --max-autopilot-continues 10 --allow-all --trust-folder --disable-builtin-mcps`
- **Task (`B7-webhook-queue`):** Implement `createWebhookQueue` in `src/webhook-queue.mjs` with Hash-based Message Authentication Code (`HMAC`) `sha256=` signature checks, Time To Live (`TTL`) deduplication, concurrent in-flight coalescing, bounded retries, unit tests in `src/webhook-queue.test.mjs`, and a synchronized flow update in `docs/flows/webhooks.md`.
- **Checklist triggers:** `docs/testing/review-checklist.md` defines `SEC-01` (`security-privacy`), `CONC-01` (`concurrency-state`), and `ARCH-01` (`arch-correctness`) so a non-risky `~100`-line diff triggers `2+` specialist domains in Standard mode (`panel`) and collapses to `single` in Budget mode.
- **Controlled variable:** Arm A committed `Budget mode: Enabled: no` in `AGENTS.md`; Arm B committed `Budget mode: Enabled: yes` in `AGENTS.md` and prepended `"budget mode\n\n"` to the task prompt.

## Head-to-head results

| Metric | Arm A (`standard-off`, `Budget mode: off`) | Arm B (`budget-on`, `Budget mode: on`) | Delta (Arm B vs Arm A) |
| --- | --- | --- | --- |
| Total cost (`AIUs`) | `70.15 AIUs` | `34.25 AIUs` | `-51.2%` (`2.05x` cheaper) |
| Total cost (`nanoAiu`) | `70,148,370,000` | `34,254,080,000` | `-35,894,290,000` (`-51.2%`) |
| API requests | `30` | `16` | `-14` (`-46.7%`) |
| Total API time | `146.3 s` | `92.9 s` | `-53.4 s` (`-36.5%`) |
| Cache-write tokens | `160,187` | `51,139` | `-109,048` (`-68.1%`) |
| Cache-read tokens | `1,173,722` | `750,273` | `-423,449` (`-36.1%`) |
| Total input tokens | `1,333,981` | `801,450` | `-532,531` (`-39.9%`) |
| Output tokens | `18,350` | `13,959` | `-4,391` (`-23.9%`) |
| Step-5 review cost | `29.80 AIUs` (`4` subagents) | `2.97 AIUs` (`1` subagent) | `-26.83 AIUs` (`-90.0%`) |
| `node --test` runs | `10` | `6` | `-4` (`-40.0%`) |
| Git commits | `2` (`fdc02be`, `00c5897`) | `1` (`0041d15`) | `-1` |
| Production lines (`src/webhook-queue.mjs`) | `100` (`+97/-3`) | `96` (`+93/-3`) | `-4` |
| Unit tests (`src/webhook-queue.test.mjs`) | `10/10` passed | `10/10` passed | Parity |
| Flow doc (`docs/flows/webhooks.md`) | Updated (`+18/-2`) | Updated (`+13/-2`) | Parity |
| Blind oracle (`O1`–`O11`) | `11/11` passed | `11/11` passed | Parity |

## Per-agent `usage.json` breakdown

### Arm A (`standard-off`, `Budget mode: off`)

| Agent session | API calls | Cost (`AIUs`) | Cache-write tokens | Cache-read tokens | Output tokens | API time (`s`) |
| --- | --- | --- | --- | --- | --- | --- |
| `main` | `17` | `40.35` | `70,519` | `911,182` | `13,598` | `98.3` |
| `rev-conc` | `4` | `9.67` | `29,365` | `80,462` | `1,518` | `15.4` |
| `rev-sec` | `4` | `9.22` | `28,979` | `80,331` | `1,173` | `12.8` |
| `rev-arch` | `3` | `8.77` | `28,282` | `52,397` | `1,178` | `12.4` |
| `rev-judge` | `2` | `2.14` | `3,042` | `49,350` | `883` | `7.4` |
| **Arm A total** | **`30`** | **`70.15`** | **`160,187`** | **`1,173,722`** | **`18,350`** | **`146.3`** |

### Arm B (`budget-on`, `Budget mode: on`)

| Agent session | API calls | Cost (`AIUs`) | Cache-write tokens | Cache-read tokens | Output tokens | API time (`s`) |
| --- | --- | --- | --- | --- | --- | --- |
| `main` | `13` | `31.29` | `46,705` | `673,002` | `12,875` | `82.8` |
| `single-reviewer` | `3` | `2.97` | `4,434` | `77,271` | `1,084` | `10.1` |
| **Arm B total** | **`16`** | **`34.25`** | **`51,139`** | **`750,273`** | **`13,959`** | **`92.9`** |

Each cold specialist subagent in Arm A paid roughly `28k–29k` prompt cache-write tokens to load system instructions and repository context.
Collapsing the `4`-subagent panel (`29.80 AIUs`) into `1` `single-reviewer` (`2.97 AIUs`) saved `26.83 AIUs` (`-90.0%` of review cost) while keeping all `3` checklist rules (`SEC-01`, `CONC-01`, `ARCH-01`) inside `single-reviewer-packet.md`.
Slice-batched Test-Driven Development (`TDD`) in `main` saved the remaining `9.06 AIUs` by cutting `node --test` invocations from `10` to `6`.

## Blind oracle invariants (`O1`–`O11`) and quality observations
Both arms passed all `11` hidden post-run oracle checks:

1. `O1`: Reject invalid factory options synchronously (`secret=""`, non-string `secret`, `deliver=null`, `ttlMs=0`, non-finite `ttlMs`, `maxRetries=-1`, non-integer `maxRetries`, and non-function `now`; in the `eb2599c` pre-codification prompt, `now` validation was optional and has now been codified in `B7-webhook-queue`).
2. `O2`: Deliver a valid `"sha256=" + hmacHex` event on attempt `1` (`{ accepted: true, status: "delivered", attempts: 1 }`, `queue.size() === 1`).
3. `O3`: Reject a wrong `64`-character hex signature with `invalid_signature` and `0` delivery calls.
4. `O4`: Handle `""`, `"sha256=abc"`, `"sha256=" + "z".repeat(64)`, `"md5=" + "a".repeat(64)`, `null`, and `undefined` in `timingSafeEqual` without throwing `RangeError`.
5. `O5`: Reject blank or whitespace `eventId` and non-string `rawBody` with `invalid_payload` and `0` delivery calls.
6. `O6`: Deduplicate within `[deliveredAt, deliveredAt + ttlMs)` (`duplicate` at `deliveredAt + ttlMs - 1`) and evict or redeliver at `now() >= deliveredAt + ttlMs`.
7. `O7`: Reject a forged signature on an already-cached `eventId` with `invalid_signature` (verifying payload and signature before cache or in-flight lookup).
8. `O8`: Coalesce concurrent valid in-flight calls for the same `eventId` so `deliver` runs once and both callers resolve with `accepted: true`.
9. `O9`: Retry transient errors up to `1 + maxRetries` total attempts and cache on success.
10. `O10`: Stop immediately (`attempts: 1`) when `err.retryable === false`.
11. `O11`: Never cache `eventId` when all retries fail (`status: "delivery_failed"`, `size() === 0`), allowing a later retry to succeed, and update `docs/flows/webhooks.md` in the same branch.

Qualitative differences between the two arms were small:
- Arm A (`standard-off`) added an extra `typeof now === "function"` check in `createWebhookQueue`, and its `rev-conc` specialist caught a missing unit test for concurrent coalesced failure, which `main` added in a second commit (`00c5897`).
- Arm B (`budget-on`) included the concurrent coalesced-failure test directly in its first slice-batched TDD pass (`0041d15`), and `single-reviewer` verified `SEC-01`, `CONC-01`, and `ARCH-01` cleanly in one pass.

## Subscription capacity impact
A Premium Request Unit (`PRU`) is one billed Copilot request multiplied by the active model multiplier (`3x` for Opus-tier models, `1x` for Sonnet-tier models).

| Workflow configuration | Estimated `PRUs` per feature | `$10` Copilot Pro (`300 PRUs/mo`) | `$39` Copilot Pro+ (`1,500 PRUs/mo`) |
| --- | --- | --- | --- |
| `Standard + Opus (3x)` | `~120–240 PRUs` | `1–2` features/mo | `6–12` features/mo |
| `Standard + Sonnet (1x)` | `~40–80 PRUs` | `3–7` features/mo | `18–37` features/mo |
| `Budget + Sonnet (1x)` | `~10–25 PRUs` | `12–30` features/mo | `60–150` features/mo |

## Reproducing this benchmark
Run the deterministic zero-credit grader check in CI, or run a live A/B evaluation from a local checkout:

```sh
# Zero-credit CI verification of B1-B7, budget-mode flags, and usage.json telemetry
node --test scripts/run-benchmark.test.mjs

# Live Standard-vs-Budget A/B run on B7-webhook-queue (spends real Copilot credits)
node scripts/run-benchmark.mjs \
  --baseline . \
  --candidate . \
  --candidate-budget-mode \
  --tasks B7-webhook-queue \
  --samples 1
```

## Conclusion
Enable `budget mode` with a `1x` model (`claude-sonnet-5.5`) for routine non-risky features (`<= 400` production lines) to cut `AIU` cost by roughly half while keeping Step-6 test and oracle quality intact.
Keep `standard mode` (or automatic risky-area escalation) for `### Risky areas`, subtle concurrency changes where specialist depth (`rev-conc`) adds extra test scrutiny, and diffs above `400` production lines.
Use `node scripts/run-benchmark.mjs --baseline . --candidate . --candidate-budget-mode --tasks B7-webhook-queue` whenever future rule edits change review routing or TDD batching.
