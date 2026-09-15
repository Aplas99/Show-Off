import { canServeAds, createAdConsentController } from "./adEligibility";

it("withholds ads from minors, unknown ages, paid users, and unresolved membership", () => {
  expect(canServeAds(18, false, true)).toBe(true);
  for (const age of [null, undefined, 13, 17, NaN, "18"]) expect(canServeAds(age, false, true)).toBe(false);
  expect(canServeAds(30, true, true)).toBe(false);
  expect(canServeAds(30, undefined, true)).toBe(false);
  expect(canServeAds(30, false, false)).toBe(false);
});

function setup() {
  const dependencies = {
    eligible: jest.fn().mockResolvedValue(true),
    currentUser: jest.fn().mockReturnValue("adult"),
    gatherConsent: jest.fn().mockResolvedValue(true),
    configure: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
  };
  return { dependencies, controller: createAdConsentController(dependencies) };
}
it("never asks for consent or initializes SDK for ineligible users", async () => {
  const { controller, dependencies } = setup();
  dependencies.eligible.mockResolvedValue(false);
  expect(await controller.prepare("adult")).toBe(false);
  expect(dependencies.gatherConsent).not.toHaveBeenCalled();
  expect(dependencies.initialize).not.toHaveBeenCalled();
});
it("withholds initialization after consent denial or errors", async () => {
  const { controller, dependencies } = setup();
  dependencies.gatherConsent.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline"));
  expect(await controller.prepare("adult")).toBe(false);
  expect(await controller.prepare("adult")).toBe(false);
  expect(dependencies.initialize).not.toHaveBeenCalled();
});
it("serializes concurrent preparation and configures before initialization", async () => {
  const { controller, dependencies } = setup();
  expect(await Promise.all([controller.prepare("adult"), controller.prepare("adult")])).toEqual([true, true]);
  expect(dependencies.gatherConsent).toHaveBeenCalledTimes(1);
  expect(dependencies.initialize).toHaveBeenCalledTimes(1);
  expect(dependencies.configure.mock.invocationCallOrder[0]).toBeLessThan(dependencies.initialize.mock.invocationCallOrder[0]);
});
it("rechecks membership after consent and stops on an account switch", async () => {
  const { controller, dependencies } = setup();
  dependencies.eligible.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await controller.prepare("adult")).toBe(false);
  dependencies.currentUser.mockReturnValue("teen");
  expect(await controller.prepare("adult")).toBe(false);
  expect(dependencies.initialize).not.toHaveBeenCalled();
});
it("a privacy reset invalidates preparation already in progress", async () => {
  const { controller, dependencies } = setup();
  dependencies.gatherConsent.mockImplementationOnce(async () => { controller.reset(); return true; });
  expect(await controller.prepare("adult")).toBe(false);
  expect(dependencies.initialize).not.toHaveBeenCalled();
});
