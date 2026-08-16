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

### Step 3: Write Test Case (Compilation Only)
* **Action**: Write the test case into the test suite (`tests/` directory).
* **Constraint**: Do **not** run the test yet. Only compile/save the test case to maintain the compilation batch.

### Step 4: Repeat for All New Test Cases
* Repeat **Steps 1–3** for each test case until the user indicates compilation of the test batch is complete.

---

## 🚀 Execution & Resolution Phase (After Compilation)

### Step 5: Iterative Execution & Fixes
* Run tests iteratively.
* Implement targeted fixes.
* Re-run tests until all new test cases pass.

### Step 6: Regression Guard & Cache Preservation
* **Zero Regressions**: Run the full existing regression suite to guarantee that existing behavior and invariants remain intact.
* **Cache Utilization**: Always utilize image hashing and caching (`get_or_analyze_fixture`, `tests/.cache/`) to keep test runs in milliseconds and avoid redundant, multi-hour ONNX neural inference runs.

### Step 7: Release Executable Build (On User Request)
* When requested by the user to build the `.exe` window after all tests pass:
  ```powershell
  cargo build --release --features embed-models,embed-web
  ```

---

## ⚠️ Important Guardrails
* **No Automatic Git Commits or Releases**: Do not make git commits, push tags, or trigger GitHub CI releases automatically. All changes remain local until explicitly instructed.
* **No Premature Test Runs**: During the compilation phase, compile/write test cases without running tests.

