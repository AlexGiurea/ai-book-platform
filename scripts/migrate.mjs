import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

async function loadLocalEnv() {
  try {
    const env = await readFile(resolve(".env.local"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed
        .slice(index + 1)
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
      process.env[key] = value;
    }
  } catch {
    // .env.local is optional outside local development.
  }
}

await loadLocalEnv();

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const sql = neon(connectionString);
const schema = await readFile(resolve("db/schema.sql"), "utf8");

for (const statement of schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((item) => item.trim())
  .filter(Boolean)) {
  await sql.query(statement);
}

console.log("Database schema is up to date.");
