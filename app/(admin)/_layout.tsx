import { useModeratorAccess } from "@/api/safety";
import { Redirect, Slot } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

export default function AdminLayout() {
  const access = useModeratorAccess();
  if (access.isLoading) return <ActivityIndicator />;
  if (access.isError) return <View><Text onPress={() => void access.refetch()}>Moderator access could not be checked. Tap to retry.</Text></View>;
  return access.data ? <Slot /> : <Redirect href="/(tabs)/discover" />;
}
