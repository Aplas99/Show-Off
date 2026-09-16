import { prepareWebUpload } from "./webUpload";

describe("browser uploads", () => {
  const readFile = jest.fn();
  beforeEach(() => readFile.mockReset());
  it.each(["blob:https://app.invalid/file", "data:image/png;base64,AAAA"])("reads %s using actual MIME and bytes", async uri => {
    readFile.mockResolvedValue(new Response(new Blob(["image"], { type: "image/png" })));
    const result = await prepareWebUpload(uri, 10, false, readFile);
    expect(result.extension).toBe("png");
    expect(result.contentType).toBe("image/png");
    expect(result.body.byteLength).toBe(5);
  });
  it("enforces actual file size regardless of picker metadata", async () => {
    readFile.mockResolvedValue(new Response(new Blob(["oversized"], { type: "image/png" })));
    await expect(prepareWebUpload("blob:file", 3, false, readFile)).rejects.toThrow("File too large");
  });
  it.each(["text/html", "video/mp4"])("rejects %s in image-only uploads", async type => {
    readFile.mockResolvedValue(new Response(new Blob(["file"], { type })));
    await expect(prepareWebUpload("blob:file", 10, false, readFile)).rejects.toThrow("Unsupported");
  });
  it("allows supported post videos", async () => {
    readFile.mockResolvedValue(new Response(new Blob(["video"], { type: "video/mp4" })));
    expect((await prepareWebUpload("blob:file", 10, true, readFile)).extension).toBe("mp4");
  });
  it("rejects remote URLs and empty or inaccessible picker files", async () => {
    await expect(prepareWebUpload("https://other.invalid/file.png", 10, false, readFile)).rejects.toThrow("select");
    expect(readFile).not.toHaveBeenCalled();
    readFile.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(prepareWebUpload("blob:file", 10, false, readFile)).rejects.toThrow("Could not read");
    readFile.mockResolvedValueOnce(new Response(new Blob([], { type: "image/png" })));
    await expect(prepareWebUpload("blob:file", 10, false, readFile)).rejects.toThrow("empty");
  });
});
