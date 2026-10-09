import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@workspace/db/schema";
export * from "@workspace/db/schema";
export const postgres = new PGlite();
export const db = drizzle(postgres, { schema });

// Only used by the isolated migration test. No network Pool or real credentials.
export const pool = {
  async connect() {
    return {
      async query(text: string, values?: unknown[]) {
        const result = await postgres.query(text, values);
        return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
      },
      release() {},
    };
  },
  async end() {},
};
