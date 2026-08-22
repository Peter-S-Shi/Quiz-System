import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCategoryList,
  createCategory,
  renameCategory,
  deleteCategoryOnly,
  deleteCategoryAndPapers,
  filterPapersByCategory,
  getCategoryCounts,
  reassignPaperCategory,
  isReservedCategoryName,
  ALL_PAPERS_CATEGORY,
  UNCATEGORIZED_CATEGORY,
} from "../src/core/categories.js";

test("normalizeCategoryList preserves empty/non-empty categories, trims whitespace, deduplicates, and incorporates historical paper categories", () => {
  const categories = [" English ", "French", "English", "", "  ", null, undefined];
  const papers = [
    { id: "p1", title: "Paper 1", category: "German" },
    { id: "p2", title: "Paper 2", category: "English" },
    { id: "p3", title: "Paper 3", category: "" },
    { id: "p4", title: "Paper 4" },
  ];

  const normalized = normalizeCategoryList(categories, papers);
  assert.deepEqual(normalized, ["English", "French", "German"]);
});

test("createCategory appends a new trimmed category if valid and ignores duplicates or empty names", () => {
  const list = ["English", "French"];
  
  // Create valid new category
  const list1 = createCategory(list, " Chemistry ");
  assert.deepEqual(list1, ["English", "French", "Chemistry"]);

  // Duplicate category returns same list without duplicating
  const list2 = createCategory(list1, "English");
  assert.deepEqual(list2, ["English", "French", "Chemistry"]);

  // Empty or whitespace-only name returns original list
  const list3 = createCategory(list1, "   ");
  assert.deepEqual(list3, ["English", "French", "Chemistry"]);
});

test("renameCategory propagates the new name to all papers in that category and updates the registry", () => {
  const categoryList = ["English", "French"];
  const papers = [
    { id: "p1", title: "Paper 1", category: "English" },
    { id: "p2", title: "Paper 2", category: "English" },
    { id: "p3", title: "Paper 3", category: "French" },
    { id: "p4", title: "Paper 4", category: "" },
  ];

  const result = renameCategory(categoryList, "English", "Advanced English", papers);
  assert.deepEqual(result.categoryList, ["Advanced English", "French"]);
  assert.equal(result.affectedPaperCount, 2);
  assert.equal(result.papers.find((p) => p.id === "p1").category, "Advanced English");
  assert.equal(result.papers.find((p) => p.id === "p2").category, "Advanced English");
  assert.equal(result.papers.find((p) => p.id === "p3").category, "French");
  assert.equal(result.papers.find((p) => p.id === "p4").category, "");
});

test("deleteCategoryOnly removes category from registry and resets affected papers to Uncategorized without losing papers", () => {
  const categoryList = ["English", "French"];
  const papers = [
    { id: "p1", title: "Paper 1", category: "English", questions: [{ id: "q1" }] },
    { id: "p2", title: "Paper 2", category: "English", tags: ["ielts"] },
    { id: "p3", title: "Paper 3", category: "French" },
  ];

  const result = deleteCategoryOnly(categoryList, "English", papers);
  assert.deepEqual(result.categoryList, ["French"]);
  assert.equal(result.reassignedPaperCount, 2);
  assert.equal(result.papers.length, 3);
  assert.equal(result.papers.find((p) => p.id === "p1").category, "");
  assert.equal(result.papers.find((p) => p.id === "p1").questions.length, 1);
  assert.equal(result.papers.find((p) => p.id === "p2").category, "");
  assert.deepEqual(result.papers.find((p) => p.id === "p2").tags, ["ielts"]);
  assert.equal(result.papers.find((p) => p.id === "p3").category, "French");
});

test("deleteCategoryAndPapers deletes category and only the papers belonging to it", () => {
  const categoryList = ["English", "French"];
  const papers = [
    { id: "p1", title: "Paper 1", category: "English" },
    { id: "p2", title: "Paper 2", category: "English" },
    { id: "p3", title: "Paper 3", category: "French" },
    { id: "p4", title: "Paper 4", category: "" },
  ];

  const result = deleteCategoryAndPapers(categoryList, "English", papers);
  assert.deepEqual(result.categoryList, ["French"]);
  assert.deepEqual(result.deletedPaperIds, ["p1", "p2"]);
  assert.equal(result.deletedPapers.length, 2);
  assert.equal(result.keptPapers.length, 2);
  assert.deepEqual(result.keptPapers.map((p) => p.id), ["p3", "p4"]);
});

