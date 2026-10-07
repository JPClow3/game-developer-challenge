import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Creates a Drizzle ORM client instance backed by Neon Serverless HTTP driver.
 * Compatible with Cloudflare Workers / Cloudflare Pages Functions environments.
 */
export function createDbClient(connectionString?: string) {
  const connStr = connectionString || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : undefined);
  if (!connStr) {
    throw new Error('DATABASE_URL is not set for Neon PostgreSQL connection');
  }
  const sql = neon(connStr);
  return drizzle(sql, { schema });
}
