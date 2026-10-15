import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
if (process.argv[2] === "setup") {
  if (!existsSync(".env")) {
    const db = randomBytes(24).toString("hex");
    const password = randomBytes(18).toString("base64url");
    const template = readFileSync(".env.example", "utf8")
      .replaceAll("replace-with-random-local-password", db)
      .replace("replace-with-a-long-unique-password", password);
    writeFileSync(".env", template, { mode: 0o600 });
    console.log("Created private .env. Your local owner credentials are in FORM_USERNAME / FORM_PASSWORD.");
  }
  if (process.argv.includes("--ubuntu-postgres")) {
    const build = spawnSync("docker", ["build", "-t", "formsoftware-postgres-dev:16", "deploy/postgres"], { stdio: "inherit" });
    if (build.status !== 0) {
      process.exit(build.status ?? 1);
    }
    let config = readFileSync(".env", "utf8");
    config = config.replace(/^FORM_POSTGRES_IMAGE=.*\n?/m, "");
    writeFileSync(".env", `${config.trimEnd()}\nFORM_POSTGRES_IMAGE=formsoftware-postgres-dev:16\n`, { mode: 0o600 });
  }
  mkdirSync(".local/attachments", { recursive: true });
  const result = spawnSync("docker", ["compose", "--env-file", ".env", "-f", "deploy/compose.dev.yml", "up", "-d", "--wait"], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}
if (!existsSync(".env")) {
  console.error("Run pnpm dev:setup first.");
  process.exit(1);
}
const children = [
  spawn("cargo", ["run", "-p", "form-server"], { stdio: "inherit" }),
  spawn("pnpm", ["--dir", "web", "dev"], { stdio: "inherit" }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop());
}
for (const child of children) {
  child.on("exit", (code) => stop(code ?? 0));
}