test("filterPapersByCategory correctly isolates papers for all, uncategorized, and specific category", () => {
  const papers = [
    { id: "p1", title: "English Paper 1", category: "English" },
    { id: "p2", title: "English Paper 2", category: "English" },
    { id: "p3", title: "French Paper 1", category: "French" },
    { id: "p4", title: "Uncategorized 1", category: "" },
    { id: "p5", title: "Uncategorized 2", category: null },
  ];

  // All papers
  const all = filterPapersByCategory(papers, ALL_PAPERS_CATEGORY);
  assert.equal(all.length, 5);

  // Uncategorized
  const uncat = filterPapersByCategory(papers, UNCATEGORIZED_CATEGORY);
  assert.equal(uncat.length, 2);
  assert.deepEqual(uncat.map((p) => p.id), ["p4", "p5"]);

  // Specific category English
  const english = filterPapersByCategory(papers, "English");
  assert.equal(english.length, 2);
  assert.deepEqual(english.map((p) => p.id), ["p1", "p2"]);

  // Specific category French
  const french = filterPapersByCategory(papers, "French");
  assert.equal(french.length, 1);
  assert.deepEqual(french.map((p) => p.id), ["p3"]);
});

test("getCategoryCounts derives counts for all, uncategorized, and each category including empty ones", () => {
  const categoryList = ["English", "French", "EmptyCategory"];
  const papers = [
    { id: "p1", category: "English" },
    { id: "p2", category: "English" },
    { id: "p3", category: "French" },
    { id: "p4", category: "" },
    { id: "p5" },
  ];

  const counts = getCategoryCounts(categoryList, papers);
  assert.equal(counts.allCount, 5);
  assert.equal(counts.uncategorizedCount, 2);
  assert.equal(counts.categoryCounts["English"], 2);
  assert.equal(counts.categoryCounts["French"], 1);
  assert.equal(counts.categoryCounts["EmptyCategory"], 0);
});

test("reassignPaperCategory updates category while preserving tags and other metadata", () => {
  const paper = {
    id: "p1",
    title: "Paper 1",
    category: "English",
    tags: ["exam", "level-1"],
    questions: [{ id: "q1" }],
  };

  const updated = reassignPaperCategory(paper, "French");
  assert.equal(updated.category, "French");
  assert.deepEqual(updated.tags, ["exam", "level-1"]);
  assert.equal(updated.id, "p1");

  const uncat = reassignPaperCategory(paper, "");
  assert.equal(uncat.category, "");
  assert.deepEqual(uncat.tags, ["exam", "level-1"]);
});

test("normalizeLibrary and library backup preserve categories and restore legacy structures cleanly", async () => {
  const { createLibraryBackup, parseLibraryBackup } = await import("../src/core/backup.js");
  const { normalizeLibrary } = await import("../src/core/migrations.js");

  // 1. normalizeLibrary with explicit empty category + papers
  const lib = normalizeLibrary({
    papers: [
      { id: "p1", title: "Paper 1", category: "English" },
      { id: "p2", title: "Paper 2", category: "German" },
    ],
    categories: ["English", "Spanish", "German"],
  });
  assert.deepEqual(lib.categories, ["English", "Spanish", "German"]);

  // 2. Backup round trip
  const backup = createLibraryBackup({ library: lib });
  const restored = parseLibraryBackup(backup);
  assert.deepEqual(restored.library.categories, ["English", "Spanish", "German"]);

  // 3. Legacy backup without categories field extracts categories from papers
  const legacyLib = {
    schemaVersion: 1,
    papers: [
      { id: "p1", title: "Paper 1", category: "French" },
      { id: "p2", title: "Paper 2", category: "" },
    ],
  };
  const legacyRestored = parseLibraryBackup({ library: legacyLib });
  assert.deepEqual(legacyRestored.library.categories, ["French"]);
});

