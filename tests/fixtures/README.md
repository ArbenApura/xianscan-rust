# Test Fixtures & Regression Image Samples

This directory stores permanent, version-controlled image samples used by `pytest` integration and regression test suites in `ml/tests/`.

---

## 📁 Sample Inventory

| File | Resolution | Source Chapter/Page | Regression / Behavior Tested |
| :--- | :--- | :--- | :--- |
| [`page_679.jpg`](page_679.jpg) | 800 × 2400 | Page 679 | **Text Completeness**: Ensures multi-line dialogue (*"难道这么多年张予德都在成都和你们在一起？"*) is completely captured without being fragmented. |
| [`page_683.jpg`](page_683.jpg) | 800 × 2400 | Page 683 | **Adjacent Bubble Separation**: Ensures side-by-side bubbles on the same horizontal band (*"这傻子非得尿裤子上不可！"* vs *"哈哈！"*) are not merged across panels. |
| [`page_688.jpg`](page_688.jpg) | 800 × 2400 | Page 688 | **Narration Panel Preservation**: Ensures middle-right panel narration box (*"但是在光辉之城受到袭击的时候..."*) is preserved and not dropped by watermark filters. |
| [`page_825.jpg`](page_825.jpg) | 800 × 1132 | Chapter 20 / Page 825 | **Vertical Bubble Upright Typesetting**: Ensures tall vertical speech bubbles (*"叽叽喳喳"*, *"吵闹"*) have angle $0.0^\circ$ so translated English text is rendered upright horizontally rather than rotated $90^\circ$ sideways. |
| [`page_828.jpg`](page_828.jpg) | 800 × 1132 | Chapter 20 / Page 828 | **Stacked Bubble Paragraph Grouping**: Ensures 4-line stacked dialogue bubble (*"往聂\n离那\n里去\n了！"*) groups into a single unified region instead of splitting in half. |
| [`page_1057.png`](page_1057.png) | 800 × 2284 | Chapter 16 / Page 1057 | **Panel-Bounded Punctuation**: Prevents distant bottom-right watermark stamps (*"漫客栈"*) from being swallowed as trailing punctuation into panel-2 bubbles across panels. |
| [`page_1062.png`](page_1062.png) | 800 × 2264 | Chapter 16 / Page 1062 | **Vertical Multi-Line Bubble Rescue**: Ensures compact vertical bubbles (*"又干\n掉一\n只！"*) are recognized as 3 distinct lines rather than misread into garbled 1-line text (*"对期"*). |
| [`page_1070.png`](page_1070.png) | 800 × 2264 | Chapter 17 / Page 1070 | **SFX / Monologue Bubble Separation**: Prevents adjacent floating SFX text (*"打量"*) on the same horizontal row from merging with speech bubble dialogue lines (*"我看，太无礼"*), keeping the monologue bubble unified. |
| [`page_1088.jpg`](page_1088.jpg) | 800 × 1132 | Chapter 25 / Page 1088 | **Multi-line Bubble Paragraph Unification**: Ensures multi-line dialogue bubbles (*"我会成为像叶墨大..."* and *"虽然我天赋很差..."*) remain completely intact without splitting off trailing lines or sub-sentences. |
| [`page_1097.jpg`](page_1097.jpg) | 800 × 1132 | Chapter 25 / Page 1097 | **Diagonal / Slanted Line Angle Detection**: Ensures slanted vertical/diagonal text columns (*"面对另外一处处在尴尬位置的淤青，聂离……"*) detect their diagonal orientation angle so translated text flows naturally along the angle. |
| [`page_58442.png`](page_58442.png) | 900 × 1641 | Chapter 35 / Page 58442 | **Alphanumeric & Numeric Prefix Preservation**: Ensures numbers and stat counts preceding Chinese text (*"1000000恐惧值"*) are preserved without being stripped. |
| [`page_58443.png`](page_58443.png) | 900 × 2203 | Chapter 35 / Page 58443 | **Giant Artwork & Watermark Bypass**: Ensures large background illustration impact numbers (*"1000000"* art drawing) and watermarks are bypassed with 0 false regions. |
| [`page_58444.png`](page_58444.png) | 900 × 1029 | Chapter 35 / Page 58444 | **Trailing Ellipsis Unification**: Ensures trailing ellipsis dots (*"……"*) are unified with dialogue bubbles rather than split into rogue *'1'* false detections. |
| [`page_58509.png`](page_58509.png) | 900 × 1957 | Chapter 36 / Page 58509 | **Watermark-Collided Bubble Paragraph Unification**: Ensures a speech bubble (*"喂，你的手在抖..."*) colliding with watermark stamps (*"COLAMANGA.com"* / *"ACloudMerge.com"*) unifies its 3 lines and discards stray watermark fragments (*"loudMer"*). |
| [`page_58515.png`](page_58515.png) | 900 × 1846 | Chapter 36 / Page 58515 | **Single-Bubble Mid-Line Exclamation Preservation**: Ensures scream/interjection lines (*"啊啊啊啊！！！一想起来，"*) inside single bubbles are not severed into disconnected fragments. |
| [`page_58520.png`](page_58520.png) | 900 × 2396 | Chapter 36 / Page 58520 | **Separate Speech Bubble Period Isolation**: Ensures distinct consecutive speech bubbles (*"好啦。"* and *"不说这些了。"*) ending in full stops are kept separate across panel boundaries. |
| [`page_58536.png`](page_58536.png) | 900 × 1162 | Chapter 37 / Page 58536 | **Watermark-Collided Button Text Recovery**: Ensures button text (*"生活人才"*) colliding with watermark stamps (*"ACloudMerge.com"*) is cleanly extracted and colon-terminated prompt labels (*"点将："*) are isolated. |
| [`page_58539.png`](page_58539.png) | 900 × 1484 | Chapter 37 / Page 58539 | **Stray Artwork Contour Suppression**: Ensures 1-character stray artwork outlines (*"V"*) on full-art pages are bypassed with 0 false regions. |
| [`page_58544.png`](page_58544.png) | 900 × 1748 | Chapter 37 / Page 58544 | **System Card Multi-Line Unification & Card Box Isolation**: Ensures multi-line cards (*"嘟！获得顶级伐木工..."*) unify repeated lines while distinct card boxes (*"嘟！获得顶级女巫。"* and *"(附赠顶级宠物。)"*) remain isolated. |
| [`page_58617.png`](page_58617.png) | 900 × 1363 | Chapter 39 / Page 58617 | **Short Trailing Dialogue Line Unification**: Ensures short trailing lines (*"一头，"*) are unified into their parent dialogue paragraph (*"虽说婉儿当时性格刁蛮，\n但妹妹甚至能艳压婉儿\n一头，"*) without being orphaned. |
| [`page_58623.png`](page_58623.png) | 900 × 2112 | Chapter 39 / Page 58623 | **Missing Vocabulary Interjection Recovery**: Ensures character interjection bubbles (*"诶！"*) are recovered and preserved when OCR recognizers drop the character due to vocabulary gaps. |
| [`page_58650.png`](page_58650.png) | 900 × 2158 | Chapter 40 / Page 58650 | **Connected / Stacked Speech Bubble Isolation**: Ensures distinct consecutive speech bubbles (*"呼！"* and *"总算分完\n最后一人\n了。"*) ending in exclamation terminal punctuation are kept separate rather than incorrectly merged into a single bubble. |
| [`page_58876.png`](page_58876.png) | 900 × 1617 | Chapter 45 / Page 58876 | **Watermark Bypass & Multi-Line Paragraph Unification**: Ensures watermarks (*"COLAMANGA.com"*, *"AcloudMerge.com"*) are ignored and multi-line speech bubbles (*"是啊，是啊！国师的道号..."* and *"天赐……啧！\n说详细情况\n吧。"*) group cleanly into 2 unified dialogue regions without splitting lines. |
| [`page_58895.png`](page_58895.png) | 900 × 2060 | Chapter 45 / Page 58895 | **Vertical Dotted Scream Bubble Unification**: Ensures tall vertical speech bubbles with interspersed vertical ellipsis dots (*"呜\n……\n啊\n……"*) are unified into a single vertical dialogue region covering the full bubble height instead of fragmenting into separate 1-character boxes. |
| [`page_58896.png`](page_58896.png) | 900 × 1427 | Chapter 45 / Page 58896 | **Misclassified Exclamation Mark Recovery**: Ensures standalone full-width exclamation marks (*"！"*) at the base of scream speech bubbles are correctly recovered and not misread as digits (*"1"*). |
| [`page_58961.png`](page_58961.png) | 900 × 1213 | Chapter 47 / Page 58961 | **Multi-Line Dialogue Orientation Angle Stability**: Ensures standard horizontal dialogue bubbles (*"呵呵，司马倩..."*) maintain `angle = 0.0` and do not rotate due to subpixel baseline jitter on short trailing lines (*"吧。"*) |
| [`page_58966.png`](page_58966.png) | 900 × 1098 | Chapter 47 / Page 58966 | **Trailing Ellipsis Mask Recovery**: Ensures trailing horizontal ellipsis dots (*"而且她的位格更高……"*) are detected via segmentation mask growth and appended to dialogue regions. |
| [`page_58969.png`](page_58969.png) | 900 × 1472 | Chapter 47 / Page 58969 | **Bottom Ellipsis Line Mask Recovery**: Ensures standalone bottom ellipsis lines (*"……"*) separated by interline line-spacing below text are bridged via dilated mask growth and normalized into the dialogue region. |
| [`page_58971.png`](page_58971.png) | 900 × 1730 | Chapter 47 / Page 58971 | **Dialogue Angle Stability & Same-Line Fragment Merging**: Ensures standard horizontal dialogue bubbles (*"还有那些侠女的..."*) maintain `angle = 0.0` and merge same-line horizontal punctuation fragments (*"嘿~～～"*) into 1 unified line without rotation. |
| [`page_58976.png`](page_58976.png) | 900 × 1734 | Chapter 47 / Page 58976 | **Flashback Scene Bubble Grouping & Distinct Bubble Separation**: Ensures 5-line flashback bubbles (*"生死爱恨..."*) capture all lines completely without vertical overlap dropping, and diagonally-adjacent speech bubbles (*"不过……她\n不重要。"* vs *"我真正想找的人\n……是你。"*) stay strictly separated. |
| [`page_58994.png`](page_58994.png) | 900 × 1264 | Chapter 48 / Page 58994 | **Short 1-Character Trailing Line Angle Stability**: Ensures dialogue bubbles ending with 1-character trailing lines (*"前，"*) snap subpixel baseline noise to `angle = 0.0` without tilting translated text. |
| [`page_58995.png`](page_58995.png) | 900 × 1590 | Chapter 48 / Page 58995 | **Dialogue Bubble Boundary Clamping & SFX Recovery**: Prevents top dialogue bubble (*"这里被称为“南蛮之地”..."*) from over-expanding rightward into watermark margins (`w <= 485px`), while preserving the bottom hooves sound effect (*"哒"*). |
| [`page_59897.png`](page_59897.png) | 900 × 1267 | Page 59897 | **Lattice / Coin Veil Pattern Noise Suppression**: Ensures repeating geometric coin mask texture is not misdetected as digit text (*"3838"*), cleanly preserving all 3 dialogue bubbles (*"还有……"*, *"一位谋乱天下..."*, *"呀，听起来..."*). |
| [`page_63517.png`](page_63517.png) | 900 × 1981 | Chapter 52 / Page 63517 | **Trailing Ellipsis Detection & Full-Dot Coverage**: Ensures trailing horizontal ellipsis dots (*"龙字军夜袭“黑风寨”……"* after closing quotes and *"鱼字军剿灭……"*) are extracted via mask growth and expanded to 2 ems (`x >= 820` / `x >= 850`) to cleanly inpaint all 6 dots without residue. |
| [`page_63596.png`](page_63596.png) | 800 × 1307 | Page 63596 | **Vertical Skill Callout Exclamation Mark Recovery**: Ensures trailing exclamation marks (*"！"*) below vertical action text (*"『潜伏』！"*) are recognized and unified into the vertical bounding box, cleanly covering the exclamation mark down to $y \ge 1050$. |
| [`page_63602.png`](page_63602.png) | 900 × 1694 | Page 63602 | **SFX Trail Retention & Drawing Noise Suppression**: Ensures low-confidence single-glyph false positives (*"小"*) on tremor lines are filtered while preserving all 3 panel SFX sound effects (*"沙—"*) without hallucinated ellipsis dots (*"……"*). |
| [`page_63603.png`](page_63603.png) | 900 × 2246 | Page 63603 | **Action Blood Spray SFX & Exclamation Retention**: Tests detection of consecutive sound effects (*"咳！"*, *"咳！"*, *"咳！"*) along blood spray without punctuation loss, and high-contrast splash SFX (*"噗"*). |

