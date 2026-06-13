import { createDatabaseClient } from "../db/client.js";
import { appBlobs } from "../db/schema.js";
import { BlobStore } from "./blob-store.js";
import { eq } from "drizzle-orm";

export class PostgresBlobStore implements BlobStore {
  private readonly client;

  constructor(connectionString: string) {
    this.client = createDatabaseClient(connectionString);
  }

  async putJson<T>(key: string, value: T): Promise<void> {
    await this.client.db
      .insert(appBlobs)
      .values({
        key,
        valueJson: value as object,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: appBlobs.key,
        set: {
          valueJson: value as object,
          updatedAt: new Date()
        }
      });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const row = await this.client.db.query.appBlobs.findFirst({
      where: eq(appBlobs.key, key)
    });
    return row ? (row.valueJson as T) : null;
  }
}