test("isReservedCategoryName identifies internal sentinel values case-insensitively", () => {
  assert.equal(isReservedCategoryName("__ALL__"), true);
  assert.equal(isReservedCategoryName("__all__"), true);
  assert.equal(isReservedCategoryName(" __UNCATEGORIZED__ "), true);
  assert.equal(isReservedCategoryName("__NEW_CATEGORY__"), true);
  assert.equal(isReservedCategoryName("__new__"), true);
  assert.equal(isReservedCategoryName("Mathematics"), false);
  assert.equal(isReservedCategoryName(""), false);
});

test("createCategory rejects reserved internal category names", () => {
  const list = ["English"];
  assert.deepEqual(createCategory(list, "__ALL__"), ["English"]);
  assert.deepEqual(createCategory(list, "__new_category__"), ["English"]);
  assert.deepEqual(createCategory(list, " __UNCATEGORIZED__ "), ["English"]);
});

test("renameCategory rejects reserved internal category names safely", () => {
  const list = ["English", "Math"];
  const papers = [{ id: "p1", category: "English" }];

  const res1 = renameCategory(list, "English", "__ALL__", papers);
  assert.equal(res1.success, false);
  assert.equal(res1.reason, "RESERVED");
  assert.deepEqual(res1.categoryList, ["English", "Math"]);
  assert.equal(res1.papers[0].category, "English");

  const res2 = renameCategory(list, "English", "__NEW_CATEGORY__", papers);
  assert.equal(res2.success, false);
  assert.equal(res2.reason, "RESERVED");
});

test("renameCategory rejects collision with existing category and leaves categories and papers unchanged", () => {
  const categoryList = ["数学", "英语", "物理"];
  const papers = [
    { id: "p1", category: "数学" },
    { id: "p2", category: "英语" },
  ];

  // Renaming "数学" to already-existing "英语" must NOT silently merge
  const result = renameCategory(categoryList, "数学", "英语", papers);
  assert.equal(result.success, false);
  assert.equal(result.reason, "COLLISION");
  assert.deepEqual(result.categoryList, ["数学", "英语", "物理"]);
  assert.equal(result.affectedPaperCount, 0);
  assert.equal(result.papers[0].category, "数学");
  assert.equal(result.papers[1].category, "英语");
});

test("deleteCategoryAndPapers with all papers in library leaves empty keptPapers requiring default paper fallback", () => {
  const categoryList = ["SoleCategory"];
  const papers = [
    { id: "p1", category: "SoleCategory" },
    { id: "p2", category: "SoleCategory" },
  ];

  const result = deleteCategoryAndPapers(categoryList, "SoleCategory", papers);
  assert.deepEqual(result.categoryList, []);
  assert.equal(result.keptPapers.length, 0);
  assert.equal(result.deletedPapers.length, 2);
  assert.deepEqual(result.deletedPaperIds, ["p1", "p2"]);
});

test("search scoping within category vs all papers", () => {
  const papers = [
    { id: "p1", title: "Vocabulary Test", category: "English", tags: ["easy"] },
    { id: "p2", title: "Grammar Quiz", category: "English", tags: ["advanced"] },
    { id: "p3", title: "Vocabulary Exam", category: "French", tags: ["easy"] },
    { id: "p4", title: "Grammar Test", category: "", tags: ["basic"] },
  ];

  // 1. In Category "English", searching "vocabulary" returns only p1
  const englishPapers = filterPapersByCategory(papers, "English");
  const englishVocab = englishPapers.filter((p) => p.title.toLowerCase().includes("vocabulary"));
  assert.deepEqual(englishVocab.map((p) => p.id), ["p1"]);

  // 2. In All Papers, searching "vocabulary" returns p1 and p3
  const allPapers = filterPapersByCategory(papers, ALL_PAPERS_CATEGORY);
  const allVocab = allPapers.filter((p) => p.title.toLowerCase().includes("vocabulary"));
  assert.deepEqual(allVocab.map((p) => p.id), ["p1", "p3"]);

  // 3. In Uncategorized, searching "grammar" returns only p4
  const uncatPapers = filterPapersByCategory(papers, UNCATEGORIZED_CATEGORY);
  const uncatGrammar = uncatPapers.filter((p) => p.title.toLowerCase().includes("grammar"));
  assert.deepEqual(uncatGrammar.map((p) => p.id), ["p4"]);
});


