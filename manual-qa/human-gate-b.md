# Human Gate B Verification Guide — Quiz Library Organization & Collection-Style Categories

**Scope**: Pre-Freeze V1 Scope Closure · Batch B  
**Status**: PENDING HUMAN EVALUATION  
**Evaluator**: Human Reviewer / User  

---

## Overview

This guide provides step-by-step verification journeys for the Library Organization capabilities introduced in Pre-Freeze V1 Scope Closure Batch B:
1. **Category Navigation & Filtering**: Navigation list displaying All Papers, user-created Categories with counts, Uncategorized with counts, and `+ New Category`.
2. **Category Creation & Persistence**: Creating categories, empty category persistence across reloads/backups, and scoped search.
3. **Category Renaming**: Registry update with automatic propagation to all assigned papers.
4. **Paper Reassignment**: Moving papers between categories or Uncategorized via the category-aware selector, and creating new categories directly from paper settings.
5. **Category Deletion Contract & Safety**: Empty deletion confirmation, non-empty 3-way choice (Cancel / Delete Category Only / Delete Category + Papers), destructive confirmation, and active paper fallback safety.
6. **Backup & Restore Compatibility**: Preserving user-defined categories in full backup JSON and seamlessly recovering legacy backups.

---

## Verification Journey 1: Category Navigation & Creation

### Objective
Verify that the Category navigation panel displays accurate paper counts, supports creating new categories, and correctly filters the library.

### Steps
1. Launch Quiz Studio (`start-local.bat` or `python scripts/dev-server.py`).
2. Navigate to **Edit** (编辑) mode in the top navigation.
3. Inspect the sidebar Library panel:
   - Verify the new **Categories** (分类) navigation block located above the search bar and action buttons.
   - Confirm **All Papers** (所有试卷) is present and selected by default, displaying the total count of papers.
   - Confirm **Uncategorized** (未分类) is present, displaying the count of papers without a category.
   - Confirm the `+ New Category` (+ 新建分类) button is visible.
4. Click `+ New Category` (+ 新建分类):
   - In the prompt dialog, enter `"Mathematics"` (数学) and confirm.
   - Verify that `"Mathematics"` appears in the category list with count `0`.
   - Verify toast notification `"Category created"` (分类已创建).
   - Refresh the page and confirm the empty category `"Mathematics"` remains in the list.
5. Create a second category `"Languages"` (语言):
   - Confirm `"Languages"` appears with count `0`.

---

## Verification Journey 2: Paper Categorization & Scoped Search

### Objective
Verify that papers can be assigned to categories, new papers created inside a category inherit that category, and search queries are properly scoped.

### Steps
1. Select the `"Mathematics"` category in the sidebar:
   - Verify that the paper list is empty and displays `"No matching papers"` (没有匹配的试卷).
   - Verify that the search input placeholder reads `"Search in 'Mathematics'..."` (在 “Mathematics” 中搜索...).
2. Click **New Paper** (新建):
   - Verify that a new paper is created with category automatically set to `"Mathematics"`.
   - In the paper fields, set title to `"Algebra Basics"` and tags to `"math, algebra"`.
   - Verify the category count for `"Mathematics"` updates to `1`, and `"All Papers"` increments by `1`.
3. Select **All Papers** (所有试卷):
   - Verify that both the default paper and `"Algebra Basics"` are visible in the list.
4. Test Scoped Search:
   - Select `"Mathematics"`. In the search bar, type `"sample"`:
     - Verify no papers match (since `"Algebra Basics"` does not contain `"sample"`).
   - Select **All Papers**. Keep `"sample"` in the search bar:
     - Verify the default sample paper appears.
   - Clear search query.

---

## Verification Journey 3: Paper Category Reassignment & Inline Category Creation

### Objective
Verify that existing papers can be moved between categories, unassigned, or assigned to newly created categories via the paper editor dropdown.

### Steps
1. Open the default sample paper from the library list.
2. In the paper editor sidebar, locate the **Category** (分类) dropdown:
   - Verify it lists `"Uncategorized"` (未分类), `"Mathematics"`, `"Languages"`, and `"+ New Category..."` (+ 新建分类...).
3. Select `"Languages"` from the dropdown:
   - Verify the paper's category is updated to `"Languages"`.
   - Verify the sidebar count for `"Languages"` increases to `1`.
4. Select `"+ New Category..."` (+ 新建分类...) from the dropdown:
   - In the prompt, enter `"Science"` (科学) and confirm.
   - Verify toast `"Category created"` appears.
   - Verify the paper's category is set to `"Science"`.
   - Verify `"Science"` now appears in the Category navigation list with count `1`.
5. Change the category to `"Uncategorized"` (未分类):
   - Verify the paper category becomes empty.
   - Verify `"Uncategorized"` count increases by `1`, and `"Science"` count becomes `0`.

---

## Verification Journey 4: Category Renaming & Propagation

### Objective
Verify that renaming a category updates the registry and automatically propagates the new name to all assigned papers without data loss.

### Steps
1. Assign at least two papers to the `"Mathematics"` category.
2. In the Category navigation list, hover over `"Mathematics"`:
   - Verify the edit/rename icon (`✎`) and delete icon (`🗑`) are accessible.
