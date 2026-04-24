import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cachedSql: NeonQueryFunction<false, false> | null = null;

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function getSql(): NeonQueryFunction<false, false> {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add a Neon Postgres connection string before using persistent storage."
    );
  }
  if (!cachedSql) {
    cachedSql = neon(connectionString);
  }
  return cachedSql;
}
