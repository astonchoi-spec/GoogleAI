import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import path from "path";
import { InsertUser, users, apiSettings, InsertApiSetting } from "../drizzle/schema";
import { encrypt, decrypt } from './_core/encryption';

const DB_PATH = `file:${path.resolve("./data/chat.db")}`;

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const client = createClient({ url: DB_PATH });
    _db = drizzle(client);
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = getDb();

  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? "user",
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: {
        name: values.name,
        email: values.email,
        loginMethod: values.loginMethod,
        lastSignedIn: values.lastSignedIn,
        updatedAt: new Date(),
      },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function saveApiSetting(
  userId: number,
  provider: string,
  apiKey: string
): Promise<void> {
  const db = getDb();
  const encryptedKey = encrypt(apiKey);

  await db
    .insert(apiSettings)
    .values({ userId, provider, apiKey: encryptedKey, isActive: 1 })
    .onConflictDoUpdate({
      target: [apiSettings.userId, apiSettings.provider],
      set: { apiKey: encryptedKey, updatedAt: new Date() },
    });
}

export async function getApiSettings(userId: number) {
  try {
    const db = getDb();
    return await db.select().from(apiSettings).where(eq(apiSettings.userId, userId));
  } catch {
    return [];
  }
}

export async function getApiSetting(userId: number, provider: string) {
  try {
    const db = getDb();
    const results = await db
      .select()
      .from(apiSettings)
      .where(and(eq(apiSettings.userId, userId), eq(apiSettings.provider, provider)))
      .limit(1);

    if (results.length > 0) {
      return { ...results[0], apiKey: decrypt(results[0].apiKey) };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getDecryptedApiSettings(userId: number) {
  try {
    const db = getDb();
    const results = await db.select().from(apiSettings).where(eq(apiSettings.userId, userId));
    const decryptedSettings: Record<string, string> = {};
    results.forEach((setting) => {
      if (setting.isActive === 1) {
        try {
          decryptedSettings[setting.provider] = decrypt(setting.apiKey);
        } catch {}
      }
    });
    return decryptedSettings;
  } catch {
    return {};
  }
}

export async function deleteApiSetting(userId: number, provider: string): Promise<void> {
  const db = getDb();
  await db
    .delete(apiSettings)
    .where(and(eq(apiSettings.userId, userId), eq(apiSettings.provider, provider)));
}
