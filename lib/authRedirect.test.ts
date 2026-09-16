import { authRedirectUrl, createAuthCodeExchanger, readAuthCode } from "./authRedirect";

describe("auth redirects", () => {
  it("maps native and web routes without redirecting off-origin", () => {
    expect(authRedirectUrl("auth/callback")).toBe("showoff:///auth/callback");
    expect(authRedirectUrl("reset-password", "https://test.example/path")).toBe("https://test.example/reset-password");
    expect(authRedirectUrl("auth/callback", "http://localhost:8081")).toBe("http://localhost:8081/auth/callback");
    expect(() => authRedirectUrl("auth/callback", "http://test.example")).toThrow("secure");
  });
  it("does not display provider error details or accept missing codes", () => {
    expect(() => readAuthCode("showoff:///auth/callback?error_description=secret")).toThrow("Sign-in could not finish");
    expect(() => readAuthCode("showoff:///auth/callback")).toThrow("missing its code");
  });
  it("exchanges each code once across callback delivery paths", async () => {
    const exchange = jest.fn().mockResolvedValue({ session: true });
    const complete = createAuthCodeExchanger(exchange);
    await Promise.all([complete("showoff:///auth/callback?code=abc"), complete("https://test.example/auth/callback?code=abc")]);
    expect(exchange).toHaveBeenCalledTimes(1);
    await complete("showoff:///auth/callback?code=def");
    expect(exchange).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed callbacks asynchronously so the route can display recovery", async () => {
    const exchange = jest.fn();
    await expect(createAuthCodeExchanger(exchange)("showoff:///auth/callback")).rejects.toThrow("missing its code");
    expect(exchange).not.toHaveBeenCalled();
  });
});
