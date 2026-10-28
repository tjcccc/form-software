import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const fix = process.argv.includes("--fix");
if (process.argv.slice(2).some((arg) => arg !== "--fix")) {
  console.error("Usage: pnpm lint | pnpm lint:fix");
  process.exit(1);
}

const ignored = [
  "**/{node_modules,target,dist,coverage,output}/**",
  "**/.{local,playwright-cli,claude,codex,agents,opencode,pi,cursor}/**",
  "**/HANDOFF.md",
  "contracts/openapi.json",
  "web/src/api/schema.d.ts",
  "pnpm-lock.yaml",
];
const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
if (listed.status !== 0) {
  console.error(listed.stderr || listed.error?.message || "Could not list project files.");
  process.exit(1);
}
const files = [...new Set(listed.stdout.split("\0"))].filter(
  (file) => file && existsSync(file) && !ignored.some((pattern) => matchesGlob(file, pattern)),
);
const select = (pattern) => files.filter((file) => pattern.test(file)).map((file) => `./${file}`);
const code = select(/\.(?:[cm]?js|tsx?)$/);
const css = select(/\.css$/);
const markdown = select(/\.(?:md|markdown)$/);
const formatted = select(/\.(?:[cm]?js|tsx?|css|jsonc?|ya?ml|md|markdown)$/);
const shell = files
  .filter(
    (file) => /\.(?:sh|bash)$/.test(file) || (!extname(file) && /^#!.*\b(?:sh|bash)\b/.test(readFileSync(file, "utf8").split("\n", 1)[0])),
  )
  .map((file) => `./${file}`);
let failed = false;
function run(command, args) {
  console.log(`\n> ${command} ${args.filter((arg) => !arg.startsWith("./")).join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    if (result.error.code === "ENOENT") {
      console.error("Install required tools: pnpm install; rustup component add rustfmt clippy; brew install shellcheck shfmt (macOS).");
    }
  }
  failed ||= result.status !== 0;
}
function pnpm(tool, args, paths) {
  if (paths.length) {
    run("pnpm", ["exec", tool, ...args, ...paths]);
  }
}

pnpm("eslint", [...(fix ? ["--fix"] : []), "--max-warnings", "0"], code);
pnpm("stylelint", fix ? ["--fix"] : [], css);
pnpm("markdownlint-cli2", fix ? ["--fix"] : [], markdown);
pnpm("autocorrect", [fix ? "--fix" : "--lint", "--strict"], markdown);
if (shell.length) {
  run("shfmt", [fix ? "-w" : "-d", ...shell]);
  run("shellcheck", shell);
}
const workspace = process.platform === "darwin" ? ["--workspace"] : [];
if (fix) {
  run("cargo", ["clippy", ...workspace, "--all-targets", "--fix", "--allow-dirty", "--allow-staged", "--", "-D", "warnings"]);
}
pnpm("prettier", [fix ? "--write" : "--check"], formatted);
run("node", ["scripts/check-db-access.mjs"]);
run("node", ["scripts/check-file-sizes.mjs"]);
run("cargo", ["fmt", "--all", ...(fix ? [] : ["--", "--check"])]);
run("cargo", ["clippy", ...workspace, "--all-targets", "--", "-D", "warnings"]);
process.exitCode = failed ? 1 : 0;
