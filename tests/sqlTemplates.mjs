// Shared by the SQL harnesses.
//
// The app's queries embed shared conditions as template placeholders —
// ${liveSale("s")}, ${liveRepayment("r")} and so on. A harness that lifts a
// query out of the source has to substitute them, or SQLite receives a literal
// dollar sign and fails with "unrecognized token".
//
// This lives in one place because three harnesses needed it and each one
// silently broke the moment a new condition was added. Reading the helpers
// generically means a condition added next year is substituted without anyone
// remembering to come back here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const corrections = fs.readFileSync(
  ROOT + "/src/db/queries/corrections.ts",
  "utf8"
);

const TEMPLATES = {};
for (const m of corrections.matchAll(
  /export function (live\w+)\([\s\S]*?return `([\s\S]*?)`;/g
)) {
  TEMPLATES[m[1]] = m[2];
}

/** Replaces every ${liveX("alias")} with the condition the app really uses. */
export function fillSql(sql) {
  return sql.replace(/\$\{(live\w+)\("(\w+)"\)\}/g, (_whole, fn, alias) => {
    const tpl = TEMPLATES[fn];
    if (!tpl) throw new Error(`no template found for ${fn}`);
    return tpl.replace(/\$\{alias\}/g, alias);
  });
}

/** Lifts one query out of a source file by its opening text, ready to run. */
export function sqlFromSource(src, prefix) {
  const i = src.indexOf("`" + prefix);
  if (i < 0) throw new Error("SQL not found: " + prefix);
  return fillSql(src.slice(i + 1, src.indexOf("`", i + 1)));
}

/** Every CREATE statement in schema.ts, including UNIQUE indexes. */
export function schemaStatements() {
  const schema = fs.readFileSync(ROOT + "/src/db/schema.ts", "utf8");
  return [
    ...schema.matchAll(/`(CREATE (?:UNIQUE )?(?:TABLE|INDEX)[\s\S]*?)`/g),
  ].map((m) => m[1]);
}
