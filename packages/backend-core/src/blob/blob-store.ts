export interface BlobStore {
  putJson<T>(key: string, value: T): Promise<void>;
  getJson<T>(key: string): Promise<T | null>;
}

export class MemoryBlobStore implements BlobStore {
  private readonly values = new Map<string, string>();

  async putJson<T>(key: string, value: T): Promise<void> {
    this.values.set(key, JSON.stringify(value));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = this.values.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
}
