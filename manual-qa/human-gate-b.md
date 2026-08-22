# Human Gate B Verification Guide — Quiz Library Organization & Progressive Navigation

**Scope**: Pre-Freeze V1 Scope Closure · Batch B  
**Status**: PENDING HUMAN EVALUATION  
**Evaluator**: Human Reviewer / Product Owner  

---

## Overview

This guide provides step-by-step verification journeys for the Library Organization & UI Polish capabilities introduced in Pre-Freeze V1 Scope Closure Batch B:
1. **Progressive Single-Level Sidebar Navigation (Level 1 → Level 2 → Level 3)**:
   - **Level 1 (Categories)**: All Papers, user Categories, Uncategorized, Category CRUD, and Backup utilities.
   - **Level 2 (Papers)**: Breadcrumb back-link to Categories, current category identity & count, scoped search, and paper actions.
   - **Level 3 (Questions)**: Breadcrumb back-link to Papers, active paper identity & category badge, paper fields, and question list/actions.
2. **Category Management, Accessibility & Protection**: Keyboard accessibility (Tab / Enter / Space), reserved name protection (`__ALL__`, `__UNCATEGORIZED__`, `__NEW_CATEGORY__`), empty category persistence across reloads/backups.
3. **Paper Categorization, Scoped Search & Inline Category Creation**: Paper category reassignment, category inheritance for new papers, category-scoped search queries.
4. **Category Renaming & Collision Safety**: Registry update with automatic propagation to assigned papers, reserved name protection, and safe rejection of rename collisions (preventing silent category merges).
5. **Polished Category Deletion Modal & Safety Contract**:
   - Modal header with conventional top-right close button.
   - Distinct safe card ("Delete Category Only") and destructive card ("Delete Category + Papers" with permanent deletion count).
   - Secondary cancel action, Layered Paper Study Desk design tokens, and secondary confirmation dialog.
6. **Backup & Restore Compatibility & Localization**: Full backup preservation of categories and bilingual UI localization.

---

## Verification Journey 1: Progressive Single-Level Sidebar Navigation

### Objective
Verify that the Edit mode sidebar follows a clean, single-level progressive navigation model (Category → Paper → Question) that eliminates clutter and cognitive overload while providing clear breadcrumb navigation.

### Steps
1. Launch Quiz Studio (`start-local.bat` or `python scripts/dev-server.py`).
2. Navigate to **Edit** (编辑) mode from the topbar.
3. **Inspect Level 1 (Categories)**:
   - If the sidebar is currently viewing a paper, click `← Back to Papers` (← 返回试卷列表), then click `← Back to Categories` (← 返回分类列表).
   - Verify that Level 1 shows **only**:
     - Heading `Quiz Library` (`本地试卷库`) and total count.
     - Category list: `All Papers` (`所有试卷`), user categories (if any), and `Uncategorized` (`未分类`).
     - `+ New Category` (`+ 新建分类`) button.
     - Full backup actions (`Backup` / `Import backup`).
   - Confirm that paper fields, question lists, and question authoring buttons are **not visible** at this level.
4. **Transition to Level 2 (Papers)**:
   - Click on `All Papers` (or any Category row).
   - Verify the sidebar transitions smoothly to Level 2:
     - Clear breadcrumb back button: `← Back to Categories` (`← 返回分类列表`).
     - Header showing current category identity and count: `📋 All Papers (N)`.
     - Scoped search input.
     - Paper action buttons: `New` (`新建`), `Duplicate` (`复制`), `Rename` (`重命名`), `Delete` (`删除`).
     - Filtered paper list.
5. **Transition to Level 3 (Questions)**:
   - Click on any paper in the list.
   - Verify the sidebar transitions smoothly to Level 3:
     - Clear breadcrumb back button: `← Back to Papers` (`← 返回试卷列表`).
     - Summary card displaying the paper's title and category badge.
     - Paper fields: Title, Description, Category dropdown, Tags.
     - Add question buttons: Single, Multiple, Blank, True/False, Matching.
     - Question list with question count.
     - Single-paper Export / Import buttons.
6. **Test Backward Navigation**:
   - Click `← Back to Papers`: verify sidebar returns to Level 2 for the selected category.
   - Click `← Back to Categories`: verify sidebar returns to Level 1.
7. **Subjective Assessment**:
   - Confirm that at any moment, the sidebar presents only one focused hierarchy level, significantly reducing visual clutter and cognitive overload.

---

## Verification Journey 2: Category Management & Accessibility

### Objective
Verify that Category navigation is fully keyboard-accessible, prevents reserved internal names, supports creating new categories, and persists empty categories across reloads.

