export function canServeAds(age: unknown, paid: boolean | undefined, enabled: boolean): boolean {
  return enabled && typeof age === "number" && Number.isFinite(age) && age >= 18 && paid === false;
}

export interface AdConsentDependencies {
  eligible: (userId: string) => Promise<boolean>;
  currentUser: () => string | undefined;
  gatherConsent: () => Promise<boolean>;
  configure: () => Promise<void>;
  initialize: () => Promise<unknown>;
}

export function createAdConsentController(deps: AdConsentDependencies) {
  let queue: Promise<unknown> = Promise.resolve();
  let initialized = false;
  let consentUser: string | undefined;
  let revision = 0;
  return {
    reset() { consentUser = undefined; revision += 1; },
    prepare(userId: string): Promise<boolean> {
      const expectedRevision = revision;
      const current = () => deps.currentUser() === userId && expectedRevision === revision;
      const operation = queue.then(async () => {
        if (!current() || !await deps.eligible(userId) || !current()) return false;
        if (consentUser !== userId) {
          if (!await deps.gatherConsent() || !current()) return false;
          consentUser = userId;
        }
        if (!await deps.eligible(userId) || !current()) return false;
        await deps.configure();
        if (!current()) return false;
        if (!initialized) {
          await deps.initialize();
          initialized = true;
        }
        return current();
      }).catch(() => false);
      queue = operation;
      return operation;
    },
  };
}
