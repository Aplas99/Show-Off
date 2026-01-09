export const ITEM_CONDITIONS = [
    "New",
    "Like New",
    "Good",
    "Used",
    "Poor",
] as const;

export type ItemCondition = (typeof ITEM_CONDITIONS)[number];
