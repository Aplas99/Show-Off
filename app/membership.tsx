import { Redirect } from "expo-router";

// Retain the old callback route without trusting a URL to prove payment.
export default function MembershipCallback() {
  return <Redirect href="/(tabs)/profile/membership" />;
}
