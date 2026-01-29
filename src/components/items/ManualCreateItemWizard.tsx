import { ITEM_CONDITIONS, ITEM_CONDITION_LABELS, ItemCondition } from "@/constants/itemCondition";
import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { validateCreateItem } from "@/lib/createItemValidation";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { useCreateItemWithProductLookup } from "@/api/items";
import { ShowcaseRow, useGetVisibleShowcases, useLinkItemToShowcases } from "@/api/showcase";
import ItemGenerationModal from "./ItemGenerationModal";
import ItemSuccessModal from "./ItemSuccessModal";

type Props = {
    visible: boolean;
    onClose: () => void;
    onSuccess?: (itemTitle: string, showcaseCount: number) => void;
};

type Step = 1 | 2;

interface ManualItemData {
    customTitle: string;
    customBrand: string;
    condition: ItemCondition | "";
    description: string;
    price: string;
    forSale: boolean;
    selectedShowcaseIds: string[];
}

export default function ManualCreateItemWizard({
    visible,
    onClose,
    onSuccess,
}: Props) {
    const router = useRouter();
    const haptics = useHaptics();
    
    const [currentStep, setCurrentStep] = useState<Step>(1);
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [generationModalOpen, setGenerationModalOpen] = useState(false);

    const [itemData, setItemData] = useState<ManualItemData>({
        customTitle: "",
        customBrand: "",
        condition: "",
        description: "",
        price: "",
        forSale: false,
        selectedShowcaseIds: [],
    });

    // Animation values
    const contentOpacity = useSharedValue(1);
    const slideAnim = useSharedValue(0);

    // API hooks
    const createItemWithProduct = useCreateItemWithProductLookup();
    const linkToShowcases = useLinkItemToShowcases();
    const { data: showcases, isLoading: loadingShowcases } = useGetVisibleShowcases();

    const canProceedToStep2 = itemData.customTitle.trim() !== "" && itemData.condition !== "";
    const canCreateItem = canProceedToStep2;

    const animateStepTransition = useCallback((direction: "next" | "back") => {
        contentOpacity.value = withTiming(0, { duration: 150 }, () => {
            slideAnim.value = direction === "next" ? 30 : -30;
            contentOpacity.value = withTiming(1, { duration: 200 });
            slideAnim.value = withSpring(0, { damping: 20, stiffness: 200 });
        });
    }, [slideAnim, contentOpacity]);

    const nextStep = async () => {
        if (currentStep < 2) {
            await haptics.medium();
            animateStepTransition("next");
            setTimeout(() => {
                setCurrentStep((prev) => (prev + 1) as Step);
            }, 150);
        }
    };

    const prevStep = async () => {
        if (currentStep > 1) {
            await haptics.light();
            animateStepTransition("back");
            setTimeout(() => {
                setCurrentStep((prev) => (prev - 1) as Step);
            }, 150);
        }
    };

    const handleCreateItem = async () => {
        try {
            await haptics.heavy();
            const payload = {
                searchQuery: undefined,
                customTitle: itemData.customTitle,
                customBrand: itemData.customBrand || undefined,
                condition: itemData.condition as ItemCondition,
                userDescription: itemData.description || null,
                forSale: itemData.forSale,
                price: itemData.price.trim() !== "" ? Number(itemData.price) : null,
                imageUrl: null,
            };

            validateCreateItem(payload);
            setGenerationModalOpen(true);

            const res = await createItemWithProduct.mutateAsync(payload);

            if (itemData.selectedShowcaseIds.length > 0 && res?.itemId) {
                await linkToShowcases.mutateAsync({
                    itemId: res.itemId,
                    showcaseIds: itemData.selectedShowcaseIds,
                });
            }
        } catch (error) {
            setGenerationModalOpen(false);
            await haptics.error();
            console.error("Error creating item:", error);
            alert(error instanceof Error ? error.message : "Failed to create item");
        }
    };

    const handleGenerationComplete = () => {
        setGenerationModalOpen(false);
        setSuccessModalOpen(true);
    };

    const handleViewShowcase = async () => {
        await haptics.medium();
        setSuccessModalOpen(false);
        resetWizard();
        onClose();

        if (itemData.selectedShowcaseIds.length === 1) {
            router.push(`/(tabs)/showcase/${itemData.selectedShowcaseIds[0]}` as any);
        } else {
            router.push("/(tabs)/showcase" as any);
        }

        onSuccess?.(itemData.customTitle, itemData.selectedShowcaseIds.length);
    };

    const resetWizard = () => {
        setCurrentStep(1);
        setItemData({
            customTitle: "",
            customBrand: "",
            condition: "",
            description: "",
            price: "",
            forSale: false,
            selectedShowcaseIds: [],
        });
    };

    const handleClose = async () => {
        await haptics.light();
        resetWizard();
        onClose();
    };

    const handleCreateAnother = async () => {
        await haptics.light();
        setSuccessModalOpen(false);
        resetWizard();
    };

    const toggleShowcase = async (id: string) => {
        await haptics.selection();
        setItemData((prev) => ({
            ...prev,
            selectedShowcaseIds: prev.selectedShowcaseIds.includes(id)
                ? prev.selectedShowcaseIds.filter((x) => x !== id)
                : [...prev.selectedShowcaseIds, id],
        }));
    };

    const contentStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
        transform: [{ translateX: slideAnim.value }],
    }));

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <View style={styles.backdrop}>
                <KeyboardAvoidingView
                    style={styles.modal}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={handleClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={24} color={COLORS.white} />
                        </TouchableOpacity>
                        <Text style={styles.title}>Manual Creation</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Progress Indicator */}
                    <ProgressIndicator currentStep={currentStep} />

                    {/* Content */}
                    <Animated.View style={[styles.contentWrapper, contentStyle]}>
                        <ScrollView
                            style={styles.content}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {currentStep === 1 && (
                                <Step1Details
                                    customTitle={itemData.customTitle}
                                    customBrand={itemData.customBrand}
                                    condition={itemData.condition}
                                    description={itemData.description}
                                    onCustomTitleChange={(t) => setItemData(prev => ({ ...prev, customTitle: t }))}
                                    onCustomBrandChange={(b) => setItemData(prev => ({ ...prev, customBrand: b }))}
                                    onConditionChange={(c) => setItemData(prev => ({ ...prev, condition: c }))}
                                    onDescriptionChange={(d) => setItemData(prev => ({ ...prev, description: d }))}
                                    haptics={haptics}
                                />
                            )}

                            {currentStep === 2 && (
                                <Step2Pricing
                                    price={itemData.price}
                                    forSale={itemData.forSale}
                                    selectedShowcaseIds={itemData.selectedShowcaseIds}
                                    onPriceChange={(p) => setItemData(prev => ({ ...prev, price: p }))}
                                    onForSaleChange={(f) => setItemData(prev => ({ ...prev, forSale: f }))}
                                    onToggleShowcase={toggleShowcase}
                                    showcases={showcases || []}
                                    loadingShowcases={loadingShowcases}
                                    haptics={haptics}
                                />
                            )}
                        </ScrollView>
                    </Animated.View>

                    {/* Navigation */}
                    <View style={styles.navigation}>
                        {currentStep > 1 && (
                            <TouchableOpacity style={styles.backButton} onPress={prevStep} activeOpacity={0.7}>
                                <Text style={styles.backButtonText}>Back</Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.spacer} />

                        {currentStep < 2 ? (
                            <TouchableOpacity
                                style={[
                                    styles.nextButton,
                                    !canProceedToStep2 ? styles.disabledButton : null,
                                ]}
                                onPress={nextStep}
                                disabled={!canProceedToStep2}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.nextButtonText}>Next</Text>
                                <Ionicons name="arrow-forward" size={18} color={COLORS.white} style={{ marginLeft: 4 }} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[
                                    styles.createButton,
                                    !canCreateItem || generationModalOpen
                                        ? styles.disabledButton
                                        : null,
                                ]}
                                onPress={handleCreateItem}
                                disabled={!canCreateItem || generationModalOpen}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="checkmark" size={18} color={COLORS.white} style={{ marginRight: 4 }} />
                                <Text style={styles.createButtonText}>Create Item</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </View>

            <ItemGenerationModal
                visible={generationModalOpen}
                onComplete={handleGenerationComplete}
            />

            <ItemSuccessModal
                visible={successModalOpen}
                onClose={() => setSuccessModalOpen(false)}
                onCreateAnother={handleCreateAnother}
                onViewShowcase={handleViewShowcase}
                itemTitle={itemData.customTitle}
                showcaseCount={itemData.selectedShowcaseIds.length}
            />
        </Modal>
    );
}

