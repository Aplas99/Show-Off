import { fetchCatalog } from "@/api/catalog";
import { setSearchSchema, cardsSchema, mapProduct } from "@/lib/tcgTrackingCatalog";
import type { PokemonTcgCard } from "@/lib/pokemonCatalog";
export interface TcgTrackingSearchInput { name: string; collection: string; number?: string; limit?: number }
function normalize(value: string) { return value.normalize("NFKD").replace(/[^a-z0-9]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase(); }
function collectorNumber(value?: string | null) { return value?.split(/[\/.]/, 1)[0].replace(/^0+(?=\d)/, "") || null; }
const fetchTracking = (path: string) => fetchCatalog({ provider: "tcgtracking", path });
export async function searchTcgTrackingPokemonCards(
  input: TcgTrackingSearchInput,
) {
  const name = normalize(input.name);
  const collection = input.collection.replace(/\s+/g, " ").trim();
  if (!name || !collection) return [];

  const setRaw = await fetchTracking(
    `/3/search?q=${encodeURIComponent(collection)}`,
  );
  const sets = setSearchSchema.parse(setRaw).sets.slice(0, 5);
  const requestedNumber = collectorNumber(input.number);
  const results: PokemonTcgCard[] = [];

  for (const candidateSet of sets) {
    const raw = await fetchTracking(
      `/3/sets/${candidateSet.id}/cards`,
    );
    const set = cardsSchema.parse(raw);
    for (const product of set.products) {
      const mapped = mapProduct(product, set);
      const mappedName = normalize(mapped.name);
      const nameMatches = mappedName.includes(name) || name.includes(mappedName);
      const numberMatches =
        !requestedNumber || collectorNumber(mapped.number) === requestedNumber;
      if (nameMatches && numberMatches) results.push(mapped);
      if (results.length >= (input.limit ?? 50)) return results;
    }
  }

  return results;
}
