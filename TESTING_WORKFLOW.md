# ML Test Compilation & Execution Workflow

This document defines the strict protocol for adding, compiling, and resolving ML test cases in `xianscan-rust` while preventing regressions and avoiding unnecessary ONNX inference overhead.

---

## 🔁 Workflow Steps

### Step 1: Data-First Problem Analysis
* **Action**: When the user provides test case data / sample details, analyze the problem **strictly from the provided data** first.
* **Constraint**: Do **not** inspect or modify the codebase during this step.

### Step 2: User Alignment
* **Action**: Present the problem analysis clearly (root cause hypothesis, expected vs. actual behavior, edge case specifics).
* **Constraint**: Wait for the user to confirm/agree with the analysis before writing code.

### Step 3: Write Test Case with Strict Pass Conditions (Compilation Only)
* **Action**: Write the test case into the test suite (`tests/` directory) with **strict, comprehensive pass conditions**.
* **Strict Assertion Invariants**:
  1. **Exact Region Count**: Always assert `assert_eq!(res.regions.len(), expected_count)` to catch ghost, duplicate, or split boxes immediately.
  2. **Full Text Unification**: Assert that multi-line bubbles, connected double-bubbles, and continuous sentences contain all constituent lines in proper reading order without mid-sentence truncations.
  3. **No Fragment/Duplicate Sub-Boxes**: Explicitly assert negative checks (`assert!(!res.regions.iter().any(...))`) against split fragments (e.g., ensuring a 3-line bubble didn't spawn an extra 2-line ghost box).
  4. **Strict Spatial/Boundary Clamping**: Assert geometric invariants (e.g., `box_.x + box_.w <= limit`) to guarantee bounding boxes do not dilate into character artwork or bubble borders.
  5. **Zero Stray/Hallucination Artifacts**: Explicitly verify that artwork noise, thought bubble tail circles, and margin stamps are eliminated.
  6. **No Superficial/Loose Checks**: Never use loose assertions (e.g. `all_text.contains(...)`) that could pass even if the bubble is fragmented or duplicated.
* **Constraint**: Do **not** run the test yet. Only compile/save the test case to maintain the compilation batch.

### Step 4: Repeat for All New Test Cases
* Repeat **Steps 1–3** for each test case until the user indicates compilation of the test batch is complete.

---

## 🚀 Execution & Resolution Phase (After Compilation)

### Step 5: Iterative Execution & Fixes
* Implement generalized, algorithmic fixes (e.g., dynamic glyph-bounding hulls, paragraph grouping, deduplication) rather than brittle, hardcoded string-matching static clamps.
* Run tests iteratively.
* Re-run tests until all new test cases pass.

### Step 6: Regression Guard & Strict Cache Utilization
* **Zero Regressions**: Run the full existing regression suite to guarantee that existing behavior and invariants remain intact.
* **Strict Cache Utilization**: Always utilize image hashing and caching (`get_or_analyze_fixture`, `tests/.cache/`) so that test executions complete in **milliseconds**. Never execute slow, un-cached neural inference runs that block and waste time.

### Step 7: Release Executable Build (On User Request)
* When requested by the user to build the `.exe` window after all tests pass:
  ```powershell
  cargo build --release --features embed-models,embed-web
  ```

---

## ⚠️ Important Guardrails
* **Absolute Requirement Invariance (No Loopholes or Bypasses)**: Test cases have very strict requirements and represent hard, non-negotiable requirements. Never search for loopholes, weaken assertions, or bypass test criteria to make tests pass—the implementation must genuinely satisfy every condition.
* **Strict Problem-Solving Focus**: Test cases must encode the exact conditions needed to fully resolve the user's issue, avoiding superficial fixes or partial assertions that mask underlying regressions.
* **No Hardcoded Static Clamps**: Never add keyword-based static bounds (`if text.contains("...") { w = ... }`). Use dynamic, geometry/glyph-driven algorithms that generalize globally.
* **No Automatic Git Commits or Releases**: Do not make git commits, push tags, or trigger GitHub CI releases automatically. All changes remain local until explicitly instructed.
* **No Premature Test Runs**: During the compilation phase, compile/write test cases without running tests.

