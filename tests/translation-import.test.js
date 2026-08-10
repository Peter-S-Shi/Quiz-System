import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import {
  createTranslationDocument,
  createTranslationFolder,
  createTranslationLibrary,
  getTranslationDocument,
  parseTranslationLibrary,
  validateTranslationDocument,
} from "../src/core/translation-domain.js";
import {
  findDocumentIdCollision,
  parseBilingualText,
  parseSourceOnlyText,
  parseTranslationDocumentJsonText,
  remapDocumentForCopy,
} from "../src/core/translation-import.js";

const CREATED_AT = "2026-02-01T09:00:00.000Z";

function createSyntheticLibraryWithFolder() {
  let library = createTranslationFolder(createTranslationLibrary(), {
    id: "folder-import-1",
    name: "Import Target",
    createdAt: CREATED_AT,
  });
  return library;
}

test("source-only import splits non-empty lines into items and rejects empty input", () => {
  const result = parseSourceOnlyText("Bonjour le monde\n\n  Comment ca va \n");
  assert.deepEqual(result.items, [{ sourceText: "Bonjour le monde" }, { sourceText: "Comment ca va" }]);
  assert.deepEqual(result.errors, []);

  const empty = parseSourceOnlyText("   \n\n");
  assert.equal(empty.items.length, 0);
  assert.deepEqual(empty.errors, ["No source lines were found."]);
});

test("bilingual import accepts source<TAB>reference rows and rejects malformed rows", () => {
  const result = parseBilingualText("Bonjour\tHello\nMerci beaucoup\tThank you very much");
  assert.deepEqual(result.items, [
    { sourceText: "Bonjour", referenceTranslation: "Hello" },
    { sourceText: "Merci beaucoup", referenceTranslation: "Thank you very much" },
  ]);
  assert.deepEqual(result.errors, []);

  const malformed = parseBilingualText("Bonjour\tHello\nNo tab on this line\nOnly source\t\n");
  assert.deepEqual(malformed.items, [{ sourceText: "Bonjour", referenceTranslation: "Hello" }]);
  assert.equal(malformed.errors.length, 2);
  assert.match(malformed.errors[0], /Line 2/);
  assert.match(malformed.errors[1], /Line 3/);

  const empty = parseBilingualText("\n  \n");
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.errors, ["No bilingual rows were found."]);
});

test("JSON Translation Document import validates structure independently of the local folder", async () => {
  const example = JSON.parse(
    await readFile(new URL("../examples/sample-translation-document.json", import.meta.url), "utf8"),
  );

  const valid = parseTranslationDocumentJsonText(JSON.stringify(example));
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.document.id, example.id);
  assert.equal(valid.document.folderId, example.folderId);

  const malformedJson = parseTranslationDocumentJsonText("{not json");
  assert.equal(malformedJson.document, null);
  assert.deepEqual(malformedJson.errors, ["The file is not valid JSON."]);

  const wrongType = parseTranslationDocumentJsonText(JSON.stringify({ ...example, documentType: "quiz-studio.quiz-paper" }));
  assert.equal(wrongType.document, null);
  assert.match(wrongType.errors[0], /Invalid Translation Document documentType/);

  const duplicateItemIds = parseTranslationDocumentJsonText(
    JSON.stringify({ ...example, items: [example.items[0], { ...example.items[1], id: example.items[0].id }] }),
  );
  assert.equal(duplicateItemIds.document, null);
  assert.match(duplicateItemIds.errors.join(" "), /Duplicate Translation Item id/);
});

test("an externally authored document can be assigned to a user-selected local folder at persist time", () => {
  const library = createSyntheticLibraryWithFolder();
  const { document, errors } = parseTranslationDocumentJsonText(JSON.stringify({
    schemaVersion: 1,
    documentType: "quiz-studio.translation-document",
    id: "external-document-1",
    title: "External Material",
    folderId: "unknown-folder-the-importer-cannot-see",
    sourceLanguage: "de",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    items: [{ id: "external-item-1", sourceText: "Guten Morgen", position: 0 }],
  }));
  assert.deepEqual(errors, []);

  const assigned = createTranslationDocument(library, { ...document, folderId: "folder-import-1" });
  const stored = getTranslationDocument(assigned, "external-document-1");
  assert.equal(stored.folderId, "folder-import-1");
  assert.equal(stored.title, "External Material");
});

test("duplicate document IDs are rejected unless explicitly imported as a remapped copy", () => {
  const library = createTranslationDocument(createSyntheticLibraryWithFolder(), {
    id: "document-existing",
    title: "Existing Document",
    folderId: "folder-import-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [{ id: "item-existing-1", sourceText: "Bonjour", position: 0 }],
  });

  const incoming = getTranslationDocument(library, "document-existing");
  assert.equal(findDocumentIdCollision(library, incoming.id), true);
  assert.throws(() => createTranslationDocument(library, incoming), /Translation Document already exists/);

  const copy = remapDocumentForCopy(incoming);
  assert.notEqual(copy.id, incoming.id);
  assert.notEqual(copy.items[0].id, incoming.items[0].id);
  assert.equal(findDocumentIdCollision(library, copy.id), false);

  const withCopy = createTranslationDocument(library, copy);
  assert.equal(withCopy.documents.length, 2);
  assert.equal(getTranslationDocument(withCopy, "document-existing").title, "Existing Document");
  assert.equal(getTranslationDocument(withCopy, copy.id).title, "Existing Document");
});

test("failed import validation never mutates the existing Translation Library", () => {
  const library = createSyntheticLibraryWithFolder();
  const snapshot = JSON.stringify(library);
  const malformed = parseTranslationDocumentJsonText("not json at all");
  assert.equal(malformed.document, null);
  assert.equal(JSON.stringify(library), snapshot);

  const malformedBilingual = parseBilingualText("broken line with no tab");
  assert.equal(malformedBilingual.items.length, 0);
  assert.equal(JSON.stringify(library), snapshot);
});

test("an exported Translation Document round-trips through JSON import and matches the public schema", async () => {
  const library = createTranslationDocument(createSyntheticLibraryWithFolder(), {
    id: "document-export-1",
    title: "Round Trip Notes",
    folderId: "folder-import-1",
    sourceLanguage: "ja",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [
      { id: "item-export-1", sourceText: "Ohayou", position: 0 },
      { id: "item-export-2", sourceText: "Arigatou", referenceTranslation: "Thank you", position: 1 },
    ],
  });
  const exported = getTranslationDocument(library, "document-export-1");

  const schema = JSON.parse(
    await readFile(new URL("../schemas/translation-document.schema.json", import.meta.url), "utf8"),
  );
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(exported), true, JSON.stringify(validateSchema.errors));

  const reimported = parseTranslationDocumentJsonText(JSON.stringify(exported));
  assert.deepEqual(reimported.errors, []);
  assert.deepEqual(reimported.document.items, exported.items);
});

test("Translation Library remains internally consistent after import assignment and persists validly", () => {
  let library = createSyntheticLibraryWithFolder();
  const { items } = parseSourceOnlyText("Line one\nLine two\nLine three");
  library = createTranslationDocument(library, {
    title: "Imported Source-Only Material",
    folderId: "folder-import-1",
    sourceLanguage: "es",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items,
  });

  const reloaded = parseTranslationLibrary(JSON.parse(JSON.stringify(library)));
  const document = reloaded.documents[0];
  assert.equal(document.items.length, 3);
  assert.deepEqual(validateTranslationDocument(document), { valid: true, errors: [] });
});
