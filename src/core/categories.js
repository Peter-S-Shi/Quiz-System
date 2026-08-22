/**
 * Category domain module for Quiz Studio paper library organization.
 * Provides collection-style Category registry, filtering, renaming, and safe deletion.
 */

export const ALL_PAPERS_CATEGORY = "__ALL__";
export const UNCATEGORIZED_CATEGORY = "";

export const RESERVED_CATEGORY_NAMES = new Set([
  "__ALL__",
  "__UNCATEGORIZED__",
  "__NEW_CATEGORY__",
  "__NEW__",
]);

/**
 * Checks if a string matches any internal sentinel or reserved category name (case-insensitive and trimmed).
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isReservedCategoryName(name = "") {
  if (typeof name !== "string") return false;
  const trimmedUpper = name.trim().toUpperCase();
  for (const reserved of RESERVED_CATEGORY_NAMES) {
    if (trimmedUpper === reserved.toUpperCase()) return true;
  }
  return false;
}

/**
 * Normalizes a list of category names, deduplicating, trimming whitespace,
 * filtering empty strings/reserved names, and incorporating any non-empty category strings from papers.
 *
 * @param {Array<string>} [categoryList=[]]
 * @param {Array<{ category?: string }>} [papers=[]]
 * @returns {Array<string>}
 */
export function normalizeCategoryList(categoryList = [], papers = []) {
  const result = [];
  const seen = new Set();

  function add(name) {
    if (typeof name !== "string") return;
    const trimmed = name.trim();
    if (!trimmed || isReservedCategoryName(trimmed)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  }

  if (Array.isArray(categoryList)) {
    categoryList.forEach(add);
  }

  if (Array.isArray(papers)) {
    papers.forEach((paper) => {
      if (paper?.category) {
        add(paper.category);
      }
    });
  }

  return result;
}

/**
 * Appends a new category name to the category list if valid and not already present or reserved.
 *
 * @param {Array<string>} [categoryList=[]]
 * @param {string} name
 * @returns {Array<string>}
 */
export function createCategory(categoryList = [], name = "") {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || isReservedCategoryName(trimmed)) return [...(categoryList || [])];
  const list = normalizeCategoryList(categoryList);
  if (list.includes(trimmed)) return list;
  return [...list, trimmed];
}

/**
 * Renames an existing category across the category list and all matching papers.
 * Rejects rename if the new name is invalid, reserved, or collides with an existing category.
 *
 * @param {Array<string>} [categoryList=[]]
 * @param {string} oldName
 * @param {string} newName
 * @param {Array<object>} [papers=[]]
 * @returns {{ categoryList: Array<string>, papers: Array<object>, affectedPaperCount: number, success: boolean, reason?: string }}
 */
export function renameCategory(categoryList = [], oldName = "", newName = "", papers = []) {
  const trimmedOld = typeof oldName === "string" ? oldName.trim() : "";
  const trimmedNew = typeof newName === "string" ? newName.trim() : "";
  const currentList = normalizeCategoryList(categoryList, papers);

  if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew || isReservedCategoryName(trimmedNew)) {
    return {
      categoryList: currentList,
      papers: Array.isArray(papers) ? [...papers] : [],
      affectedPaperCount: 0,
      success: false,
      reason: isReservedCategoryName(trimmedNew) ? "RESERVED" : "INVALID_NAME",
    };
  }

  // Rename collision: if newName already exists (other than oldName), reject the rename safely!
  if (currentList.includes(trimmedNew)) {
    return {
      categoryList: currentList,
      papers: Array.isArray(papers) ? [...papers] : [],
      affectedPaperCount: 0,
      success: false,
      reason: "COLLISION",
    };
  }

  const nextList = currentList.map((cat) => (cat === trimmedOld ? trimmedNew : cat));

  let affectedPaperCount = 0;
  const nextPapers = (papers || []).map((paper) => {
    if (paper?.category === trimmedOld) {
      affectedPaperCount += 1;
      return { ...paper, category: trimmedNew, updatedAt: new Date().toISOString() };
    }
    return paper;
  });

  return {
    categoryList: nextList,
    papers: nextPapers,
    affectedPaperCount,
    success: true,
  };
}

