import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthInitializer from "./providers/AuthInitializer";
import QueryProvider from "./providers/QueryProvider";
import ThemeProvider from "./providers/ThemeProvider";

/**
 * Catches render errors anywhere in the app so users get a recovery
 * screen instead of a white screen. Deliberately avoids theme/store hooks —
 * they may be the thing that crashed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={errorStyles.container}>
      <Text style={errorStyles.title}>Something went wrong</Text>
      <Text style={errorStyles.message}>
        {error?.message ?? "An unexpected error occurred."}
      </Text>
      <TouchableOpacity
        style={errorStyles.button}
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={errorStyles.buttonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0e0e0e",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#adaaaa",
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#9B7BFF",
    borderRadius: 24,
    paddingHorizontal: 32,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <ThemeProvider>
          <QueryProvider>
            <AuthInitializer>
              <Stack screenOptions={{ headerShown: false }} />
            </AuthInitializer>
          </QueryProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
