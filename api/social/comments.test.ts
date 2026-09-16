import { supabase } from "@/lib/supabase";
import { useCreateComment, useGetItemCommentCount } from "./comments";

let mockQueryFn: () => Promise<unknown>;
let mockSuccess: (_data: unknown, vars: { itemId: number }) => void;
const mockInvalidate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryFn: typeof mockQueryFn }) => { mockQueryFn = options.queryFn; return {}; },
  useMutation: (options: { onSuccess: typeof mockSuccess }) => { mockSuccess = options.onSuccess; return {}; },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));

describe("comment query error handling", () => {
  const eq = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }) } as unknown as ReturnType<typeof supabase.from>);
    useGetItemCommentCount({ itemId: 42 });
  });

  it("rejects failed counts rather than reporting a successful zero", async () => {
    eq.mockResolvedValue({ error: new Error("private backend details"), count: null });
    await expect(mockQueryFn()).rejects.toThrow("Could not load the comment count. Please try again.");
  });

  it("returns zero only for a successful empty result", async () => {
    eq.mockResolvedValue({ error: null, count: 0 });
    await expect(mockQueryFn()).resolves.toBe(0);
    expect(eq).toHaveBeenCalledWith("item_id", 42);
  });

  it("preserves actual counts", async () => {
    eq.mockResolvedValue({ error: null, count: 7 });
    await expect(mockQueryFn()).resolves.toBe(7);
  });

  it("refreshes the count as well as the thread after a successful comment", () => {
    useCreateComment();
    mockSuccess(undefined, { itemId: 42 });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["social", "comments", "count", 42] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["social", "comments", 42] });
  });
});
