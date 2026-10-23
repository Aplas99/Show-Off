import type { FeedPost } from "@/api/social/posts";

/** Sample posts that fill the Discover feed while real posting ramps up.
 * They are client-side only (negative ids, never written to Supabase), so
 * PostFeedCard keeps their likes/bookmarks local and skips comments and
 * reports. Images are the official card scans from the Pokémon TCG API and
 * Scryfall. Set EXPO_PUBLIC_DISCOVER_MOCK_POSTS=false to hide them. */
export const DISCOVER_MOCK_POSTS_ENABLED =
    process.env.EXPO_PUBLIC_DISCOVER_MOCK_POSTS !== "false";

const pokemonImage = (setId: string, number: string) =>
    `https://images.pokemontcg.io/${setId}/${number}_hires.png`;

interface MockPostSeed {
    username: string;
    caption: string;
    minutesAgo: number;
    likes: number;
    comments: number;
    images: string[];
    item: { title: string; subtitle: string };
}

const SEEDS: MockPostSeed[] = [
    {
        username: "holo_hunter",
        caption: "Finally pulled the Moonbreon 🌙 Evolving Skies has been brutal but it was worth every pack.",
        minutesAgo: 18,
        likes: 1284,
        comments: 96,
        images: [pokemonImage("swsh7", "215")],
        item: { title: "Umbreon VMAX", subtitle: "Evolving Skies" },
    },
    {
        username: "vintage_vault",
        caption: "Base Set holo trio, all raw and centered. Charizard came home first, Blastoise followed a decade later.",
        minutesAgo: 95,
        likes: 3412,
        comments: 241,
        images: [pokemonImage("base1", "4"), pokemonImage("base1", "2")],
        item: { title: "Charizard", subtitle: "Base" },
    },
    {
        username: "planeswalker.pat",
        caption: "The crown jewel of the binder. Vintage Masters Black Lotus — still can't believe it's mine.",
        minutesAgo: 60 * 4,
        likes: 2107,
        comments: 158,
        images: [
            "https://cards.scryfall.io/large/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg?1783939332",
        ],
        item: { title: "Black Lotus", subtitle: "Vintage Masters" },
    },
    {
        username: "sky_high_tcg",
        caption: "Rainbow Rayquaza + Gyarados VMAX. Evolving Skies dragons only showcase is officially started 🐉",
        minutesAgo: 60 * 9,
        likes: 876,
        comments: 54,
        images: [pokemonImage("swsh7", "218"), pokemonImage("swsh7", "29")],
        item: { title: "Rayquaza VMAX", subtitle: "Evolving Skies" },
    },
    {
        username: "kanto_kollector",
        caption: "151 Charizard ex SIR. The texture on this one in hand is unreal.",
        minutesAgo: 60 * 20,
        likes: 1950,
        comments: 112,
        images: [pokemonImage("sv3pt5", "199")],
        item: { title: "Charizard ex", subtitle: "151" },
    },
    {
        username: "ring_bearer",
        caption: "One Ring to rule them all. Tales of Middle-earth was the set that got me back into Magic.",
        minutesAgo: 60 * 30,
        likes: 642,
        comments: 37,
        images: [
            "https://cards.scryfall.io/large/front/d/5/d5806e68-1054-458e-866d-1f2470f682b2.jpg?1790212038",
        ],
        item: { title: "The One Ring", subtitle: "The Lord of the Rings: Tales of Middle-earth" },
    },
    {
        username: "neo_nostalgia",
        caption: "Neo Genesis Lugia. My childhood grail, finally in a slab-ready sleeve.",
        minutesAgo: 60 * 52,
        likes: 1533,
        comments: 89,
        images: [pokemonImage("neo1", "9")],
        item: { title: "Lugia", subtitle: "Neo Genesis" },
    },
    {
        username: "planeswalker.pat",
        caption: "Sheoldred keeps showing up in every deck I build. Had to give her a spot in the showcase.",
        minutesAgo: 60 * 75,
        likes: 498,
        comments: 22,
        images: [
            "https://cards.scryfall.io/large/front/d/6/d67be074-cdd4-41d9-ac89-0a0456c4e4b2.jpg?1783921327",
        ],
        item: { title: "Sheoldred, the Apocalypse", subtitle: "Dominaria United" },
    },
];

/** Builds the mock posts with timestamps relative to `now`, newest first. */
export function buildMockPosts(now: number = Date.now()): FeedPost[] {
    return SEEDS.map((seed, index) => {
        const id = -(index + 1);
        const userId = `mock-user-${seed.username}`;
        return {
            id,
            user_id: userId,
            item_id: null,
            caption: seed.caption,
            like_count: seed.likes,
            comment_count: seed.comments,
            created_at: new Date(now - seed.minutesAgo * 60_000).toISOString(),
            media: seed.images.map((url, position) => ({
                id: id * 100 - position,
                media_type: "image" as const,
                url,
                position,
            })),
            profile: {
                id: userId,
                username: seed.username,
                first_name: null,
                last_name: null,
                avatar_url: null,
            },
            item: {
                id,
                image_url: seed.images[0],
                title: seed.item.title,
                subtitle: seed.item.subtitle,
            },
            is_mock: true,
        };
    });
}