### Steps
1. In Level 1 (Categories), test Keyboard Accessibility:
   - Using the `Tab` key on your keyboard, navigate through the Category navigation list:
     - Verify each category entry (All Papers, user categories, Uncategorized) receives clear visible focus.
     - Press `Enter` or `Space` on an entry to select and enter that category (Level 2).
     - Navigate back to Level 1.
     - Verify Rename (`✎`) and Delete (`🗑`) buttons are reachable as separate tab stops and can be activated via keyboard.
2. Test Reserved Name Protection:
   - Click `+ New Category` (+ 新建分类).
   - Enter `"__ALL__"` or `"__NEW_CATEGORY__"` or `"__UNCATEGORIZED__"`:
     - Verify toast `"This category name is reserved. Please use a different name"` (该分类名称为系统保留字，请使用其他名称) appears.
     - Verify no category is created.
3. Create Valid Categories:
   - Click `+ New Category` (+ 新建分类).
   - Enter `"Mathematics"` (数学) and confirm:
     - Verify toast notification `"Category created"` (分类已创建).
     - Verify sidebar automatically enters Level 2 for `"Mathematics"` with count `0`.
   - Return to Level 1, refresh the page, and confirm `"Mathematics"` remains in the list with count `0`.
4. Create a second category `"Languages"` (语言):
   - Confirm `"Languages"` is created with count `0`.

---

## Verification Journey 3: Paper Categorization & Scoped Search

### Objective
Verify that papers can be assigned to categories, new papers created inside a category inherit that category, and search queries are properly scoped.

### Steps
1. In Level 1, click `"Mathematics"` to enter Level 2:
   - Verify that the paper list is empty and displays `"No matching papers"` (没有匹配的试卷).
   - Verify that the search input placeholder reads `"Search title, category, or tags (Mathematics)"`.
2. Click **New** (新建) paper:
   - Verify a new paper is created with category automatically set to `"Mathematics"`.
   - Verify sidebar transitions to Level 3 (Questions) for this paper.
   - In paper fields, set title to `"Algebra Basics"` and tags to `"math, algebra"`.
   - Verify the summary card badge reflects `"Mathematics"`.
3. Click `← Back to Papers`:
   - Verify `"Algebra Basics"` appears in `"Mathematics"` with category count `1`.
4. Click `← Back to Categories`:
   - Verify `"Mathematics"` shows count `1` and `"All Papers"` reflects the updated total count.
5. Test Scoped Search:
   - Enter `"Mathematics"` (Level 2). In search, type `"sample"`:
     - Verify no papers match.
   - Return to Level 1, enter `"All Papers"`. Keep `"sample"` in search:
     - Verify default sample paper appears.
   - Clear search query.

---

## Verification Journey 4: Paper Category Reassignment & Inline Creation

### Objective
Verify that existing papers can be moved between categories, unassigned, or assigned to newly created categories via the paper editor dropdown.

### Steps
1. Open the default sample paper in Level 3 (Questions).
2. Locate the **Category** (分类) dropdown:
   - Verify it lists `"Uncategorized"` (未分类), `"Mathematics"`, `"Languages"`, and `"+ New Category..."` (+ 新建分类...).
3. Select `"Languages"` from the dropdown:
   - Verify the summary card category badge updates to `"Languages"`.
   - Click `← Back to Papers` → `← Back to Categories`: verify `"Languages"` count increases to `1`.
4. Return to the paper (Level 3), and select `"+ New Category..."`:
   - Test reserved name check: enter `"__NEW_CATEGORY__"` -> verify toast `"This category name is reserved. Please use a different name"`.
   - In the prompt, enter `"Science"` (科学) and confirm.
   - Verify toast `"Category created"` appears.
   - Verify paper's category badge updates to `"Science"`.
5. Change category to `"Uncategorized"`:
   - Verify summary badge updates to `"Uncategorized"`.
   - Return to Level 1: verify `"Uncategorized"` count increases by `1`, and `"Science"` count becomes `0`.

---

## Verification Journey 5: Category Renaming & Collision Safety

### Objective
Verify that renaming a category updates the registry and automatically propagates the new name to all assigned papers without data loss, and that renaming to an existing category or reserved name is safely rejected without merging.

### Steps
1. In Level 1, ensure `"Mathematics"` contains at least 1 paper.
2. Test Collision Safety:
   - Click the rename icon (`✎`) on `"Mathematics"`.
   - Enter `"Languages"` (which already exists):
     - Verify toast `"Category already exists"` (该分类名称已存在) appears.
     - Verify rename is rejected: `"Mathematics"` and `"Languages"` remain two separate categories, and paper counts/assignments are untouched (no silent merge).
3. Test Reserved Name Rejection on Rename:
   - Click rename icon (`✎`) on `"Mathematics"`.
   - Enter `"__ALL__"` -> verify toast `"This category name is reserved. Please use a different name"`.
