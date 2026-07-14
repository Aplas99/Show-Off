import { useCallback, useMemo, useReducer } from "react";

export type ShowcaseSortBy = "date" | "name" | "price";
export type ShowcaseSortOrder = "asc" | "desc";

interface ShowcaseFiltersState {
  sortBy: ShowcaseSortBy;
  sortOrder: ShowcaseSortOrder;
  selectedTypes: string[];
  selectedSetIds: string[];
}

type ShowcaseFiltersAction =
  | { type: "SET_SORT_BY"; sortBy: ShowcaseSortBy }
  | { type: "SET_SORT_ORDER"; sortOrder: ShowcaseSortOrder }
  | { type: "TOGGLE_TYPE"; value: string }
  | { type: "TOGGLE_SET"; value: string }
  | { type: "RESET" };

const INITIAL_STATE: ShowcaseFiltersState = {
  sortBy: "date",
  sortOrder: "desc",
  selectedTypes: [],
  selectedSetIds: [],
};

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

function reducer(
  state: ShowcaseFiltersState,
  action: ShowcaseFiltersAction,
): ShowcaseFiltersState {
  switch (action.type) {
    case "SET_SORT_BY":
      return { ...state, sortBy: action.sortBy };
    case "SET_SORT_ORDER":
      return { ...state, sortOrder: action.sortOrder };
    case "TOGGLE_TYPE":
      return {
        ...state,
        selectedTypes: toggleValue(state.selectedTypes, action.value),
      };
    case "TOGGLE_SET":
      return {
        ...state,
        selectedSetIds: toggleValue(state.selectedSetIds, action.value),
      };
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

/**
 * Screen-local filter/sort state for the showcase item list. Kept as a
 * reducer rather than a global store since it doesn't need to persist or
 * survive navigation — it resets whenever the screen is reopened.
 */
export function useShowcaseFilters() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const setSortBy = useCallback(
    (sortBy: ShowcaseSortBy) => dispatch({ type: "SET_SORT_BY", sortBy }),
    [],
  );
  const setSortOrder = useCallback(
    (sortOrder: ShowcaseSortOrder) =>
      dispatch({ type: "SET_SORT_ORDER", sortOrder }),
    [],
  );
  const toggleType = useCallback(
    (value: string) => dispatch({ type: "TOGGLE_TYPE", value }),
    [],
  );
  const toggleSet = useCallback(
    (value: string) => dispatch({ type: "TOGGLE_SET", value }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const activeFilterCount = useMemo(
    () => state.selectedTypes.length + state.selectedSetIds.length,
    [state.selectedTypes, state.selectedSetIds],
  );

  return {
    ...state,
    setSortBy,
    setSortOrder,
    toggleType,
    toggleSet,
    reset,
    activeFilterCount,
  };
}
