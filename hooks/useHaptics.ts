import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Haptic feedback patterns for consistent UX across iOS and Android
 * Note: Android has limited haptic support but expo-haptics provides fallbacks
 */
export const useHaptics = () => {
    /**
     * Light impact - for subtle feedback like button presses
     */
    const light = async () => {
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {
            // Silently fail on unsupported devices
        }
    };

    /**
     * Medium impact - for moderate feedback like selections
     */
    const medium = async () => {
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
            // Silently fail on unsupported devices
        }
    };

    /**
     * Heavy impact - for strong feedback like confirmations
     */
    const heavy = async () => {
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } catch {
            // Silently fail on unsupported devices
        }
    };

    /**
     * Success notification - for successful operations
     */
    const success = async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
            // Silently fail on unsupported devices
        }
    };

    /**
     * Error notification - for errors or failures
     */
    const error = async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
            // Silently fail on unsupported devices
        }
    };

    /**
     * Warning notification - for warnings or cautions
     */
    const warning = async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {
            // Silently fail on unsupported devices
        }
    };

    /**
     * Selection feedback - for picker/selector interactions
     */
    const selection = async () => {
        try {
            await Haptics.selectionAsync();
        } catch {
            // Silently fail on unsupported devices
        }
    };

    /**
     * Custom vibration pattern for Android (fallback)
     */
    const vibrate = async (pattern: number[] = [50]) => {
        if (Platform.OS === "android") {
            try {
                // Use Haptics as it provides better Android support than Vibration API
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch {
                // Silently fail
            }
        }
    };

    return {
        light,
        medium,
        heavy,
        success,
        error,
        warning,
        selection,
        vibrate,
    };
};
