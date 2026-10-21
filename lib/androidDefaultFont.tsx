/**
 * Android OEMs (OnePlus, OPPO, Xiaomi, some Samsung) replace the default
 * system font. React Native measures unstyled text with one face and draws
 * it with another, so labels lose their last letters or wrapped lines get
 * clipped. Giving every Text/TextInput an explicit system family keeps
 * measuring and drawing in sync.
 *
 * React 19 dropped defaultProps for function components, so this replaces
 * the `Text`/`TextInput` getters on the `react-native` index (plain,
 * configurable object-literal getters, read at every JSX use) with thin
 * wrappers. Internal RN modules that import Text by path are unaffected.
 * It must run before anything renders — the app entry (index.ts) imports it first.
 */
import React, { useContext } from "react";
import { Platform, StyleSheet } from "react-native";

type StyledComponent = React.ComponentType<{ style?: unknown }> & Record<string, unknown>;

const base = StyleSheet.create({ font: { fontFamily: "sans-serif" } });
const NeverInsideText = React.createContext<unknown>(false);

function withDefaultFont(Original: StyledComponent, skipInsideText: React.Context<unknown> = NeverInsideText) {
  function WithDefaultFont(props: { style?: unknown }) {
    // Nested Text inherits its parent's font; only set it on the outermost.
    const insideText = !!useContext(skipInsideText);
    return <Original {...props} style={insideText ? props.style : [base.font, props.style]} />;
  }
  // Keep statics such as TextInput.State.
  Object.assign(WithDefaultFont, Original);
  WithDefaultFont.displayName = Original.displayName ?? Original.name;
  return WithDefaultFont;
}

if (Platform.OS === "android") {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactNative = require("react-native") as Record<string, StyledComponent>;
  const TextAncestor = require("react-native/Libraries/Text/TextAncestor").default as React.Context<unknown>;
  /* eslint-enable @typescript-eslint/no-require-imports */
  const patched = {
    Text: withDefaultFont(ReactNative.Text, TextAncestor),
    TextInput: withDefaultFont(ReactNative.TextInput),
  };
  for (const [name, component] of Object.entries(patched)) {
    Object.defineProperty(ReactNative, name, { configurable: true, enumerable: true, value: component });
  }
}
