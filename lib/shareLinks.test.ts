import { buildShowcaseShareUrl, normalizeSiteOrigin } from "@/lib/shareLinks";

// Hoisted above the import by Jest.
jest.mock("react-native", () => ({ Platform: { OS: "ios" }, Share: { share: jest.fn() } }));

describe("normalizeSiteOrigin", () => {
  it("keeps only the https origin", () => {
    expect(normalizeSiteOrigin("https://showoff.example/")).toBe("https://showoff.example");
    expect(normalizeSiteOrigin(" https://showoff.example/some/path ")).toBe("https://showoff.example");
  });

  it("rejects missing, insecure, or credentialed values", () => {
    expect(normalizeSiteOrigin(undefined)).toBeNull();
    expect(normalizeSiteOrigin("")).toBeNull();
    expect(normalizeSiteOrigin("http://showoff.example")).toBeNull();
    expect(normalizeSiteOrigin("https://user:pw@showoff.example")).toBeNull();
    expect(normalizeSiteOrigin("not a url")).toBeNull();
  });
});

describe("buildShowcaseShareUrl", () => {
  it("links to the public web page when a site is configured", () => {
    expect(buildShowcaseShareUrl("3d5c2b2d-a995", "https://showoff.example"))
      .toBe("https://showoff.example/s/3d5c2b2d-a995");
  });

  it("falls back to the app scheme only without a site", () => {
    expect(buildShowcaseShareUrl("abc", null)).toBe("showoff:///s/abc");
  });

  it("encodes the id", () => {
    expect(buildShowcaseShareUrl("a/b", "https://showoff.example")).toBe("https://showoff.example/s/a%2Fb");
  });
});
