import { and, eq, gt } from 'drizzle-orm';
import { browserSessions } from '../../src/db/schema';
import type { createDbClient } from '../../src/db/client';
import { RequestError } from './http';

type Database = ReturnType<typeof createDbClient>;
const cookieName = (request: Request) => new URL(request.url).protocol === 'https:' ? '__Host-pirate-session' : 'pirate-session';

async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function checkOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new RequestError('Cross-origin request denied', 403);
}

export async function getBrowserSession(request: Request, db: Database) {
  const name = cookieName(request);
  const token = request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const hash = await tokenHash(token);
  return (await db.select().from(browserSessions).where(and(eq(browserSessions.tokenHash, hash),
    gt(browserSessions.expiresAt, new Date()))).limit(1))[0];
}

export async function ensureBrowserSession(request: Request, db: Database) {
  const existing = await getBrowserSession(request, db);
  if (existing) return { session: existing, cookie: undefined };
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const session = { tokenHash: await tokenHash(token), playerId: `player_${crypto.randomUUID()}`,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) };
  await db.insert(browserSessions).values(session);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { session, cookie: `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}` };
}