---

## 🛠️ How to Add New Test Case Images

When fixing a new detection, segmentation, inpainting, or OCR regression:

1. **Save the Sample Image**:
   * Copy the raw uploaded page into this directory with a clean, semantic name:
     ```
     ml/tests/fixtures/page_<id_or_topic>.<ext>
     ```
   * *Tip*: Ensure the image is optimized/clean so repository size remains lightweight.

2. **Reference the Fixture Portably in Tests**:
   * **Never hardcode machine-specific absolute paths** (e.g. `r"c:\Users\..."`).
   * Use relative paths anchored to the test file using `pathlib.Path`:
     ```python
     from pathlib import Path
     import pytest
     from app import pipeline

     FIXTURES_DIR = Path(__file__).parent / "fixtures"

     @pytest.mark.skipif(
         not (FIXTURES_DIR / "page_1057.png").exists(),
         reason="Page 1057 fixture not found",
     )
     def test_page_1057_bubble_separation():
         img_path = FIXTURES_DIR / "page_1057.png"
         with open(img_path, "rb") as f:
             img = pipeline.decode_image(f.read())
         resp = pipeline.analyze_image(img)
         ...
     ```

3. **Commit the Fixture to Git**:
   * Unlike `web/data/uploads/` (which is git-ignored runtime data), `ml/tests/fixtures/` is tracked by Git so that CI and other developers can immediately run the full test suite.

4. **Model Inference Cache Auto-Generation**:
   * On the first run of a new sample fixture, raw ONNX model outputs (`ComicTextDetector`, `RapidOCR`, `LaMa`) will automatically be evaluated and cached to `ml/tests/.cache/`.
   * If you need to re-generate or bypass cached outputs when testing raw model changes, run with `--refresh-model-cache` or `--no-model-cache`.
