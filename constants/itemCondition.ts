export const ITEM_CONDITIONS = [
    "New",
    "New in box",
    "Excellent",
    "Good",
    "Acceptable",
] as const;

export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
    "New": "New",
    "New in box": "New in box",
    "Excellent": "Excellent",
    "Good": "Good",
    "Acceptable": "Acceptable",
};
