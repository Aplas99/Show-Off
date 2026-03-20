# Design System: The Digital Curator

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

This system is built for an audience that values rarity, aesthetics, and the thrill of the "find." We are moving away from the generic "utility" look of typical social feeds. Instead, we are creating a premium, editorial experience where every collection item feels like it’s being displayed in a high-end, private gallery. 

By leveraging **intentional asymmetry**, high-contrast typography, and a deep, atmospheric color palette, we break the traditional "grid-of-squares" template. This system prioritizes visual depth and "breathing room," ensuring that the user's high-quality imagery remains the undisputed hero of the experience.

---

## 2. Colors
Our palette is rooted in a "Dark Mode First" philosophy, using deep blacks and rich grays to create a canvas that recedes, allowing the vibrant collector items to pop.

### Primary Palette
- **Background (`#0e0e0e`):** The foundation. A deep, obsidian black that eliminates screen glare and focuses the eye.
- **Primary (`#c899ff`):** A vibrant, electric purple used exclusively for high-priority actions and brand moments.
- **On-Surface (`#ffffff`):** Pure white for maximum readability and high-contrast headlines.

### The "No-Line" Rule
Traditional 1px borders are strictly prohibited for sectioning. They feel "cheap" and digital. Boundaries must be defined solely through:
1.  **Background Color Shifts:** Placing a `surface-container-low` (`#131313`) card against a `surface` (`#0e0e0e`) background.
2.  **Tonal Transitions:** Using subtle shifts in the Material surface tiers to distinguish between a header, a body, and a footer.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of smoked glass. 
- **Deepest:** `surface-container-lowest` (`#000000`) for secondary background areas.
- **Base:** `surface` (`#0e0e0e`).
- **Elevated:** `surface-container-high` (`#20201f`) for interactive cards and overlays.

### The "Glass & Gradient" Rule
For floating elements (like bottom navigation or modal headers), use **Glassmorphism**. Apply a semi-transparent version of `surface-variant` with a 20px backdrop-blur. For main CTAs, use a subtle linear gradient from `primary` (`#c899ff`) to `primary-container` (`#be87ff`) at a 135-degree angle to add "soul" and dimension.

---

## 3. Typography
We utilize a dual-font strategy to balance editorial authority with functional clarity.

- **Display & Headline (Manrope):** Chosen for its modern, geometric construction. Use `display-lg` (3.5rem) for hero moments and `headline-lg` (2rem) for section titles. These should always be **bold** and have tight letter-spacing (-0.02em) to feel premium.
- **Body & Label (Inter):** The workhorse. Inter provides exceptional legibility at small sizes. Use `body-md` (0.875rem) for descriptions and `label-md` (0.75rem) for metadata.

The hierarchy is "Top-Heavy": Large, bold headlines should be paired with significantly smaller, well-spaced body text to create an "Editorial Boutique" feel.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering**, not structural lines.

- **The Layering Principle:** Instead of shadows for everything, stack tiers. A `surface-container-highest` card sitting on a `surface-container` background creates an immediate sense of lift.
- **Ambient Shadows:** When a card needs to "float" (e.g., a carousel item), use an extra-diffused shadow: `Offset: 0, 12px | Blur: 32px | Color: rgba(0,0,0, 0.4)`. The shadow should feel like a soft glow of darkness, never a sharp line.
- **The "Ghost Border" Fallback:** If accessibility requires a stroke, use `outline-variant` (`#484847`) at **15% opacity**. This creates a "suggestion" of an edge rather than a hard boundary.
- **Glassmorphism:** Use for persistent elements (Top Bars/Bottom Nav) to allow the rich imagery of the feed to bleed through the UI, making the app feel like a single, unified environment.

---

## 5. Components

### Buttons
- **Primary:** Rounded-pill (`full`), `primary` background, `on-primary-fixed` (black) text. Use the subtle purple-to-purple-container gradient.
- **Secondary:** Transparent background with a `Ghost Border` and white text.
- **Tertiary:** No background or border. `primary` colored text.

### Cards (The Collector’s Frame)
Cards should utilize `xl` (1.5rem) corner radius. Use `surface-container-high` as the base. Forbid dividers; use `spacing-6` (2rem) to separate the title from the description.

### Input Fields
Avoid "box" styles. Use a `surface-container-lowest` background with a bottom-only `Ghost Border`. When focused, the border transitions to a 1px `primary` solid line.

### High-End Carousel (Inspired by Image 2)
Carousel items should use a "Focus Scale" pattern: the center item is at 100% scale with a subtle `white` ghost border, while off-screen items are scaled to 90% and slightly desaturated.

---

## 6. Do’s and Don’ts

### Do:
- **Use Intentional Asymmetry:** Offset images or text blocks to create a custom, "magazine" layout.
- **Embrace White Space:** Use `spacing-10` and `spacing-12` liberally between sections to give items "room to breathe."
- **Apply Large Radii:** Stick to `xl` (1.5rem) for major cards to keep the tone "Premium Social."

### Don’t:
- **Never use 100% opaque 1px borders.** It breaks the immersive, dark-gallery aesthetic.
- **Don't use "Pure Grey" shadows.** Shadows should be deep blacks or very dark purples to maintain tonal richness.
- **Avoid standard grids.** If three items are in a row, consider making one larger than the others to emphasize a "Featured" piece.
- **Don't crowd the UI.** If an interface feels "busy," remove elements until only the image and the core action remain.