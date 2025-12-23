import { Stack } from "expo-router";
import AuthInitializer from "./providers/AuthInitializer";
import QueryProvider from "./providers/QueryProvider";

export default function RootLayout() {
  return (
    <QueryProvider>
      <AuthInitializer>
        <Stack />
      </AuthInitializer>
    </QueryProvider>
  );
}
