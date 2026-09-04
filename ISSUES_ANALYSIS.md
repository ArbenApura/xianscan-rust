# XianScan Issues Analysis, Technical Evidence, and Implementation Plan

This document compiles the complete technical audit of reported GitHub issues (#1 and #3), documenting user issue feedback, upstream API mechanics, code evidence with line citations, lifecycle code flows, and the full architectural resolution plan.

---

## 1. Issue #1 - Silent Translation Failures with Reasoning Models

- Issue URL (https://github.com/ArbenApura/xianscan-rust/issues/1)
- Reported by `lenaxia`
- Affected pipeline modules include SvelteKit Translation Engine (`web/src/lib/server/translate.ts`), Chapter Processing Pipeline (`web/src/lib/server/chapter-pipeline.ts`), and LLM Provider Wrapper (`web/src/lib/server/llm.ts`).

### User Report and Feedback Overview

The user reported that when running reasoning models such as GLM-4.7 via LiteLLM or other OpenAI-compatible endpoints, comic translation fails silently.

The user identified four specific breakdown points in the pipeline.

1. **Hardcoded Token Budget Floor** - `callTranslate` clamped completion tokens to `Math.max(1024, ...)`. Reasoning models spend completion tokens on internal thinking steps before emitting visible text. A 1024 token budget cuts off the model mid-thought, returning an empty message.
2. **Blind Retries Without Budget Escalation** - When `EMPTY_LLM_RESPONSE` was thrown, `withRetry` repeated the exact same call with the exact same budget 3 times, causing multi-minute stalls without resolving the issue.
3. **Loss of Raw LLM Prompt** - The prompt variable `m1` was assigned only after `callTranslate` succeeded. When the call failed or timed out, `m1` remained an empty array, persisting `llmPrompt = "[]"` to SQLite and preventing users from inspecting what went wrong.
4. **Silent Error Swallowing and False Completion** - In `chapter-pipeline.ts`, when translation of all regions failed, the page was still marked with `status: 'done'` and `error: null`. The pipeline then typeset empty text over the inpainted page, saving blank speech bubbles as a completed chapter.

Our audit uncovered a fifth contributing issue.

5. **Provider Context Dropping in Parameter Helpers** - In `web/src/lib/server/llm.ts`, `thinkingParam(model)` was called without the active provider identifier. Model strings containing slashes, hyphens, or colons were misidentified as custom model names, dropping provider-specific reasoning suppression parameters.

---

### Upstream Model Behavior and Token Budgets

In OpenAI-compatible chat completion APIs, reasoning models (such as GLM-4.7, DeepSeek R1, OpenAI o1/o3, and Qwen 2.5 thinking variants) allocate tokens from the shared `max_tokens` (or `max_completion_tokens`) pool.

```
Total Completion Budget = Reasoning Tokens (internal) + Content Tokens (visible JSON output)
```

When an application sets `max_tokens` to 1024 on a page containing multiple dialogue blocks, the following sequence occurs.

1. The model enters its internal reasoning phase and consumes 1024 tokens thinking about tone, grammar, and character alignment.
2. The completion budget hits the limit before the model can emit the closing translation JSON block.
3. The upstream provider terminates generation and returns `finish_reason` of `length`.
4. The message `content` field is either completely empty or truncated mid-sentence.
5. In LiteLLM and Zhipu GLM-4.7 setups, reasoning cannot always be turned off via `reasoning_effort` of `none`. If the budget is constrained to 1024, every request fails with `finish_reason` of `length`.

---

### Code Evidence and Exact File Citations

#### Evidence 1 - Hardcoded Token Limit Floor in `translate.ts`

In `web/src/lib/server/translate.ts` at line 61, the budget was clamped to a fixed floor.

```typescript
const sourceChars = regions.reduce((n, r) => n + r.text.length, 0);
const maxTokens = Math.max(1024, Math.ceil(sourceChars * 4 + 1024));
```

The minimum floor was set to 1024 tokens. For a page with 150 source characters, `maxTokens` evaluated to `1024 + 600 = 1624`. This was insufficient for reasoning models that easily generate 2000 or more tokens of internal thoughts before producing output.

#### Evidence 2 - Blind Retry Loop and Empty Error Handling in `translate.ts`

In `web/src/lib/server/translate.ts` at lines 63-112, retries repeated identical requests.

```typescript
const resp = await queued(() =>
    withRetry(
        async () => {
            const r = await client.chat.completions.create({
                model,
                messages,
                temperature: 0.2,
                max_tokens: maxTokens,
                ...thinkingParam(model),
            }, { signal: opts.signal });
            const rawContent = r.choices[0]?.message?.content ?? '';
            const stripped = stripThinkingTags(rawContent).trim();
            if (!stripped) {
                throw new Error('EMPTY_LLM_RESPONSE');
            }
            const parsed = parseTranslations(stripped, new Set(regions.map((reg) => reg.id)), regions);
            if (!parsed || parsed.size === 0) {
                throw new Error('EMPTY_LLM_RESPONSE');
            }
            return r;
        },
        3,
    ),
);
```

The retry wrapper ran 3 times with the exact same `maxTokens` value. If the model hit the length limit on attempt 1, attempts 2 and 3 encountered the exact same budget and failed identically. Each attempt took 30 to 45 seconds, stalling the chapter pipeline for up to 160 seconds.

#### Evidence 3 - Lost Prompt Variable in `translatePage`

In `web/src/lib/server/translate.ts` at lines 158-171, prompt tracking was lost on exceptions.

```typescript
let raw = '';
let u1 = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0 } as TranslationUsage;
let m1: OpenAI.Chat.ChatCompletionMessageParam[] = [];
try {
    const res = await callTranslate(translatableRegions, terms, pair, opts);
    raw = res.raw;
    u1 = res.usage;
    m1 = res.messages;
} catch (err) {
    if (err instanceof Error && err.message === 'EMPTY_LLM_RESPONSE') {
        raw = '';
    } else {
        throw err;
    }
}
...
return {
    byRegion,
    usage,
    newTerms: discoveredTerms,
    rawPrompt: JSON.stringify(m1, null, 2),
};
```

When `callTranslate` threw `EMPTY_LLM_RESPONSE`, execution jumped directly into the `catch` block. The variable `m1` remained initialized to an empty array `[]`. As a result, `rawPrompt` was returned as `"[]"`, discarding the actual user and system messages that were constructed and sent to the LLM.

#### Evidence 4 - False Done Status in `chapter-pipeline.ts`

In `web/src/lib/server/chapter-pipeline.ts` at lines 1055-1106, completions were marked successful unconditionally.

```typescript
const typesetRegions = analyzed.regions
    .filter((r) => Boolean(byRegion.get(r.id)?.trim()))
    .map((r) => ({ ... }));

const out = await typesetPage(cleaned, typesetRegions, deps.typesetOptions);
writeFileSync(join(deps.dataRoot, outputPath), out);

db.update(pages)
    .set({
        status: 'done',
        cleanedPath: cleanPath,
        outputPath,
        ...
    })
    .where(eq(pages.id, page.id))
    .run();
```

When `byRegion` was empty due to swallowed translation failures, `typesetRegions` became `[]`. The `typesetPage` function rendered zero text blocks onto the cleaned background. The pipeline then unconditionally updated `status: 'done'` with no error message, hiding the failure from the user interface.

#### Evidence 5 - Provider Context Loss in `llm.ts`

In `web/src/lib/server/llm.ts` at lines 95-126, model name parsing overshadowed the provider.

`thinkingParam` inspected `providerIdOrModel`. When called as `thinkingParam(model)`, any model name containing a hyphen (such as `glm-4.7` or `deepseek-chat`) or slash was assigned to the model variable `m`, leaving provider variable `p` empty. This prevented provider-specific thinking suppression parameters from being applied.

---

### Code Flow Lifecycle

#### The Previous Failure Flow

```
1. Chapter Pipeline calls translatePage(regions)
2. callTranslate builds prompt messages
3. maxTokens clamped to Math.max(1024, ...) -> 1024 tokens
4. withRetry Attempt 1
   - LLM starts thinking phase
   - Consumes 1024 tokens on reasoning
   - Upstream API halts with finish_reason of length
   - choices[0].message.content is empty
   - Throws EMPTY_LLM_RESPONSE
5. withRetry Attempts 2 and 3
   - Repeated with identical 1024 budget
   - Both hit length limit and throw EMPTY_LLM_RESPONSE
6. translatePage catch block
   - Swallows EMPTY_LLM_RESPONSE
   - Leaves m1 as []
   - Returns empty byRegion map and rawPrompt = "[]"
7. Chapter Pipeline receives empty byRegion
   - Typesets zero text blocks over inpainting
   - Marks page as status = 'done' in SQLite
   - User sees blank speech bubbles and empty prompt []
```

#### The Resolved Architecture Flow

```
1. Chapter Pipeline calls translatePage(regions)
2. Prompt messages constructed upfront and preserved in scope
3. Base token budget floor raised to Math.max(4096, sourceChars * 6 + 2048)
4. withRetry Attempt 1 with finish_reason inspection
   - If finish_reason is length or response is empty
     - Escalate max_tokens for next attempt to baseMaxTokens * 2 (for example, 4096 -> 8192 -> 16384)
     - Log diagnostic warning
5. Differentiated error taxonomy
   - TOKEN_BUDGET_EXHAUSTED if length limit persists after escalation
   - EMPTY_LLM_RESPONSE if model returns empty on normal stop
   - UNPARSEABLE_LLM_OUTPUT if response fails JSON schema validation
6. Diagnostics capture
   - rawPrompt preserves full messages array even on failure
   - finishReason and error message saved to llmResponse in database
7. Chapter Pipeline status handling
   - If all translatable regions fail, page marked status = 'error'
   - If partial regions fail, page marked status = 'done' with warning banner
   - User sees clear error badge in reader, Inspector displays exact prompt and retry button
```

---

### Implementation Plan for Issue #1

#### Component 1 - Translation Engine (`web/src/lib/server/translate.ts`)

1. Construct the messages array upfront so `rawPrompt` is available in all execution branches.
2. Raise the default token budget floor from 1024 to 4096, scaling dynamically with source character count via `Math.max(4096, Math.ceil(sourceChars * 6 + 2048))`.
3. In `callTranslate`, inspect `choice.finish_reason`. When `finish_reason === 'length'` or content is empty, escalate `max_tokens` across retries (`maxTokens * 2^attempt`, capped at 65536).
4. Introduce explicit error codes.
   - `TOKEN_BUDGET_EXHAUSTED` when `finish_reason === 'length'` and content remains empty.
   - `EMPTY_LLM_RESPONSE` when content is empty under a normal stop reason.
   - `UNPARSEABLE_LLM_OUTPUT` when text is returned but cannot be parsed into region mappings.
5. In `translatePage`, return diagnostic fields (`error`, `finishReason`, `rawPrompt`, `rawResponse`) even when retries fail.
6. Pass both `providerId` and `model` explicitly to `thinkingParam(providerId, model)`.

#### Component 2 - Chapter Pipeline (`web/src/lib/server/chapter-pipeline.ts`)

1. Record `finishReason` and `error` inside `llmResponseData` saved to the `pages` table.
2. Verify translation outcomes before updating page status.
   - If translatable regions were present but zero succeeded, mark `pages.status = 'error'` and record the specific failure reason in `pages.error`.
   - If partial regions succeeded, mark `pages.status = 'done'` and set a warning message in `pages.error` stating how many regions failed.
   - If all regions succeeded, mark `pages.status = 'done'` and set `pages.error = null`.

#### Component 3 - Settings and Configuration (`web/src/lib/stores/settings.ts`)

1. Add an optional `translationMaxTokens` field to `AppSettings` (defaulting to 4096) to give users direct control over their token ceiling.
2. Expose the completion token budget field in `SettingsModal.svelte` under AI Translation Providers.

---

## 2. Issue #3 - Per-Page Manual Translation and Re-Translation

- Issue URL (https://github.com/ArbenApura/xianscan-rust/issues/3)
- Status - Clarified and closed (existing Grid and Compare view single-page translation menus were highlighted).
- Enhancement Scope - Webtoon continuous reader controls, Inspector retry actions, and multi-page batch selection.

### Feature Request Analysis

The user requested the ability to translate individual pages manually from the viewer rather than re-running the entire chapter.

### Gap Analysis and UI Audit

Our audit of the frontend showed that single-page retranslation was already implemented in two locations.

1. **Grid View (`ViewModeGrid.svelte`)** - Each `PageCard` includes a context menu with a "Translate this page" option.
2. **Compare View (`ViewModeCompare.svelte`)** - The top toolbar HUD includes a dedicated page action dropdown to trigger single-page translation.

However, three usability gaps remained.

1. **Webtoon Reader View (`ViewModeWebtoon.svelte`)** - In continuous vertical scrolling mode, there were no page action buttons. If a page had translation errors, users had to leave the reader, switch to Grid View, find the page, and trigger retranslation.
2. **Page Inspector Modal (`PageInspectModal.svelte`)** - When inspecting a page that failed translation, the modal provided a "Retypeset" button, but no direct "Re-translate" button.
3. **Multi-Page Batch Selection** - Grid view allowed translating all pages or one page, but lacked multi-selection checkboxes to retranslate a specific subset of failed pages (for example, pages 4, 7, and 12).

---

### Implementation Plan for Issue #3

#### Component 1 - Dedicated Page Translation Endpoint

Add a dedicated endpoint at `web/src/routes/api/pages/[id]/translate/+server.ts`.
- Accepts `POST /api/pages/[id]/translate`.
- Resets the page progress and enqueues it into `batchService.startBatch` with `pageIds: [pageId]`.
- Returns HTTP 200 with the queued job identifier.

#### Component 2 - Page Inspector Modal (`PageInspectModal.svelte`)

1. If `page.error` exists or `page.status === 'error'`, display a visible alert banner at the top of the modal detailing the failure reason.
2. Add a direct "Re-translate" button in the modal footer next to "Retypeset".
3. Dispatch a `retranslate` event to the parent chapter view when clicked.

#### Component 3 - Webtoon Continuous Reader (`ViewModeWebtoon.svelte`)

1. Add a subtle action pill on each page (visible on hover, or permanently visible when `page.status === 'error'` or `page.status === 'processing'`).
2. Include a page number indicator, status badge, "Inspect" shortcut, and "Re-translate" button.
3. Show an inline error banner across the top of failed pages with a 1-click retry button.

#### Component 4 - Multi-Page Batch Selection in Grid View (`ViewModeGrid.svelte`)

1. Add checkbox selectors to each `PageCard` header.
2. When one or more pages are checked, display a floating bottom toolbar with actions:
   - "Translate Selected (N)"
   - "Select All Errored Pages"
   - "Clear Selection"

---

## 3. Verification and Testing Matrix

### Automated Vitest Suite

Run the full web test suite.

```powershell
Set-Location c:\Users\Admin\Desktop\xianscan-rust\web
yarn test
```

Specific test additions to include:

1. `web/tests/server/translate.test.ts`:
   - Verify token budget escalates on `finish_reason === 'length'`.
   - Verify `rawPrompt` is preserved as a valid JSON array even when the LLM call fails.
   - Verify error classification distinguishes `TOKEN_BUDGET_EXHAUSTED`, `EMPTY_LLM_RESPONSE`, and `UNPARSEABLE_LLM_OUTPUT`.
2. `web/tests/server/chapter-pipeline.test.ts`:
   - Verify page receives `status: 'error'` when all translatable regions fail.
   - Verify page receives warning message when partial regions fail.
3. `web/tests/components/PageInspectModal.test.ts`:
   - Verify Re-translate button renders and dispatches event.
   - Verify error alert banner displays failure message.

### TypeScript and Svelte Diagnostics

Run static type checking across the web application.

```powershell
Set-Location c:\Users\Admin\Desktop\xianscan-rust\web
yarn run check
```

Confirm that `svelte-check` reports zero errors and zero warnings across all modified components.

### Manual Verification Checklist

1. Configure a reasoning model with a low initial token budget and verify that the engine escalates tokens and recovers.
2. Force an LLM failure and open the Inspector to confirm that the raw prompt is fully visible rather than displaying `[]`.
3. Open a chapter with a failed page in Webtoon view and verify that the action pill and retry button appear directly on the page.
4. Test multi-page selection in Grid view and run batch retranslation on selected pages.
