import { useRouter } from "expo-router";
import React from "react";
import MembershipPanel from "./MembershipPanel";

/**
 * Full-screen membership route (`app/(tabs)/profile/membership`). The shared
 * UI lives in `MembershipPanel`, which is also presented as a bottom-sheet
 * cabinet from Settings. Deep links (e.g. CuratorGate upsells) still land here.
 */
export default function MembershipScreen() {
    const router = useRouter();
    return <MembershipPanel mode="screen" onClose={() => router.back()} />;
}
