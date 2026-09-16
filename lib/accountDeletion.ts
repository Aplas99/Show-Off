export type StorageEntry = { name: string; id: string | null };

export interface AccountDeletionDependencies {
  beginDeletion(userId: string): Promise<void>;
  listFiles(bucket: string, prefix: string, offset: number, limit: number): Promise<StorageEntry[]>;
  removeFiles(bucket: string, paths: string[]): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
}

// Retain authentication until storage cleanup succeeds, allowing retries after
// partial failure. Auth deletion cascades database rows atomically through FKs.
export async function deleteAccountData(userId: string, deps: AccountDeletionDependencies) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("Invalid account identifier.");
  }
  await deps.beginDeletion(userId);
  for (const bucket of ["item-images", "post-media"]) {
    const folders = [userId];
    let visited = 0;
    while (folders.length) {
      const prefix = folders.pop()!;
      const paths: string[] = [];
      // Removing files while paginating with offsets shifts later pages.
      for (let offset = 0; ; offset += 1000) {
        if (++visited > 10000) throw new Error("Storage cleanup requires operator assistance.");
        const entries = await deps.listFiles(bucket, prefix, offset, 1000);
        for (const entry of entries) {
          if (!entry.name || entry.name === "." || entry.name === ".." || /[\\/]/.test(entry.name)) {
            throw new Error("Invalid storage entry.");
          }
          const path = `${prefix}/${entry.name}`;
          if (entry.id === null) folders.push(path);
          else paths.push(path);
        }
        if (entries.length < 1000) break;
      }
      for (let offset = 0; offset < paths.length; offset += 100) {
        await deps.removeFiles(bucket, paths.slice(offset, offset + 100));
      }
    }
  }
  await deps.deleteAuthUser(userId);
}
