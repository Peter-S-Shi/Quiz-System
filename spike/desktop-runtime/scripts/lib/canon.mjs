// Canonical JSON (RFC 8785-style key order: UTF-16 code units) + SHA-256. Mirror of core/src/canon.rs.
import { createHash } from "node:crypto";

export function canonical(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort(); // default sort = UTF-16 code unit order
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

export function hashValue(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}
