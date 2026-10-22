import { getItemCoverUrl, getItemImageUrls, hasUploadedItemPhoto, normalizeImageUrl } from "@/lib/itemImages";

describe("normalizeImageUrl", () => {
  it("upgrades insecure and protocol-relative URLs to https", () => {
    expect(normalizeImageUrl("http://images.upcitemdb.com/a.jpg")).toBe("https://images.upcitemdb.com/a.jpg");
    expect(normalizeImageUrl("//cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });

  it("keeps https and local picker URIs", () => {
    expect(normalizeImageUrl(" https://x.test/a.png ")).toBe("https://x.test/a.png");
    expect(normalizeImageUrl("file:///tmp/a.jpg")).toBe("file:///tmp/a.jpg");
  });

  it("rejects empty, non-string, and unsupported values", () => {
    expect(normalizeImageUrl("")).toBeNull();
    expect(normalizeImageUrl(null)).toBeNull();
    expect(normalizeImageUrl({ url: "https://x.test" })).toBeNull();
    expect(normalizeImageUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("hasUploadedItemPhoto", () => {
  const upload = "https://p.supabase.co/storage/v1/object/public/item-images/user/1.jpg";

  it("detects photos stored in the item-images bucket", () => {
    expect(hasUploadedItemPhoto({ image_url: upload })).toBe(true);
    expect(hasUploadedItemPhoto({ image_url: "", image_urls: [upload] })).toBe(true);
  });

  it("ignores catalog images copied into image_url", () => {
    expect(hasUploadedItemPhoto({ image_url: "https://images.upcitemdb.com/a.jpg" })).toBe(false);
    expect(hasUploadedItemPhoto({ image_url: "", image_urls: [] })).toBe(false);
    expect(hasUploadedItemPhoto(null)).toBe(false);
  });
});

describe("getItemImageUrls", () => {
  it("prefers the user's gallery and cover, de-duplicated", () => {
    expect(getItemImageUrls({
      image_url: "https://x.test/1.jpg",
      image_urls: ["https://x.test/1.jpg", "https://x.test/2.jpg"],
      products: { data: { images: ["https://catalog.test/c.jpg"] } },
    })).toEqual(["https://x.test/1.jpg", "https://x.test/2.jpg"]);
  });

  it("falls back to only the first catalog image when the item has no own photo", () => {
    expect(getItemImageUrls({
      image_url: "",
      image_urls: [],
      products: { data: { images: [42, "http://catalog.test/c.jpg", "https://catalog.test/d.jpg"] } },
    })).toEqual(["https://catalog.test/c.jpg"]);
    expect(getItemImageUrls({ products: { data: { images: [42] } } })).toEqual([]);
  });

  it("parses legacy string product data", () => {
    expect(getItemCoverUrl({
      products: { data: JSON.stringify({ images: ["https://catalog.test/c.jpg"] }) },
    })).toBe("https://catalog.test/c.jpg");
    expect(getItemImageUrls({ products: { data: "{not json" } })).toEqual([]);
  });

  it("returns nothing for missing items", () => {
    expect(getItemImageUrls(null)).toEqual([]);
    expect(getItemCoverUrl(undefined)).toBeNull();
  });
});
