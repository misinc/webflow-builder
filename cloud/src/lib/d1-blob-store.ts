import { eq } from "drizzle-orm";
import { appBlobsTable } from "../db/schema";
import { getDb } from "../db/getDb";
import type { BlobStore } from "@wfb/backend-core/blob/blob-store.js";

export class D1BlobStore implements BlobStore {
  constructor(private readonly locals: App.Locals) {}

  private get db() {
    return getDb(this.locals);
  }

  async putJson<T>(key: string, value: T): Promise<void> {
    await this.db
      .insert(appBlobsTable)
      .values({
        key,
        valueJson: JSON.stringify(value),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: appBlobsTable.key,
        set: {
          valueJson: JSON.stringify(value),
          updatedAt: new Date()
        }
      });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const row = await this.db.query.appBlobsTable.findFirst({
      where: eq(appBlobsTable.key, key)
    });
    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.valueJson) as T;
    } catch {
      return null;
    }
  }
}
