import type { CreateItemPayload } from "@/lib/createItemValidation";
import { resolveProductForItem } from "@/api/products";
import { supabase } from "@/lib/supabase";
import { useCreateItemWithProductLookup } from "./index";

let mockMutation: (payload: CreateItemPayload) => Promise<unknown>;
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: (options: { mutationFn: typeof mockMutation }) => {
    mockMutation = options.mutationFn;
    return {};
  },
}));
jest.mock("@/api/products", () => ({ resolveProductForItem: jest.fn() }));
jest.mock("@/api/storage", () => ({ uploadImageToSupabase: jest.fn() }));
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));

describe("item creation after catalog write lockdown", () => {
  const insert = jest.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 7 }, error: null }) }) }));
  const payload: CreateItemPayload = {
    searchQuery: "12345678", condition: "Good", forSale: false,
    productData: { title: "Selected book", ean: "12345678", brand: "Publisher", images: ["https://example.com/book.jpg"] },
  };
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: "owner" } }, error: null } as Awaited<ReturnType<typeof supabase.auth.getUser>>);
    jest.mocked(supabase.from).mockReturnValue({ insert } as unknown as ReturnType<typeof supabase.from>);
    useCreateItemWithProductLookup();
  });

  it("keeps uncached selected details on the personal item without a verified label", async () => {
    jest.mocked(resolveProductForItem).mockResolvedValue({ product: payload.productData, productEan: null });
    await mockMutation(payload);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith("items");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "owner", product_ean: null, is_verified: false,
      custom_title: "Selected book", custom_brand: "Publisher", image_url: "https://example.com/book.jpg",
    }));
  });

  it("links server-persisted products without writing selected metadata", async () => {
    jest.mocked(resolveProductForItem).mockResolvedValue({ product: payload.productData, productEan: "12345678" });
    await mockMutation(payload);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ product_ean: "12345678", is_verified: true, custom_title: null }));
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("requires a title instead of silently creating an empty item after no match", async () => {
    jest.mocked(resolveProductForItem).mockResolvedValue({ product: undefined, productEan: null });
    await expect(mockMutation({ ...payload, productData: undefined })).rejects.toThrow("Add a title");
    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps manual creation available during a provider failure", async () => {
    jest.mocked(resolveProductForItem).mockRejectedValue(new Error("Provider unavailable"));
    await mockMutation({ ...payload, customTitle: "My book" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ custom_title: "My book", is_verified: false }));
  });
});