// Progress Indicator
function ProgressIndicator({ currentStep }: { currentStep: Step }) {
    return (
        <View style={styles.progressContainer}>
            {[1, 2].map((step) => (
                <StepDot
                    key={step}
                    step={step}
                    isActive={currentStep === step}
                    isCompleted={currentStep > step}
                />
            ))}
        </View>
    );
}

function StepDot({
    step,
    isActive,
    isCompleted,
}: {
    step: number;
    isActive: boolean;
    isCompleted: boolean;
}) {
    const scale = useSharedValue(isActive ? 1.2 : 1);
    const opacity = useSharedValue(isActive || isCompleted ? 1 : 0.4);
    const checkScale = useSharedValue(isCompleted ? 1 : 0);

    useEffect(() => {
        if (isActive) {
            scale.value = withSpring(1.3, { damping: 12, stiffness: 200 });
            opacity.value = withTiming(1, { duration: 200 });
        } else if (isCompleted) {
            scale.value = withTiming(1, { duration: 200 });
            opacity.value = withTiming(1, { duration: 200 });
            checkScale.value = withSpring(1, { damping: 12, stiffness: 200 });
        } else {
            scale.value = withTiming(1, { duration: 200 });
            opacity.value = withTiming(0.4, { duration: 200 });
            checkScale.value = withTiming(0, { duration: 150 });
        }
    }, [isActive, isCompleted, scale, opacity, checkScale]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    const checkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkScale.value }],
    }));

    return (
        <View style={styles.progressStep}>
            <Animated.View
                style={[
                    styles.progressDot,
                    isActive && styles.progressDotActive,
                    isCompleted && styles.progressDotCompleted,
                    animatedStyle,
                ]}
            >
                {isCompleted && (
                    <Animated.View style={checkStyle}>
                        <Ionicons name="checkmark" size={12} color={COLORS.white} />
                    </Animated.View>
                )}
                {!isCompleted && (
                    <Text style={[styles.progressNumber, isActive && styles.progressNumberActive]}>
                        {step}
                    </Text>
                )}
            </Animated.View>
            <Text style={[styles.progressLabel, (isActive || isCompleted) && styles.progressLabelActive]}>
                {step === 1 ? "Details" : "Pricing"}
            </Text>
        </View>
    );
}

