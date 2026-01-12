import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthInitializer from "./providers/AuthInitializer";
import QueryProvider from "./providers/QueryProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthInitializer>
          <Stack />
        </AuthInitializer>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
