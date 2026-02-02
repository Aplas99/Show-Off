import {
    useCreateComment,
    useGetItemComments,
    type Comment,
} from "@/api/social/comments";
import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
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
import Animated, {
    FadeInDown,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
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

    const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.8;
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

    useEffect(() => {
        if (visible) {
            translateY.value = withTiming(0, { duration: 300 });
            opacity.value = withTiming(1, { duration: 200 });
        } else {
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
            opacity.value = withTiming(0, { duration: 200 });
        }
    }, [visible, SCREEN_HEIGHT]);

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (event.translationY > SWIPE_THRESHOLD || event.velocityY > 500) {
                translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
                opacity.value = withTiming(0, { duration: 200 }, () => {
                    runOnJS(onClose)();
                });
            } else {
                translateY.value = withTiming(0, { duration: 300 });
            }
        });

    const bottomSheetStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: translateY.value }],
        };
    });

    const backdropStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
        };
    });

    const handleClose = () => {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
            runOnJS(onClose)();
        });
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
                <Animated.View style={[styles.backdrop, backdropStyle]}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={handleClose}
                    />
                </Animated.View>

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
                                    <Ionicons name="close" size={24} color={COLORS.white} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </GestureDetector>

                    <View style={{ flex: 1 }}>
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={COLORS.primary} />
                            </View>
                        ) : isError ? (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorTitle}>Couldn’t load comments</Text>
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
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <Text style={styles.emptyStateText}>No comments yet</Text>
                                        <Text style={styles.emptyStateSubtext}>Be the first to comment!</Text>
                                    </View>
                                }
                            />
                        )}
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
                    >
                        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                            <TextInput
                                style={styles.input}
                                placeholder="Add a comment..."
                                placeholderTextColor="#666"
                                value={commentText}
                                onChangeText={setCommentText}
                                multiline
                                maxLength={500}
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
                                    <ActivityIndicator size="small" color={COLORS.white} />
                                ) : (
                                    <Ionicons name="arrow-up" size={24} color={COLORS.white} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </Animated.View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    bottomSheet: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#16181D",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: "hidden",
    },
    dragHandleContainer: {
        paddingTop: 12,
    },
    dragHandle: {
        width: 36,
        height: 4,
        backgroundColor: "#333",
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
        borderBottomColor: "#222",
    },
    headerTitle: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "700",
    },
    closeButton: {
        padding: 4,
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
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "700",
    },
    errorSubtext: {
        color: "#888",
        fontSize: 13,
        textAlign: "center",
        lineHeight: 18,
    },
    retryButton: {
        marginTop: 4,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: COLORS.primary,
    },
    retryText: {
        color: COLORS.white,
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
        backgroundColor: COLORS.primary,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    avatarText: {
        color: COLORS.white,
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
        color: "#999",
        fontSize: 13,
        fontWeight: "600",
        flexShrink: 1,
    },
    timestamp: {
        color: "#555",
        fontSize: 11,
        flexShrink: 0,
    },
    timestampBelow: {
        color: "#555",
        fontSize: 11,
        lineHeight: 16,
        marginTop: 6,
        paddingBottom: 4,
    },
    commentTextContent: {
        color: "#EEE",
        fontSize: 14,
        lineHeight: 20,
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: "#1B1E26",
        borderTopWidth: 1,
        borderTopColor: "#222",
    },
    input: {
        flex: 1,
        backgroundColor: "#121212",
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: COLORS.white,
        fontSize: 15,
        maxHeight: 100,
        marginRight: 12,
    },
    submitButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.primary,
        justifyContent: "center",
        alignItems: "center",
    },
    submitButtonDisabled: {
        backgroundColor: "#333",
        opacity: 0.5,
    },
    emptyState: {
        paddingVertical: 60,
        alignItems: "center",
    },
    emptyStateText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
    },
    emptyStateSubtext: {
        color: "#666",
        fontSize: 13,
    },
});
