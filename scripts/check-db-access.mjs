#!/usr/bin/env node
// Database boundary guard: only form-persistence and the server's auth code may query PostgreSQL.
// Clients and the domain crate must not depend on SQLx or the store; the server's other modules call `Store`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];
for (const crate of ["domain", "api-client", "cli", "desktop"]) {
  const manifest = readFileSync(`crates/${crate}/Cargo.toml`, "utf8");
  for (const dependency of ["sqlx", "form-persistence"]) {
    if (new RegExp(`^\\s*${dependency}\\s*[.=]`, "m").test(manifest)) {
      failures.push(`crates/${crate}/Cargo.toml: depends on ${dependency}; clients and the domain must use HTTP or pure types`);
    }
  }
}
const serverQueryAllowed = new Set(["auth.rs"]);
const query = /sqlx::query|\.pool\b/;
for (const file of readdirSync("crates/server/src", { recursive: true })) {
  if (!file.endsWith(".rs") || serverQueryAllowed.has(file)) {
    continue;
  }
  readFileSync(join("crates/server/src", file), "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (query.test(line)) {
        failures.push(`crates/server/src/${file}:${index + 1}: queries PostgreSQL directly; move the query into form-persistence`);
      }
    });
}
for (const failure of failures) {
  console.error(failure);
}
process.exitCode = failures.length ? 1 : 0;
