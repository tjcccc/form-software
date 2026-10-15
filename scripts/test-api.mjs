import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
// SQLx creates and removes a fresh _sqlx_test_* database. Refuse any remote/admin target.
const config = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((s) => s && !s.startsWith("#"))
    .map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i), s.slice(i + 1)];
    }),
);
const url = new URL(config.DATABASE_URL);
if (url.hostname !== "127.0.0.1" || url.port !== "55437" || url.pathname !== "/formsoftware_dev") {
  throw new Error("API checks only run against this project's disposable OrbStack development service.");
}
const result = spawnSync("cargo", ["test", "-p", "form-server", "--test", "workflow", "--", "--nocapture"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url.toString() },
});
process.exit(result.status ?? 1);
