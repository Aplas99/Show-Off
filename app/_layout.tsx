import { Stack } from "expo-router";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthInitializer from "./providers/AuthInitializer";
import QueryProvider from "./providers/QueryProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <QueryProvider>
          <AuthInitializer>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthInitializer>
        </QueryProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