// Step Components
function Step1Details({
    customTitle,
    customBrand,
    condition,
    description,
    onCustomTitleChange,
    onCustomBrandChange,
    onConditionChange,
    onDescriptionChange,
    haptics,
}: {
    customTitle: string;
    customBrand: string;
    condition: ItemCondition | "";
    description: string;
    onCustomTitleChange: (val: string) => void;
    onCustomBrandChange: (val: string) => void;
    onConditionChange: (val: ItemCondition | "") => void;
    onDescriptionChange: (val: string) => void;
    haptics: ReturnType<typeof useHaptics>;
}) {
    const [conditionModalOpen, setConditionModalOpen] = useState(false);

    const handleOpenCondition = async () => {
        await haptics.light();
        setConditionModalOpen(true);
    };

    const handleSelectCondition = async (item: ItemCondition) => {
        await haptics.selection();
        onConditionChange(item);
        setConditionModalOpen(false);
    };

    return (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Item Details</Text>
            
            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Item Title *</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Vintage Camera"
                    placeholderTextColor={COLORS.grey}
                    value={customTitle}
                    onChangeText={onCustomTitleChange}
                    autoFocus
                />
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Brand / Manufacturer</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Canon"
                    placeholderTextColor={COLORS.grey}
                    value={customBrand}
                    onChangeText={onCustomBrandChange}
                />
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Condition *</Text>
                <TouchableOpacity
                    style={[
                        styles.selectorButton,
                        condition && styles.selectorButtonActive
                    ]}
                    onPress={handleOpenCondition}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.selectorText,
                        !condition && styles.selectorTextPlaceholder
                    ]}>
                        {condition ? ITEM_CONDITION_LABELS[condition] : "Select Condition"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={condition ? COLORS.primary : COLORS.grey} />
                </TouchableOpacity>
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Description (Optional)</Text>
                <TextInput
                    style={styles.descriptionInput}
                    placeholder="Notes about this item..."
                    placeholderTextColor={COLORS.grey}
                    value={description}
                    onChangeText={onDescriptionChange}
                    multiline
                    numberOfLines={4}
                />
            </View>

            <Modal
                visible={conditionModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setConditionModalOpen(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Select Condition</Text>
                        <FlatList
                            data={ITEM_CONDITIONS}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.optionItem}
                                    onPress={() => handleSelectCondition(item)}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons
                                        name={
                                            condition === item
                                                ? "radio-button-on"
                                                : "radio-button-off"
                                        }
                                        size={20}
                                        color={condition === item ? COLORS.primary : COLORS.grey}
                                    />
                                    <Text style={[
                                        styles.optionText,
                                        condition === item && styles.optionTextActive
                                    ]}>
                                        {ITEM_CONDITION_LABELS[item]}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            showsVerticalScrollIndicator={false}
                        />
                        <TouchableOpacity
                            style={styles.modalCancel}
                            onPress={() => setConditionModalOpen(false)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function Step2Pricing({
    price,
    forSale,
    selectedShowcaseIds,
    onPriceChange,
    onForSaleChange,
    onToggleShowcase,
    showcases,
    loadingShowcases,
    haptics,
}: {
    price: string;
    forSale: boolean;
    selectedShowcaseIds: string[];
    onPriceChange: (val: string) => void;
    onForSaleChange: (val: boolean) => void;
    onToggleShowcase: (id: string) => void;
    showcases: ShowcaseRow[];
    loadingShowcases: boolean;
    haptics: ReturnType<typeof useHaptics>;
}) {
    const [showcaseModalOpen, setShowcaseModalOpen] = useState(false);

    const handleOpenShowcase = async () => {
        await haptics.light();
        setShowcaseModalOpen(true);
    };

    const handleToggle = async (id: string) => {
        await haptics.selection();
        onToggleShowcase(id);
    };

    return (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Pricing & Visibility</Text>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Price (USD)</Text>
                <View style={styles.priceInputContainer}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                        style={styles.priceInput}
                        placeholder="0.00"
                        placeholderTextColor={COLORS.grey}
                        value={price}
                        onChangeText={onPriceChange}
                        keyboardType="decimal-pad"
                    />
                </View>
            </View>

            <View style={styles.fieldContainer}>
                <View style={styles.switchRow}>
                    <View>
                        <Text style={styles.fieldLabel}>For Sale</Text>
                        <Text style={styles.switchHint}>List this item for sale</Text>
                    </View>
                    <Switch
                        value={forSale}
                        onValueChange={onForSaleChange}
                        trackColor={{ false: COLORS.slate, true: COLORS.primary }}
                        thumbColor={COLORS.white}
                    />
                </View>
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Add to Showcase(s)</Text>
                <TouchableOpacity
                    style={[
                        styles.selectorButton,
                        selectedShowcaseIds.length > 0 && styles.selectorButtonActive
                    ]}
                    onPress={handleOpenShowcase}
                    disabled={loadingShowcases}
                    activeOpacity={0.7}
                >
                    <Ionicons 
                        name="albums-outline" 
                        size={18} 
                        color={selectedShowcaseIds.length > 0 ? COLORS.primary : COLORS.grey} 
                    />
                    <Text style={[
                        styles.selectorText,
                        selectedShowcaseIds.length === 0 && styles.selectorTextPlaceholder
                    ]}>
                        {selectedShowcaseIds.length === 0
                            ? "Select showcase(s)"
                            : `${selectedShowcaseIds.length} selected`}
                    </Text>
                    <Ionicons 
                        name="chevron-forward" 
                        size={18} 
                        color={selectedShowcaseIds.length > 0 ? COLORS.primary : COLORS.grey} 
                    />
                </TouchableOpacity>
            </View>

            <Modal
                visible={showcaseModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setShowcaseModalOpen(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Choose Showcase(s)</Text>
                        <FlatList
                            data={showcases ?? []}
                            keyExtractor={(s) => s.id}
                            renderItem={({ item }) => {
                                const checked = selectedShowcaseIds.includes(item.id);
                                const label = item.name || (item.is_default ? "Default showcase" : `Showcase ${item.id.slice(0, 6)}…`);
                                return (
                                    <TouchableOpacity
                                        style={styles.optionItem}
                                        onPress={() => handleToggle(item.id)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons
                                            name={checked ? "checkbox" : "square-outline"}
                                            size={20}
                                            color={checked ? COLORS.primary : COLORS.grey}
                                        />
                                        <Text style={[
                                            styles.optionText,
                                            checked && styles.optionTextActive
                                        ]}>{label}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="albums-outline" size={40} color={COLORS.grey} />
                                    <Text style={styles.emptyText}>No showcases found</Text>
                                    <Text style={styles.emptySubtext}>Create a showcase first</Text>
                                </View>
                            }
                            showsVerticalScrollIndicator={false}
                        />
                        <TouchableOpacity 
                            style={styles.modalCancel} 
                            onPress={() => setShowcaseModalOpen(false)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.cancelText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    modal: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        paddingTop: Platform.OS === "ios" ? 60 : 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
    },
    title: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "700",
    },
    contentWrapper: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 20,
    },
    progressContainer: {
        flexDirection: "row",
        justifyContent: "center",
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
        gap: 60,
    },
    progressStep: {
        alignItems: "center",
    },
    progressDot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.surfaceLight,
        marginBottom: 8,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: COLORS.surfaceLight,
    },
    progressDotActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    progressDotCompleted: {
        backgroundColor: "#4CAF50",
        borderColor: "#4CAF50",
    },
    progressNumber: {
        color: COLORS.grey,
        fontSize: 14,
        fontWeight: "700",
    },
    progressNumberActive: {
        color: COLORS.white,
    },
    progressLabel: {
        color: COLORS.grey,
        fontSize: 12,
        fontWeight: "500",
    },
    progressLabelActive: {
        color: COLORS.white,
        fontWeight: "600",
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        color: COLORS.white,
        fontSize: 24,
        fontWeight: "700",
        marginBottom: 20,
    },
    fieldContainer: {
        marginBottom: 20,
    },
    fieldLabel: {
        color: COLORS.white,
        fontSize: 15,
        fontWeight: "600",
        marginBottom: 10,
    },
    textInput: {
        height: 56,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        color: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        fontSize: 16,
    },
    descriptionInput: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 16,
        color: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        minHeight: 120,
        textAlignVertical: "top",
        fontSize: 15,
    },
    selectorButton: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        height: 56,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    selectorButtonActive: {
        borderColor: COLORS.primary,
    },
    selectorText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "500",
    },
    selectorTextPlaceholder: {
        color: COLORS.grey,
        fontWeight: "400",
    },
    priceInputContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        paddingHorizontal: 16,
        height: 56,
    },
    currencySymbol: {
        color: COLORS.grey,
        fontSize: 20,
        marginRight: 8,
        fontWeight: "600",
    },
    priceInput: {
        flex: 1,
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "600",
    },
    switchRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    switchHint: {
        color: COLORS.grey,
        fontSize: 13,
        marginTop: 2,
    },
    navigation: {
        flexDirection: "row",
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: COLORS.surfaceLight,
        marginBottom: Platform.OS === "ios" ? 20 : 0,
        alignItems: "center",
    },
    backButton: {
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    backButtonText: {
        color: COLORS.grey,
        fontSize: 16,
        fontWeight: "600",
    },
    spacer: {
        flex: 1,
    },
    nextButton: {
        backgroundColor: COLORS.primary,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    nextButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "700",
    },
    createButton: {
        backgroundColor: "#4CAF50",
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#4CAF50",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    createButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "700",
    },
    disabledButton: {
        opacity: 0.4,
        shadowOpacity: 0,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        padding: 20,
    },
    modalCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 20,
        padding: 24,
        maxHeight: "80%",
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    modalTitle: {
        color: COLORS.white,
        fontSize: 20,
        fontWeight: "700",
        marginBottom: 20,
        textAlign: "center",
    },
    optionItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
    },
    optionText: {
        color: COLORS.white,
        fontSize: 16,
        flex: 1,
    },
    optionTextActive: {
        color: COLORS.primary,
        fontWeight: "600",
    },
    modalCancel: {
        marginTop: 16,
        alignItems: "center",
        paddingVertical: 12,
    },
    cancelText: {
        color: COLORS.primary,
        fontSize: 16,
        fontWeight: "700",
    },
    emptyContainer: {
        alignItems: "center",
        paddingVertical: 40,
    },
    emptyText: {
        color: COLORS.grey,
        textAlign: "center",
        marginTop: 12,
        fontSize: 16,
        fontWeight: "600",
    },
    emptySubtext: {
        color: COLORS.grey,
        textAlign: "center",
        marginTop: 4,
        fontSize: 14,
    },
});
