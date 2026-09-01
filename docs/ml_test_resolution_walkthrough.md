# ML Test Case Compilation & Resolution Walkthrough Guide

This walkthrough guide tracks all test cases being compiled, their strict constraints, root cause analysis, and resolution milestones.

---

## 📋 Test Case Batch Queue

### Case 1: `page_lightning_art_chen_fan_shock`
- **Language**: `zh_hans`
- **Source Page ID**: `110249` (File: `uploads/2788/68089546-0d7f-4945-a4fd-8379df24e25a.webp`)
- **Native Dimensions**: `827 x 1255`
- **Status**: 📝 Test Case Compiled (Compilation Phase)
- **Target Test File**: [`tests/regression/zh_hans/page_lightning_art_chen_fan_shock.rs`](file:///c:/Users/Admin/Desktop/xianscan-rust/tests/regression/zh_hans/page_lightning_art_chen_fan_shock.rs)
- **Fixture Folder**: `tests/fixtures/private/zh_hans/page_lightning_art_chen_fan_shock/`

#### Strict Constraints & Invariants:
1. **Structural Counts**:
   - Total Regions: `5`
   - Dialogue Bubbles: `3`
   - Sound Effects (SFX): `0` (SFX completely banned)
   - Free Text: `2` (Bystander shock crowd reactions)
2. **Dialogue Bubbles**:
   - `天……天师道的雷法!` (Middle panel bubble)
   - `弟子再也不敢了，再也不敢了` (Bottom right bubble)
   - `大师饶命` (Bottom center bubble)
3. **Free Text**:
   - `这！陈凡？\n天哪！` (Bottom panel crowd reaction)
   - `这！陈凡？` (Bottom left crowd reaction)
4. **Negative Guards & Filtering**:
   - Top panel scream `啊！` suppressed under 0 SFX policy.
   - Watermarks `COLAMANGA.com`, `ACloudMerge.com`, and `腾讯动漫` suppressed.
   - Zero artwork or lightning stroke hallucinations.

---

### Case 2: `page_classroom_evaluation_jiang_tanqiu`
- **Language**: `zh_hans`
- **Source Page ID**: `110251` (File: `uploads/2788/95e6f262-8fb6-4040-86ad-b67bc10c7037.webp`)
- **Native Dimensions**: `827 x 1256`
- **Status**: 📝 Test Case Compiled (Compilation Phase)
- **Target Test File**: [`tests/regression/zh_hans/page_classroom_evaluation_jiang_tanqiu.rs`](file:///c:/Users/Admin/Desktop/xianscan-rust/tests/regression/zh_hans/page_classroom_evaluation_jiang_tanqiu.rs)
- **Fixture Folder**: `tests/fixtures/private/zh_hans/page_classroom_evaluation_jiang_tanqiu/`

#### Strict Constraints & Invariants:
1. **Structural Counts**:
   - Total Regions: `8`
   - Dialogue Bubbles: `4`
   - Free Text: `4` (4 mandatory floating classmate evaluation labels)
   - Sound Effects (SFX): `0`
2. **Dialogue Bubbles**:
   - `陈凡？你这自我介绍也太简单了吧，` (Left top bubble)
   - `怎么吸引妹子们的注意力?` (Left bottom bubble)
   - `算了。我叫蒋谈秋，人送外号“夜店小王子”` (Right top bubble)
   - `这楚州的夜店场子没有我不知道的。` (Right bottom bubble)
3. **Mandatory Free Text Labels (4)**:
   - `平平无奇。` (Top left floating text)
   - `长相一般。` (Top right floating text - mandatory)
   - `没钱没权。` (Middle left floating text)
   - `没意思，不值得交往。` (Middle right floating text)
4. **Negative Guards & Filtering**:
   - Top site redirect header watermark `colamanga.com观看，最快最稳，广告最少` / `最快最稳，广告最少` must NOT be extracted.
   - Bottom aggregator watermarks `COLAMANGA.com`, `ACloudMerge.com`, `腾讯动漫` must be suppressed.
   - Classroom desks/background lines must not produce false noise detections.

---

### Case 3: `page_zhou_tianhao_silent_spell_escape`
- **Language**: `zh_hans`
- **Source Page ID**: `110245` (File: `uploads/2788/b11c962b-5661-4cda-94d2-73961c28baca.webp`)
- **Native Dimensions**: `827 x 1785`
- **Status**: 📝 Test Case Compiled (Compilation Phase)
- **Target Test File**: [`tests/regression/zh_hans/page_zhou_tianhao_silent_spell_escape.rs`](file:///c:/Users/Admin/Desktop/xianscan-rust/tests/regression/zh_hans/page_zhou_tianhao_silent_spell_escape.rs)
- **Fixture Folder**: `tests/fixtures/private/zh_hans/page_zhou_tianhao_silent_spell_escape/`

#### Strict Constraints & Invariants:
1. **Structural Counts**:
   - Total Regions: `11`
   - Dialogue / Thought Bubbles: `8`
   - Free Text: `3`
   - Sound Effects (SFX): `0`
2. **Dialogue & Thought Bubbles (8)**:
   - `嗯?` (Panel 1, top-left bubble)
   - `你先让他们离开，我留在这里，咱们慢慢玩。` (Panel 1, top-right bubble)
   - `可以，我倒要看看你今晚怎么陪我玩。` (Panel 2, middle Zhou Tianhao bubble)
   - `陈凡！` (Panel 3, Xu Rongfei reaction bubble)
   - `快走啦大小姐!` (Panel 3, Jiang Churan dragging bubble)
   - `难怪他一副有恃无恐的样子，但周天豪可不是靠打就解决的。` (Panel 4, thought bubble)
   - `姜初然和许容妃走了就行了。` (Panel 5, left thought bubble)
   - `接下来释放法术杀掉这里的所有人就可以了。` (Panel 5, right thought bubble)
3. **Free Text (3)**:
   - `威胁我？那我就施展法术，悄无声息的杀掉你，一了百了。` (Panel 1, Chen Fan thought text)
   - `能走了！` (Panel 3, crowd reaction)
   - `快走快走！` (Panel 3, background fleeing crowd reaction - mandatory)
4. **Negative Guards & Filtering**:
   - Aggregator watermark `COLAMANGA.com` / `ACloudMerge.com` between Panel 3 and Panel 4 must be suppressed.
   - Background neon signs (`帝王厅`) must not produce noise artifacts.

---

### Case 4: `page_small_pei_yuan_pill_watermark_collision`
- **Language**: `zh_hans`
- **Source Page ID**: `110248` (File: `uploads/2788/a06edd33-eba0-4151-9ea6-fa216bb361a1.webp`)
- **Native Dimensions**: `827 x 1942`
- **Status**: 📝 Test Case Compiled (Compilation Phase)
- **Target Test File**: [`tests/regression/zh_hans/page_small_pei_yuan_pill_watermark_collision.rs`](file:///c:/Users/Admin/Desktop/xianscan-rust/tests/regression/zh_hans/page_small_pei_yuan_pill_watermark_collision.rs)
- **Fixture Folder**: `tests/fixtures/private/zh_hans/page_small_pei_yuan_pill_watermark_collision/`

#### Strict Constraints & Invariants:
1. **Structural Counts**:
   - Total Regions: `9`
   - Dialogue Bubbles: `9`
   - Free Text: `0`
   - Sound Effects (SFX): `0`
2. **Dialogue Bubbles (9)**:
   - `可是我记得爷爷你并没有把家传功法给他啊？他怎么修改的?` (Panel 1, top-left)
   - `所以说武道宗师厉害呀，人家看你几眼就大致了解了。` (Panel 1, top-right)
   - `我只是个修道之人。` (Panel 2, left bubble)
   - `先生这等能耐，不是宗师，胜似宗师啊。` (Panel 2, right bubble)
   - `这是小培元丹，一共十粒。定时服用再配合功法，病情就可以根治了。` (Panel 3, watermark-colliding bubble - trailing line `可以根治了。` MUST be captured)
   - `可惜大培元丹的药材难得，否则别说魏老的肺伤，死而复生也不难。` (Panel 4, left bubble)
   - `你吹牛的吧，起死回生？这不是神话传说里瞎编的吗?` (Panel 4, right bubble)
   - `爱信不信。` (Panel 5, chibi left bubble)
   - `哼` (Panel 5, chibi right bubble)
3. **Negative Guards & Filtering**:
   - `COLAMANGA.com`, `ACloudMerge.com`, and `腾讯动漫` watermark text must NOT contaminate any speech bubbles or create ghost regions.
   - The colliding dialogue text `可以根治了。` must NOT be dropped by watermark filters.

---
