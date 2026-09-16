import { protectedMediaSource } from "./protectedMedia";
const base = "https://project.supabase.co";
describe("protected upload sources", () => {
  it("replaces public downloads with authenticated requests", () => {
    const source = protectedMediaSource(`${base}/storage/v1/object/public/item-images/user/photo.jpg`,base,"anon","user-token");
    expect(source?.uri).toBe(`${base}/storage/v1/object/authenticated/item-images/user/photo.jpg`);
    expect(source?.headers.Authorization).toBe("Bearer user-token");
    expect(source?.uri).not.toContain("user-token");
  });
  it.each(["https://evil.example/storage/v1/object/public/item-images/x", "https://project.supabase.co.evil.example/storage/v1/object/public/item-images/x", "https://evil@project.supabase.co/storage/v1/object/public/item-images/x", "file:///photo.jpg"])("never sends credentials to untrusted source %s", (uri) => {
    expect(protectedMediaSource(uri,base,"anon","user-token")).toBeNull();
  });
  it("uses only the public anon credential for signed-out viewers", () => {
    expect(protectedMediaSource(`${base}/storage/v1/object/public/post-media/u/v.mp4`,base,"anon")?.headers.Authorization).toBe("Bearer anon");
  });
});
