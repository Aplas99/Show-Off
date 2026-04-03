import {
    useCreateComment,
    useGetItemComments,
    type Comment,
} from "@/api/social/comments";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useThemeStore } from "@/hooks/useThemeStore";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
    Easing,
    FadeInDown,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface CommentModalProps {
    visible: boolean;
    itemId: number;
    onClose: () => void;
}

export default function CommentModal({
    visible,
    itemId,
    onClose,
}: CommentModalProps) {
    const insets = useSafeAreaInsets();
    const { height: SCREEN_HEIGHT } = useWindowDimensions();
    const colors = useColors();
    const isDark = useThemeStore((s) => s.isDark);
    const styles = getStyles(colors, isDark);
    const androidTextBuffer = Platform.OS === "android" ? "\u00A0" : "";

    const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.85;
    const SWIPE_THRESHOLD = 100;

    const [commentText, setCommentText] = useState("");
    const { data: comments = [], isLoading, isError, error, refetch } = useGetItemComments({
        itemId,
        enabled: visible && !!itemId,
    });
    const createComment = useCreateComment();

    // Animation values
    const translateY = useSharedValue(SCREEN_HEIGHT);
    const opacity = useSharedValue(0);

    // Native keyboard tracking
    const { height: keyboardAnimatedHeight } = useReanimatedKeyboardAnimation();

    const OPEN_SPRING = { damping: 20, stiffness: 200, mass: 0.8 };
    const CLOSE_SPRING = { damping: 25, stiffness: 300, mass: 0.8 };

    useEffect(() => {
        if (visible) {
            translateY.value = withSpring(0, OPEN_SPRING);
            opacity.value = withTiming(1, { duration: 200 });
        } else {
            translateY.value = withTiming(SCREEN_HEIGHT, {
                duration: 250,
                easing: Easing.in(Easing.cubic),
            });
            opacity.value = withTiming(0, { duration: 200 });
        }
    }, [visible, SCREEN_HEIGHT]);

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
                opacity.value = 1 - (event.translationY / BOTTOM_SHEET_MAX_HEIGHT);
            }
        })
        .onEnd((event) => {
            if (event.translationY > SWIPE_THRESHOLD || event.velocityY > 500) {
                translateY.value = withTiming(SCREEN_HEIGHT, {
                    duration: 250,
                    easing: Easing.in(Easing.cubic),
                }, () => {
                    runOnJS(onClose)();
                });
                opacity.value = withTiming(0, { duration: 200 });
            } else {
                translateY.value = withSpring(0, CLOSE_SPRING);
                opacity.value = withSpring(1, CLOSE_SPRING);
            }
        });

    const bottomSheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const inputAnimatedStyle = useAnimatedStyle(() => {
        const kbHeight = Math.abs(keyboardAnimatedHeight.value);
        return {
            paddingBottom: kbHeight > 0 ? kbHeight + 12 : Math.max(insets.bottom + 12, 24),
        };
    });

    const handleClose = () => {
        Keyboard.dismiss();
        translateY.value = withTiming(SCREEN_HEIGHT, {
            duration: 250,
            easing: Easing.in(Easing.cubic),
        }, () => {
            runOnJS(onClose)();
        });
        opacity.value = withTiming(0, { duration: 200 });
    };

    const handleSubmit = async () => {
        if (!commentText.trim()) return;

        try {
            await createComment.mutateAsync({
                itemId,
                content: commentText.trim(),
            });
            setCommentText("");
        } catch (error) {
            console.error("Failed to create comment:", error);
        }
    };

    const renderComment = ({ item, index }: { item: Comment; index: number }) => {
        const username = item.profile?.username || "User";
        const dateObj = new Date(item.created_at);
        const day = dateObj.getDate();
        const month = dateObj.getMonth() + 1;
        const year = dateObj.getFullYear().toString().slice(-2);
        const dateLabel = `${day}/${month}/${year}`;
        return (
            <Animated.View
                entering={FadeInDown.delay(index * 50).springify()}
                style={styles.commentItem}
            >
                <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>
                        {username.charAt(0).toUpperCase()}
                    </Text>
                </View>
                <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                        <Text style={styles.username} numberOfLines={1}>{username}</Text>
                    </View>
                    <Text style={styles.commentTextContent}>{item.content}</Text>
                    <Text style={styles.timestampBelow}>{dateLabel}</Text>
                </View>
            </Animated.View>
        );
    };

    if (!visible && opacity.value === 0) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <GestureHandlerRootView style={styles.modalContainer}>
                {/* Backdrop */}
                <Animated.View style={[styles.backdrop, backdropStyle]}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={handleClose}
                    />
                </Animated.View>

                {/* Bottom Sheet */}
                <Animated.View
                    style={[
                        styles.bottomSheet,
                        bottomSheetStyle,
                        { height: BOTTOM_SHEET_MAX_HEIGHT },
                    ]}
                >
                    <GestureDetector gesture={panGesture}>
                        <View style={styles.dragHandleContainer}>
                            <View style={styles.dragHandle} />
                            <View style={styles.header}>
                                <Text style={styles.headerTitle}>Comments</Text>
                                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                                    <Ionicons name="close" size={24} color={colors.text} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </GestureDetector>

                    <View style={styles.commentsContainer}>
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                            </View>
                        ) : isError ? (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorTitle}>Couldn't load comments</Text>
                                <Text style={styles.errorSubtext}>
                                    {error instanceof Error ? error.message : "Please try again."}
                                </Text>
                                <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
                                    <Text style={styles.retryText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <FlatList
                                data={comments}
                                renderItem={renderComment}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={styles.commentsList}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="interactive"
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <Text style={styles.emptyStateText}>{`No comments yet${androidTextBuffer}`}</Text>
                                        <Text style={styles.emptyStateSubtext}>{`Be the first to comment!${androidTextBuffer}`}</Text>
                                    </View>
                                }
                            />
                        )}
                    </View>

                    <Animated.View style={[styles.inputContainer, inputAnimatedStyle]}>
                        <TextInput
                            style={styles.input}
                            placeholder={`Add a comment...${androidTextBuffer}`}
                            placeholderTextColor={colors.grey}
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline
                            maxLength={500}
                            returnKeyType="send"
                            onSubmitEditing={handleSubmit}
                            underlineColorAndroid="transparent"
                        />
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={!commentText.trim() || createComment.isPending}
                            style={[
                                styles.submitButton,
                                (!commentText.trim() || createComment.isPending) && styles.submitButtonDisabled
                            ]}
                        >
                            {createComment.isPending ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Ionicons name="arrow-up" size={24} color="#FFF" />
                            )}
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
    modalContainer: {
        flex: 1,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.overlay,
    },
    bottomSheet: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: isDark ? "#16181D" : colors.card,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: "hidden",
    },
    dragHandleContainer: {
        paddingTop: 12,
        backgroundColor: isDark ? "#16181D" : colors.card,
    },
    dragHandle: {
        width: 36,
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 2,
        alignSelf: "center",
        marginBottom: 8,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
    },
    closeButton: {
        padding: 4,
    },
    commentsContainer: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
        gap: 8,
    },
    errorTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
    },
    errorSubtext: {
        color: colors.textDim,
        fontSize: 13,
        textAlign: "center",
        lineHeight: 18,
    },
    retryButton: {
        marginTop: 4,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: colors.primary,
    },
    retryText: {
        color: "#FFF",
        fontWeight: "700",
    },
    commentsList: {
        padding: 20,
    },
    commentItem: {
        flexDirection: "row",
        marginBottom: 20,
    },
    avatarContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    avatarText: {
        color: "#FFF",
        fontSize: 14,
        fontWeight: "700",
    },
    commentContent: {
        flex: 1,
    },
    commentHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
        gap: 8,
    },
    username: {
        color: colors.grey,
        fontSize: 13,
        fontWeight: "600",
        flexShrink: 1,
    },
    timestampBelow: {
        color: colors.textDim,
        fontSize: 11,
        lineHeight: 16,
        marginTop: 6,
        paddingBottom: 4,
    },
    commentTextContent: {
        color: isDark ? "#EEE" : colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: isDark ? "#1B1E26" : colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    input: {
        flex: 1,
        minWidth: 0,
        backgroundColor: colors.inputBg,
        borderRadius: 20,
        paddingLeft: 16,
        paddingRight: Platform.OS === "android" ? 28 : 16,
        paddingVertical: 10,
        color: colors.text,
        fontSize: 15,
        lineHeight: 20,
        maxHeight: 100,
        marginRight: 12,
        ...(Platform.OS === "android" ? { fontFamily: "sans-serif" } : null),
    },
    submitButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.primary,
        justifyContent: "center",
        alignItems: "center",
    },
    submitButtonDisabled: {
        backgroundColor: colors.border,
        opacity: 0.5,
    },
    emptyState: {
        paddingVertical: 60,
        paddingHorizontal: 24,
        alignSelf: "stretch",
        alignItems: "center",
    },
    emptyStateText: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
        textAlign: "center",
        width: "100%",
        ...(Platform.OS === "android"
            ? { paddingHorizontal: 12, fontFamily: "sans-serif-medium" }
            : null),
    },
    emptyStateSubtext: {
        color: colors.textDim,
        fontSize: 13,
        textAlign: "center",
        width: "100%",
        ...(Platform.OS === "android"
            ? { paddingHorizontal: 12, fontFamily: "sans-serif" }
            : null),
    },
});