/**
 * Deletes a category from the registry and resets all papers belonging to it to Uncategorized ("").
 * Preserves all papers and evidence.
 *
 * @param {Array<string>} [categoryList=[]]
 * @param {string} name
 * @param {Array<object>} [papers=[]]
 * @returns {{ categoryList: Array<string>, papers: Array<object>, reassignedPaperCount: number }}
 */
export function deleteCategoryOnly(categoryList = [], name = "", papers = []) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const list = normalizeCategoryList(categoryList, papers).filter((cat) => cat !== trimmed);

  let reassignedPaperCount = 0;
  const nextPapers = (papers || []).map((paper) => {
    if (paper?.category === trimmed) {
      reassignedPaperCount += 1;
      return { ...paper, category: "", updatedAt: new Date().toISOString() };
    }
    return paper;
  });

  return {
    categoryList: list,
    papers: nextPapers,
    reassignedPaperCount,
  };
}

/**
 * Deletes a category and all papers belonging to it.
 *
 * @param {Array<string>} [categoryList=[]]
 * @param {string} name
 * @param {Array<object>} [papers=[]]
 * @returns {{ categoryList: Array<string>, keptPapers: Array<object>, deletedPapers: Array<object>, deletedPaperIds: Array<string> }}
 */
export function deleteCategoryAndPapers(categoryList = [], name = "", papers = []) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const list = normalizeCategoryList(categoryList, papers).filter((cat) => cat !== trimmed);

  const keptPapers = [];
  const deletedPapers = [];
  const deletedPaperIds = [];

  (papers || []).forEach((paper) => {
    if (paper?.category === trimmed) {
      deletedPapers.push(paper);
      deletedPaperIds.push(paper.id);
    } else {
      keptPapers.push(paper);
    }
  });

  return {
    categoryList: list,
    keptPapers,
    deletedPapers,
    deletedPaperIds,
  };
}

/**
 * Filters a list of papers by selected category.
 *
 * @param {Array<object>} [papers=[]]
 * @param {string} selectedCategory
 * @returns {Array<object>}
 */
export function filterPapersByCategory(papers = [], selectedCategory = ALL_PAPERS_CATEGORY) {
  if (!Array.isArray(papers)) return [];
  if (selectedCategory === ALL_PAPERS_CATEGORY) {
    return [...papers];
  }
  if (selectedCategory === UNCATEGORIZED_CATEGORY || selectedCategory === "__UNCATEGORIZED__") {
    return papers.filter((paper) => !paper?.category || !paper.category.trim());
  }
  return papers.filter((paper) => paper?.category === selectedCategory);
}

/**
 * Derives counts for all papers, uncategorized papers, and each individual category.
 *
 * @param {Array<string>} [categoryList=[]]
 * @param {Array<object>} [papers=[]]
 * @returns {{ allCount: number, uncategorizedCount: number, categoryCounts: Record<string, number> }}
 */
export function getCategoryCounts(categoryList = [], papers = []) {
  const list = normalizeCategoryList(categoryList, papers);
  const categoryCounts = {};
  list.forEach((cat) => {
    categoryCounts[cat] = 0;
  });

  let uncategorizedCount = 0;

  (papers || []).forEach((paper) => {
    const cat = paper?.category?.trim();
    if (cat && Object.prototype.hasOwnProperty.call(categoryCounts, cat)) {
      categoryCounts[cat] += 1;
    } else if (cat) {
      categoryCounts[cat] = 1;
    } else {
      uncategorizedCount += 1;
    }
  });

  return {
    allCount: (papers || []).length,
    uncategorizedCount,
    categoryCounts,
  };
}

/**
 * Reassigns a paper's category while preserving all other paper properties and tags.
 *
 * @param {object} paper
 * @param {string} newCategory
 * @returns {object}
 */
export function reassignPaperCategory(paper, newCategory = "") {
  return {
    ...paper,
    category: typeof newCategory === "string" ? newCategory.trim() : "",
    updatedAt: new Date().toISOString(),
  };
}
