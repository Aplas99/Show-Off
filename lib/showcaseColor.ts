function channels(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function brightness([red, green, blue]: [number, number, number]): number {
  return (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
}

/** Keep very dark custom colors visible against the showcase's dark surfaces. */
export function showcaseDisplayAccent(hex: string): string {
  const rgb = channels(hex);
  if (!rgb) return "#A77BFF";
  const current = brightness(rgb);
  if (current >= 0.3) return hex.toUpperCase();
  const blend = Math.min(0.58, (0.3 - current) * 1.8);
  return `#${rgb.map((channel) => Math.round(channel + (255 - channel) * blend).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function textOnAccent(hex: string): "#17121F" | "#FFFFFF" {
  const rgb = channels(hex);
  if (!rgb) return "#FFFFFF";
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? "#17121F" : "#FFFFFF";
}
