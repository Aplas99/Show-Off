import { deleteAccountData, type AccountDeletionDependencies } from "./accountDeletion";

const userId = "11111111-1111-1111-1111-111111111111";
function dependencies(): jest.Mocked<AccountDeletionDependencies> {
  return {
    beginDeletion: jest.fn().mockResolvedValue(undefined),
    listFiles: jest.fn().mockResolvedValue([]),
    removeFiles: jest.fn().mockResolvedValue(undefined),
    deleteAuthUser: jest.fn().mockResolvedValue(undefined),
  };
}

describe("account deletion", () => {
  it("cleans more than 1000 files and nested folders in both buckets before auth deletion", async () => {
    const deps = dependencies();
    deps.listFiles.mockImplementation(async (bucket, prefix, offset) => {
      if (bucket === "item-images" && prefix === userId) {
        return offset === 0
          ? Array.from({ length: 1000 }, (_, i) => ({ id: String(i), name: `${i}.jpg` }))
          : [{ id: "1000", name: "last.jpg" }, { id: null, name: "nested" }];
      }
      return prefix.endsWith("nested") || bucket === "post-media"
        ? [{ id: "media", name: "photo.jpg" }] : [];
    });
    await deleteAccountData(userId, deps);
    expect(deps.removeFiles.mock.calls.flatMap(([, paths]) => paths)).toHaveLength(1003);
    expect(deps.removeFiles).toHaveBeenCalledWith("item-images", [`${userId}/nested/photo.jpg`]);
    expect(deps.removeFiles).toHaveBeenCalledWith("post-media", [`${userId}/photo.jpg`]);
    expect(deps.deleteAuthUser.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...deps.removeFiles.mock.invocationCallOrder),
    );
  });
  it.each(["beginDeletion", "listFiles", "removeFiles"] as const)("retains authentication after %s fails", async (operation) => {
    const deps = dependencies();
    deps.listFiles.mockResolvedValue([{ id: "file", name: "photo.jpg" }]);
    deps[operation].mockRejectedValue(new Error("Unavailable"));
    await expect(deleteAccountData(userId, deps)).rejects.toThrow("Unavailable");
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });
  it("surfaces failed database/auth cascade instead of reporting success", async () => {
    const deps = dependencies();
    deps.deleteAuthUser.mockRejectedValue(new Error("Foreign key failure"));
    await expect(deleteAccountData(userId, deps)).rejects.toThrow("Foreign key failure");
  });
  it("rejects paths outside the user's folder", async () => {
    const deps = dependencies();
    deps.listFiles.mockResolvedValue([{ id: "file", name: "../other.jpg" }]);
    await expect(deleteAccountData(userId, deps)).rejects.toThrow("Invalid storage entry");
    expect(deps.removeFiles).not.toHaveBeenCalled();
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });
});