4. Perform Valid Rename:
   - Click rename icon (`✎`) on `"Mathematics"`.
   - In prompt dialog, change `"Mathematics"` to `"Advanced Mathematics"` and confirm.
   - Verify toast `"Category renamed"` (分类已重命名).
   - Verify category navigation list now shows `"Advanced Mathematics"`.
   - Enter `"Advanced Mathematics"` and open assigned paper: verify its Category reflects `"Advanced Mathematics"`.

---

## Verification Journey 6: Polished Category Deletion Modal & Safety Contract

### Objective
Verify the visual design and behavioral contract of the polished Category Deletion Modal: modal header, top-right close button, safe option card, destructive option card, cancel button, and secondary confirmation.

### Steps
1. **Empty Category Deletion**:
   - In Level 1, click delete icon (`🗑`) on empty `"Science"` category.
   - Verify single confirmation dialog appears: `"Are you sure you want to delete the empty category 'Science'?"`.
   - Confirm deletion: verify `"Science"` is removed and toast `"Category deleted"` appears.
2. **Populated Category Deletion Modal Inspection**:
   - Ensure `"Advanced Mathematics"` contains at least 1 paper.
   - Click delete icon (`🗑`) on `"Advanced Mathematics"`.
   - Inspect the Category Deletion Dialog:
     - **Header**: Verify title `"Delete Category"` (`删除分类`) with standard close button (`✕` / `&times;`) in the top-right corner.
     - **Prompt**: Verify clear description stating the category name and how many papers it contains.
     - **Safe Option Card**: Verify `"Delete Category Only"` (`仅删除分类`) card explaining that papers will be kept and set to Uncategorized.
     - **Destructive Option Card**: Verify `"Delete Category + Papers"` (`删除分类及所有试卷`) card visually highlighted with vermilion styling and stating the permanent deletion warning.
     - **Cancel Action**: Verify secondary `"Cancel"` (`取消`) button in footer.
     - **Visual Consistency**: Confirm modal styling follows the Layered Paper Study Desk design system (rounded corners, subtle borders, paper sheet background).
3. **Populated Category Deletion — Cancel**:
   - Click **Cancel** (or `✕` close button):
     - Verify dialog closes and category + papers remain untouched.
4. **Populated Category Deletion — Delete Category Only**:
   - Click delete icon (`🗑`) on `"Advanced Mathematics"`.
   - Click **Delete Category Only** button:
     - Verify `"Advanced Mathematics"` is removed from the registry.
     - Verify its papers remain in the library, and their category is now `"Uncategorized"`.
     - Verify zero paper or question loss.
5. **Populated Category Deletion — Delete Category + Papers (Destructive)**:
   - Create a test category `"Temporary"`, create 2 papers in it, and make one the active paper.
   - Click delete icon (`🗑`) on `"Temporary"`.
   - Click **Delete Category + Papers** button:
     - Verify an explicit secondary destructive confirmation appears:
       `"[CAUTION] Are you sure you want to delete category 'Temporary' AND all 2 paper(s) in it? This action cannot be undone!"`
     - Confirm deletion.
     - Verify `"Temporary"` and both papers are deleted.
     - Verify active paper safely falls back to a remaining paper (never invalid).

---

## Verification Journey 7: Backup & Restore Compatibility & Localization

### Objective
Verify that user-created categories survive backup export and import, and bilingual localization is comprehensive.

### Steps
1. In Level 1, click **Backup** (备份) to export full library backup JSON.
2. Inspect exported JSON: confirm `library.categories` contains all user categories.
3. Import backup JSON: verify all categories and papers restore cleanly.
4. Test Bilingual Localization:
   - Switch language between English and 中文 in the topbar.
   - Verify that all breadcrumbs (`← Back to Categories`, `← Back to Papers`), headers, badges, buttons, dialog cards, and toasts update cleanly.

---

## Verdict & Sign-off

| Journey | Description | Result |
|---|---|---|
| **Journey 1** | Progressive Single-Level Sidebar Navigation (Level 1 → Level 2 → Level 3) & Cognitive Load Reduction | `[PASS / FAIL]` |
| **Journey 2** | Category Management, Accessibility & Protection (Keyboard nav, Reserved names, Empty persistence) | `[PASS / FAIL]` |
| **Journey 3** | Paper Categorization & Scoped Search | `[PASS / FAIL]` |
| **Journey 4** | Paper Category Reassignment & Inline Category Creation | `[PASS / FAIL]` |
| **Journey 5** | Category Renaming & Collision Safety (No silent merge) | `[PASS / FAIL]` |
| **Journey 6** | Polished Category Deletion Modal & Safety Contract (Design system visual alignment & 3-way choices) | `[PASS / FAIL]` |
| **Journey 7** | Backup & Restore Compatibility & Bilingual Localization | `[PASS / FAIL]` |

**Overall Gate Verdict**: `[PASS / FAIL]`  
**Notes / Comments**:
