import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root = process.cwd();
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
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55437" ||
  url.pathname !== "/formsoftware_dev" ||
  config.FORM_BIND !== "127.0.0.1:3141" ||
  resolve(config.FORM_STORAGE) !== resolve(".local/attachments")
) {
  throw new Error("Restore checks only use this project's disposable local database and attachment directory.");
}
if (
  await fetch("http://127.0.0.1:3141/health")
    .then(() => true)
    .catch(() => false)
) {
  throw new Error("Stop the local API before taking a matched database + attachment snapshot.");
}
const compose = ["compose", "--env-file", ".env", "-f", "deploy/compose.dev.yml", "exec", "-T", "db"];
function docker(args, input) {
  const result = spawnSync("docker", [...compose, ...args], { input, maxBuffer: 100 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`Database utility ${args[0]} failed; the live database was not restored over.`);
  }
  return result.stdout;
}
function sql(db, query) {
  return docker(["psql", "-U", "formsw", "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();
}
const backup = resolve(".local/backups", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(backup, { recursive: true, mode: 0o700 });
const dump = docker(["pg_dump", "-U", "formsw", "-d", "formsoftware_dev", "--format=custom"]);
writeFileSync(`${backup}/database.dump`, dump, { mode: 0o600 });
docker(["pg_restore", "--list"], dump);
if (existsSync(".local/attachments")) {
  cpSync(".local/attachments", `${backup}/attachments`, { recursive: true });
} else {
  mkdirSync(`${backup}/attachments`);
}
const database = `formsw_restore_${randomUUID().replaceAll("-", "")}`;
let created = false;
let server;
try {
  sql("formsoftware_dev", `CREATE DATABASE "${database}" OWNER formsw`);
  created = true;
  docker(["pg_restore", "-U", "formsw", "--dbname", database, "--no-owner", "--exit-on-error"], dump);
  const tables = ["forms", "fields", "records", "record_relations", "attachments", "views"];
  const counts = {};
  for (const table of tables) {
    const query = `SELECT count(*)::text || ':' || md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM ${table} t`;
    const original = sql("formsoftware_dev", query);
    const restored = sql(database, query);
    if (original !== restored) {
      throw new Error(`Restored ${table} content differs.`);
    }
    counts[table] = Number(original.split(":")[0]);
  }
  const rows = sql(database, "SELECT storage_key || E'\\t' || sha256 FROM attachments ORDER BY id");
  const hashes = {};
  for (const row of rows ? rows.split("\n") : []) {
    const [key, expected] = row.split("\t");
    if (!/^[a-f0-9-]+$/.test(key)) {
      throw new Error("Unexpected attachment storage key.");
    }
    const hash = createHash("sha256")
      .update(readFileSync(`${backup}/attachments/${key}`))
      .digest("hex");
    if (hash !== expected) {
      throw new Error("Restored attachment checksum differs.");
    }
    hashes[key] = hash;
  }
  url.pathname = `/${database}`;
  server = spawn(resolve("target/debug/form-server"), [], {
    cwd: root,
    stdio: "ignore",
    env: {
      ...process.env,
      ...config,
      DATABASE_URL: url.toString(),
      FORM_BIND: "127.0.0.1:3143",
      FORM_ORIGIN: "http://127.0.0.1:3143",
      FORM_STORAGE: `${backup}/attachments`,
      FORM_SEED_DEMO: "false",
    },
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    ready = await fetch("http://127.0.0.1:3143/health")
      .then((r) => r.ok)
      .catch(() => false);
    if (ready) {
      break;
    }
    await delay(100);
  }
  if (!ready) {
    throw new Error("Restored API did not start.");
  }
  const login = await fetch("http://127.0.0.1:3143/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: config.FORM_USERNAME, password: config.FORM_PASSWORD }),
  });
  if (!login.ok) {
    throw new Error("Restored owner could not authenticate.");
  }
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const formsResponse = await fetch("http://127.0.0.1:3143/api/v1/forms", { headers });
  if (!formsResponse.ok) {
    throw new Error("Restored forms could not be read.");
  }
  const forms = await formsResponse.json();
  const form = forms.find((f) => f.record_count > 0);
  if (form) {
    const response = await fetch(`http://127.0.0.1:3143/api/v1/forms/${form.id}/records`, { headers });
    const page = await response.json();
    if (!response.ok || !page.records.length) {
      throw new Error("Restored records could not be read.");
    }
  }
  writeFileSync(
    `${backup}/verification.json`,
    JSON.stringify({ at: new Date().toISOString(), counts, hashes, authenticatedRead: true }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    `Local restore verified: ${counts.records} records, ${counts.attachments} attachment(s). Matched backup retained in ${backup}.`,
  );
} finally {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((done) => {
      if (server.exitCode !== null) {
        done();
      } else {
        server.once("exit", done);
      }
    });
  }
  if (created) {
    sql("formsoftware_dev", `DROP DATABASE "${database}" WITH (FORCE)`);
  }
}
