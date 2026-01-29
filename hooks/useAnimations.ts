import { useCallback } from "react";
import {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

export const SPRING_CONFIG = {
    damping: 15,
    stiffness: 150,
    mass: 1,
};

export const SPRING_CONFIG_BOUNCY = {
    damping: 12,
    stiffness: 200,
    mass: 0.8,
};

/**
 * Hook for press animations (scale down on press)
 */
export const usePressAnimation = (scaleValue = 0.95) => {
    const scale = useSharedValue(1);

    const onPressIn = useCallback(() => {
        scale.value = withTiming(scaleValue, {
            duration: 100,
            easing: Easing.ease,
        });
    }, [scale, scaleValue]);

    const onPressOut = useCallback(() => {
        scale.value = withSpring(1, SPRING_CONFIG);
    }, [scale]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return { onPressIn, onPressOut, animatedStyle };
};

/**
 * Hook for fade-in animations
 */
export const useFadeIn = (delay = 0, duration = 300) => {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(20);

    const animate = useCallback(() => {
        opacity.value = withDelay(
            delay,
            withTiming(1, { duration, easing: Easing.ease })
        );
        translateY.value = withDelay(
            delay,
            withTiming(0, { duration, easing: Easing.ease })
        );
    }, [opacity, translateY, delay, duration]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return { animate, animatedStyle, opacity, translateY };
};

/**
 * Hook for staggered list item animations
 */
export const useStaggeredAnimation = (index: number, baseDelay = 50) => {
    const opacity = useSharedValue(0);
    const translateX = useSharedValue(-20);

    const delay = index * baseDelay;

    const animate = useCallback(() => {
        opacity.value = withDelay(
            delay,
            withTiming(1, { duration: 300, easing: Easing.ease })
        );
        translateX.value = withDelay(
            delay,
            withSpring(0, SPRING_CONFIG)
        );
    }, [opacity, translateX, delay]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: translateX.value }],
    }));

    return { animate, animatedStyle, opacity, translateX };
};

/**
 * Hook for progress bar animations
 */
export const useProgressAnimation = () => {
    const progress = useSharedValue(0);

    const animateTo = useCallback(
        (value: number, duration = 500) => {
            progress.value = withTiming(value, {
                duration,
                easing: Easing.bezier(0.4, 0, 0.2, 1),
            });
        },
        [progress]
    );

    const animatedStyle = useAnimatedStyle(() => ({
        width: `${progress.value}%`,
    }));

    return { progress, animateTo, animatedStyle };
};

/**
 * Hook for step indicator animations (progress dots)
 */
export const useStepAnimation = (isActive: boolean) => {
    const scale = useSharedValue(isActive ? 1.2 : 1);
    const opacity = useSharedValue(isActive ? 1 : 0.5);

    const animate = useCallback(() => {
        if (isActive) {
            scale.value = withSequence(
                withTiming(1.4, { duration: 150 }),
                withSpring(1.2, SPRING_CONFIG_BOUNCY)
            );
            opacity.value = withTiming(1, { duration: 200 });
        } else {
            scale.value = withTiming(1, { duration: 200 });
            opacity.value = withTiming(0.5, { duration: 200 });
        }
    }, [isActive, scale, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return { animate, animatedStyle, scale, opacity };
};

/**
 * Hook for pulse animation (loading, attention)
 */
export const usePulseAnimation = (minScale = 0.95, maxScale = 1.05) => {
    const scale = useSharedValue(1);

    const start = useCallback(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(maxScale, { duration: 600, easing: Easing.ease }),
                withTiming(minScale, { duration: 600, easing: Easing.ease })
            ),
            -1,
            true
        );
    }, [scale, minScale, maxScale]);

    const stop = useCallback(() => {
        scale.value = withTiming(1, { duration: 200 });
    }, [scale]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return { start, stop, animatedStyle, scale };
};

/**
 * Hook for shake animation (error feedback)
 */
export const useShakeAnimation = () => {
    const translateX = useSharedValue(0);

    const shake = useCallback(() => {
        translateX.value = withSequence(
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(0, { duration: 50 })
        );
    }, [translateX]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return { shake, animatedStyle, translateX };
};

/**
 * Hook for checkmark/success animation
 */
export const useCheckAnimation = () => {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);

    const animate = useCallback(() => {
        scale.value = withSequence(
            withTiming(0, { duration: 0 }),
            withDelay(
                100,
                withSpring(1.2, SPRING_CONFIG_BOUNCY)
            ),
            withTiming(1, { duration: 200 })
        );
        opacity.value = withDelay(
            100,
            withTiming(1, { duration: 200 })
        );
    }, [scale, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return { animate, animatedStyle, scale, opacity };
};