3. Click the rename icon (`✎`):
   - In the prompt dialog, change `"Mathematics"` to `"Advanced Mathematics"` and confirm.
4. Verify results:
   - Verify toast `"Category renamed"` (分类已重命名).
   - Verify the category navigation list now shows `"Advanced Mathematics"` with count `2`.
   - Open each of the two papers and verify their Category field reflects `"Advanced Mathematics"`.
   - Verify all questions, tags, and descriptions of both papers remain completely unchanged.

---

## Verification Journey 5: Safe Category Deletion Contract

### Objective
Verify both branches of the category deletion contract: single confirmation for empty categories, and the 3-way choice (Cancel, Delete Category Only, Delete Category + Papers) for populated categories with active paper safety.

### Steps
1. **Empty Category Deletion**:
   - In the Category navigation list, click the delete icon (`🗑`) on the empty `"Science"` category.
   - Verify a single confirmation dialog appears: `"Are you sure you want to delete the empty category 'Science'?"`.
   - Confirm deletion.
   - Verify `"Science"` is removed from the list and toast `"Category deleted"` appears.
2. **Populated Category Deletion — Cancel**:
   - Ensure `"Advanced Mathematics"` contains 2 papers.
   - Click the delete icon (`🗑`) on `"Advanced Mathematics"`.
   - Verify the Category Deletion Dialog opens, stating:
     `"Category 'Advanced Mathematics' contains 2 paper(s). Choose deletion option:"`
     with 3 buttons:
     - `Delete Category Only (keep papers as Uncategorized)` (仅删除分类（保留试卷为未分类）)
     - `Delete Category + Papers (2 papers)` (删除分类及所有试卷 (2 份))
     - `Cancel` (取消)
   - Click **Cancel** (or dialog close button `✕`):
     - Verify nothing is modified: category and both papers remain untouched.
3. **Populated Category Deletion — Delete Category Only**:
   - Click delete icon (`🗑`) on `"Advanced Mathematics"`.
   - Click **Delete Category Only (keep papers as Uncategorized)**:
     - Verify `"Advanced Mathematics"` is removed from the registry.
     - Verify both papers still exist in the library, and their category is now `"Uncategorized"`.
     - Verify no questions, tags, or paper content are lost.
4. **Populated Category Deletion — Delete Category + Papers (Destructive)**:
   - Create a test category `"Temporary"`, create 2 papers in it, and make one of them the currently active open paper.
   - Click delete icon (`🗑`) on `"Temporary"`.
   - Click **Delete Category + Papers (2 papers)**:
     - Verify an explicit secondary destructive confirmation appears:
       `"[CAUTION] Are you sure you want to delete category 'Temporary' AND all 2 paper(s) in it? This action cannot be undone!"`
     - Confirm deletion.
     - Verify `"Temporary"` is removed and both papers in it are deleted.
     - Verify that the active paper safely falls back to an available remaining paper (or default paper), never leaving `activePaperId` invalid.
     - Verify any active quiz session for the deleted paper is safely cleared.

---

## Verification Journey 6: Backup & Restore Compatibility

### Objective
Verify that user-created categories (including empty categories) survive backup export and import, and legacy backups without a category registry restore cleanly.

### Steps
1. Create categories `"Physics"`, `"Chemistry"`, and an empty category `"Biology"`. Assign papers to `"Physics"` and `"Chemistry"`.
2. In the Library panel, click **Backup** (备份) to export the full library backup JSON.
3. Inspect the exported JSON file:
   - Confirm `library.categories` contains `["Physics", "Chemistry", "Biology"]`.
4. Delete `"Biology"` and rename `"Physics"` locally to `"Physics Old"`.
5. Click **Import Backup** (导入备份) and select the backup JSON from Step 2:
   - Verify toast `"Backup imported"` (已导入备份).
   - Verify that `"Physics"`, `"Chemistry"`, and empty `"Biology"` are fully restored in the Category navigation list.
   - Verify all papers and their assigned categories are restored cleanly.
6. Test Bilingual Localization:
   - Switch language between English and 中文 in the topbar.
   - Verify that all Category navigation labels, buttons, tooltips, dialogs, and toasts update cleanly without untranslated keys.

---

## Verdict & Sign-off

| Journey | Description | Result |
|---|---|---|
| **Journey 1** | Category Navigation & Creation (Empty persistence) | `[PASS / FAIL]` |
| **Journey 2** | Paper Categorization & Scoped Search | `[PASS / FAIL]` |
| **Journey 3** | Paper Category Reassignment & Inline Category Creation | `[PASS / FAIL]` |
| **Journey 4** | Category Renaming & Automatic Propagation | `[PASS / FAIL]` |
| **Journey 5** | Category Deletion Contract (Empty / Cancel / Delete Only / Delete with Papers) | `[PASS / FAIL]` |
| **Journey 6** | Backup & Restore Compatibility & Bilingual Localization | `[PASS / FAIL]` |

**Overall Gate Verdict**: `[PASS / FAIL]`  
**Notes / Comments**:
