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
* **Action**: Write the test case into the appropriate test file in the `tests/` directory with **strict, comprehensive pass conditions**.
* **📁 Test File Categorization & Target File Routing Guide**:
  Place each new test case into the specific file that matches its problem domain:
  
  | Category / Problem Domain | Target Test File | Sample Test Patterns |
  | :--- | :--- | :--- |
  | **Real Full-Page Regressions** | [`tests/regression_pages.rs`](tests/regression_pages.rs) | End-to-end full page analysis (`get_or_analyze_fixture`), exact region counts, complete dialogue extraction, and panel boundary assertions. |
  | **Speech Bubble Separation & Splitting** | [`tests/test_bubble_split.rs`](tests/test_bubble_split.rs) | Side-by-side bubble separation, terminal punctuation boundary guards, multi-utterance split preservation. |
  | **Noise, Tail Circles & Stray OCR Cleanup** | [`tests/test_reported_cases.rs`](tests/test_reported_cases.rs) | Thought bubble tail circle suppression, drawing vibration noise filtering, stray isolated character cleanup, digit prefix stripping. |
  | **Font Scale & Dialogue Level Grouping** | [`tests/test_scale_differentiation.rs`](tests/test_scale_differentiation.rs) | Whisper vs. normal dialogue separation, tight vs. wide gutter line clustering, disparate font size non-grouping. |
  | **Watermark Detection & Recovery** | [`tests/test_watermark.rs`](tests/test_watermark.rs) / [`tests/watermark.rs`](tests/watermark.rs) | Chromatic bubble watermark mask detection, colliding watermark inpainting & text recovery, corner platform logo suppression. |
  | **Geometric Math, Angles & Polygon Unclip** | [`tests/geometry.rs`](tests/geometry.rs) / [`tests/test_geometry.rs`](tests/test_geometry.rs) | Box IoU, orientation angle calculation & snapping, polygon unclip/dilation, axis-aligned mini boxes. |
  | **Smart Reslicing & Webtoon Chapter Cuts** | [`tests/reslice.rs`](tests/reslice.rs) / [`tests/test_reslice.rs`](tests/test_reslice.rs) | Vertical chapter stitching, blank gutter cut detection, forbidden speech bubble slicing avoidance. |
  | **Title & Subtitle Separation** | [`tests/test_title_subtitle_separation.rs`](tests/test_title_subtitle_separation.rs) | Cover calligraphy title vs. chapter subtitle separation, substring deduplication, mid-sentence ellipsis preservation. |

* **Strict Assertion Invariants**:
  1. **Exact Native Image Resolution**: Fixture images must match the **exact width and height** of the raw uploaded page provided by the user. Never downscale, downsample, or compress test images—neural feature maps, OCR line aspect ratios, and spatial clustering thresholds depend strictly on native pixel scale.
  2. **Exact Region Count**: Always assert `assert_eq!(res.regions.len(), expected_count)` to catch ghost, duplicate, or split boxes immediately.
  3. **Full Text Unification**: Assert that multi-line bubbles, connected double-bubbles, and continuous sentences contain all constituent lines in proper reading order without mid-sentence truncations.
  4. **No Fragment/Duplicate Sub-Boxes**: Explicitly assert negative checks (`assert!(!res.regions.iter().any(...))`) against split fragments (e.g., ensuring a 3-line bubble didn't spawn an extra 2-line ghost box).
  5. **Strict Spatial/Boundary Clamping**: Assert geometric invariants (e.g., `box_.x + box_.w <= limit`) to guarantee bounding boxes do not dilate into character artwork or bubble borders.
  6. **Zero Stray/Hallucination Artifacts**: Explicitly verify that artwork noise, thought bubble tail circles, and margin stamps are eliminated.
  7. **No Superficial/Loose Checks**: Never use loose assertions (e.g. `all_text.contains(...)`) that could pass even if the bubble is fragmented or duplicated.
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
* **Zero Downscaling / Exact Native Resolution**: Never downscale, downsample, or compress fixture images. Test cases must execute on the exact dimensions provided in the user sample (e.g., 800×1429), guaranteeing 100% behavioral parity between test suites and the real user application.
* **Absolute Requirement Invariance (No Loopholes or Bypasses)**: Test cases have very strict requirements and represent hard, non-negotiable requirements. Never search for loopholes, weaken assertions, or bypass test criteria to make tests pass—the implementation must genuinely satisfy every condition.
* **Strict Problem-Solving Focus**: Test cases must encode the exact conditions needed to fully resolve the user's issue, avoiding superficial fixes or partial assertions that mask underlying regressions.
* **No Hardcoded Static Clamps**: Never add keyword-based static bounds (`if text.contains("...") { w = ... }`). Use dynamic, geometry/glyph-driven algorithms that generalize globally.
* **No Automatic Git Commits or Releases**: Do not make git commits, push tags, or trigger GitHub CI releases automatically. All changes remain local until explicitly instructed.
* **No Premature Test Runs**: During the compilation phase, compile/write test cases without running tests.

---

## 🧠 Key Operational Learnings & Pitfall Preventions

### 1. Source Image Ingestion & Traceable Test Identity (Never Rely on `pageId` in Tests)
* **Pitfall**: Auto-incrementing database `pageId`s are volatile and change across database re-creations, re-scans, or migrations. Furthermore, chat UI attachments, clipboard uploads, and screenshots are frequently downscaled or re-compressed by client software (e.g., downscaling an 800×1429 image to 573×1024).
* **Prevention & Rules**:
  1. **Locating Native Asset**: When a live bug report references a transient `pageId` (e.g. `pageId: 63620`):
     ```powershell
     sqlite3 "$env:APPDATA\XianScan\data\xianscan.db" "SELECT file_path FROM pages WHERE id = <pageId>;"
     ```
     Copy that exact bit-for-bit file (`$env:APPDATA\XianScan\data\<file_path>`) directly into `tests/fixtures/`.
  2. **Do NOT Rely on `pageId` in Test Cases / Code**: Never name test functions or write test assertions around ephemeral database `pageId` numbers.
  3. **Rely on Traceable Data**: Always identify test cases and fixtures by deterministic, traceable characteristics:
     * **Content / Dialogue Snippets**: e.g., `test_case_5_clean_stray_ocr_artifacts_normal`, `test_case_flesh_cutting_knife_and_novice_mage_split`, or matching on key text lines like `哼，这么胡\n来，菜鸟一\n个！` and `残破的割肉小刀`.
     * **Image Content Hashing & Fixture Filenames**: Use descriptive fixture names (e.g., `tests/fixtures/novice_mage_equipment_stat_bubble.webp` or SHA256 hashes).
     * **Semantic Problem Domain**: Category/behavior-based names and documentation matching the exact failure mode.

### 2. Never Synthesize or Resize Fixtures in Tests
* **Pitfall**: Calling `.resize_exact()` or interpolation filters in test files alters subpixel edge contrast and line heights, masking real edge hallucinations.
* **Prevention**: Test fixtures must be loaded raw (`image::open(...)`) with zero in-memory scaling.

### 3. Contrast-Boundary Optical Slivers & Typographic Invariants
* **Pitfall**: Sharp background transitions (e.g., bright illustration colors meeting pure black gutters) cause text detectors to produce thin ($h \le 20\text{px}$), flattened bounding boxes with garbled OCR text.
* **Invariant**: Standard CJK typography consists of square glyphs ($1\text{em} \times 1\text{em}$). Any multi-character line with an unnatural glyph aspect ratio ($\frac{w}{n \times h} \ge 1.8$ with $h \le 24\text{px}$) or low confidence on thin heights represents an optical boundary hallucination and must be filtered geometrically.

### 4. Process Locking Awareness (`cargo watch`)
* **Pitfall**: If the user is running `cargo watch -w src -x run`, `target/debug/xianscan-rust.exe` will be locked, causing `cargo test` compilation to fail with `Access is denied (os error 5)`.
* **Prevention**: Stop the running process before building test binaries, or be aware that edits to `src/` will automatically trigger a live server rebuild.

### 5. Verify Live Inference Before Re-seeding Cache
* **Pitfall**: Relying on stale cache entries (`tests/.cache/`) can cause a failing bug to falsely pass in tests.
* **Prevention**: When diagnosing or resolving a test case, invalidate the specific cache entry or verify against live ONNX model output. Once the test passes cleanly with live models, seed the cache so the regression suite remains lightning fast (milliseconds).

### 6. Always Use Default Target Directory & Test Cache
* **Pitfall**: Specifying alternative target directories (e.g. `--target-dir target_test`) forces Cargo to recompile all 100+ dependencies from scratch, adding 3–5 minutes of cold build overhead per turn.
* **Prevention**: Always build against the standard `target/` directory and use the test cache (`get_or_analyze_fixture`) for instant sub-second execution (~0.06s).

### 7. Resolution-Dependent Line Conflation vs. Local Crop Refinement
* **Pitfall**: Full-page DBNet ($800 \times 1447$) downsamples feature maps by $4\times$ (stride 4). When compact speech bubbles ($w, h \le 120\text{px}$) contain tight horizontal rows spaced $2\text{--}3\text{px}$ apart, the network's downsampled receptive field connects characters vertically across rows, producing cross-column garbled slivers (e.g. `果变样`, `结就`).
* **Prevention**: When a region has low confidence or contains fewer lines than its geometric aspect ratio suggests, refine the bubble via local padded crop recognition (`recognize_crop`). The local crop is resized up to $960\text{px}$, magnifying inter-row gaps to $15\text{--}20\text{px}$ so DBNet cleanly isolates each line.

### 8. Synchronize Spatial Envelope on Crop Refinement
* **Pitfall**: Updating a region's text content from `recognize_crop` without updating its bounding box leaves `box_rect` clamped to the initial narrow detection, causing outer characters (e.g. `成了`, `……`) to bleed outside inpainting masks.
* **Prevention**: Whenever `recognize_crop` refines a region's text, update the region's `box_rect` and `polygon` to the union bounding envelope of all constituent sub-line polygons with proper typographic padding.

### 9. Multi-Line Speech Bubble Separation vs. Monologue Chaining ($\ge 3$-Line Rule)
* **Pitfall**: Vertically stacked speech bubbles frequently sit within $20\text{--}40\text{px}$ of each other. If the paragraph grouper or post-merger blindly unifies them into a single giant monologue (e.g. merging a 4-line upper bubble and a 3-line lower bubble into a 7-line block), the resulting bounding box cuts across both bubbles. Subsequent crop recognition or inpainting masks slice through glyph borders, hallucinating garbled boundary characters (e.g. slicing through `真是的` to hallucinate `古旦故`, or slicing `是游戏` to hallucinate `定册x，`).
* **Invariant**: When a paragraph already contains $\ge 3$ lines (a complete speech bubble), or when both adjacent vertical regions contain $\ge 3$ lines each, they represent distinct, independent dialogue speeches in the panel. They must **never** be grouped or post-merged across inter-bubble vertical gaps ($gap \ge 0.70 \times min\_eff\_h$).

### 10. Suffix Echo & Trailing Sub-Box Deduplication (Character Containment)
* **Pitfall**: Detectors often produce a secondary, ghost sub-box overlapping the trailing right/bottom edge of a main speech bubble (e.g. an echo box `张\n……\n!` placed immediately adjacent to `我看你能嚣张\n到什么时候！`). These ghost boxes fail simple IoU checks ($IoU \approx 0.18$) because of area asymmetry.
* **Invariant**: When a candidate sub-box shares the vertical span of an adjacent primary bubble ($overlap_y / \min(h_1, h_2) \ge 70\%$) with shared horizontal space ($overlap_x > 0$), and all its meaningful alphanumeric/CJK characters are already contained within the primary bubble's text lines, the sub-box is a trailing detector echo and must be deduplicated.

### 11. Selective Crop Refinement: Preserving Clean High-Line Detections
* **Pitfall**: Unconditionally forcing local crop recognition (`recognize_crop`) on large candidate boxes ($h \ge 75, w \ge 75$) even when full-page RapidOCR already detected $\ge 3$ or 4 clean, high-confidence lines can cause crop padding to over-extend into neighboring panels, introducing noise.
* **Prevention**: Crop refinement should be targeted specifically at low-confidence regions ($score < 0.60$) or fragmented bubbles ($\le 2$ lines detected within an envelope tall enough for $\ge 3$ lines). When full-page OCR has already isolated $\ge 3$ clean lines with high confidence ($\ge 0.65$), trust the full-page text detection lines.

### 13. Strict Single-Repository Root Invariant (`xianscan-rust` Only)
* **Rule**: **NEVER edit, modify, or run builds in the legacy `c:\Users\Admin\Desktop\xianscan` directory.**
* **Context**: All active frontend code (`web/`), backend server (`src/server/`), ML inference engine (`src/ml/`), and test suites (`tests/`) live exclusively inside `c:\Users\Admin\Desktop\xianscan-rust`.
* **Reasoning**: `xianscan-rust` is a self-contained unified repository with embedded/local SSR. Editing the legacy `xianscan` folder causes changes to be invisible to `cargo watch` / `cargo run` and causes desynchronization. All file edits, `yarn build`s, and `cargo test`s must occur strictly within `c:\Users\Admin\Desktop\xianscan-rust`.


