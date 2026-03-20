import { ITEM_CONDITIONS, ITEM_CONDITION_LABELS, ItemCondition } from "@/constants/itemCondition";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { validateCreateItem } from "@/lib/createItemValidation";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    FlatList,
    Modal,
    Platform,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
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

type Step = 1 | 2 | 3;

interface ManualItemData {
    customTitle: string;
    customBrand: string;
    customPublisher: string;
    customCategory: string;
    condition: ItemCondition | "";
    description: string;
    price: string;
    forSale: boolean;
    selectedShowcaseIds: string[];
    imageUri: string | null;
}

export default function ManualCreateItemWizard({
    visible,
    onClose,
    onSuccess,
}: Props) {
    const router = useRouter();
    const haptics = useHaptics();
    const colors = useColors();
    const styles = getStyles(colors);

    const [currentStep, setCurrentStep] = useState<Step>(1);
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [generationModalOpen, setGenerationModalOpen] = useState(false);
    const [apiFinished, setApiFinished] = useState(false);

    const [itemData, setItemData] = useState<ManualItemData>({
        customTitle: "",
        customBrand: "",
        customPublisher: "",
        customCategory: "",
        condition: "",
        description: "",
        price: "",
        forSale: false,
        selectedShowcaseIds: [],
        imageUri: null,
    });

    // Animation values
    const contentOpacity = useSharedValue(1);
    const slideAnim = useSharedValue(0);

    // API hooks
    const createItemWithProduct = useCreateItemWithProductLookup();
    const linkToShowcases = useLinkItemToShowcases();
    const { data: showcases, isLoading: loadingShowcases } = useGetVisibleShowcases();

    const canProceedToStep2 = itemData.customTitle.trim() !== "";
    const canProceedToStep3 = itemData.condition !== "";
    const canCreateItem = canProceedToStep3;

    const animateStepTransition = useCallback((direction: "next" | "back") => {
        contentOpacity.value = withTiming(0, { duration: 150 }, () => {
            slideAnim.value = direction === "next" ? 30 : -30;
            contentOpacity.value = withTiming(1, { duration: 200 });
            slideAnim.value = withSpring(0, { damping: 20, stiffness: 200 });
        });
    }, [slideAnim, contentOpacity]);

    const nextStep = async () => {
        if (currentStep < 3) {
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
                customPublisher: itemData.customPublisher || undefined,
                customCategory: itemData.customCategory || undefined,
                condition: itemData.condition as ItemCondition,
                userDescription: itemData.description || null,
                forSale: itemData.forSale,
                price: itemData.price.trim() !== "" ? Number(itemData.price) : null,
                imageFile: itemData.imageUri || undefined,
                imageUrl: null,
            };

            validateCreateItem(payload);
            setGenerationModalOpen(true);
            setApiFinished(false);

            const res = await createItemWithProduct.mutateAsync(payload);
            setApiFinished(true);

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
            customPublisher: "",
            customCategory: "",
            condition: "",
            description: "",
            price: "",
            forSale: false,
            selectedShowcaseIds: [],
            imageUri: null,
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
                <View style={styles.modal}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={handleClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={styles.title}>Manual Creation</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Progress Indicator */}
                    <ProgressIndicator currentStep={currentStep} colors={colors} />

                    {/* Content */}
                    <Animated.View style={[styles.contentWrapper, contentStyle]}>
                        <KeyboardAwareScrollView
                            style={styles.content}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            bottomOffset={20}
                        >
                            {currentStep === 1 && (
                                <Step1Details
                                    customTitle={itemData.customTitle}
                                    customBrand={itemData.customBrand}
                                    customPublisher={itemData.customPublisher}
                                    onCustomTitleChange={(val) =>
                                        setItemData((prev) => ({ ...prev, customTitle: val }))
                                    }
                                    onCustomBrandChange={(val) =>
                                        setItemData((prev) => ({ ...prev, customBrand: val }))
                                    }
                                    onCustomPublisherChange={(val) =>
                                        setItemData((prev) => ({ ...prev, customPublisher: val }))
                                    }
                                    haptics={haptics}
                                    imageUri={itemData.imageUri}
                                    onImageChange={(uri) =>
                                        setItemData((prev) => ({ ...prev, imageUri: uri }))
                                    }
                                    colors={colors}
                                />
                            )}

                            {currentStep === 2 && (
                                <Step2Info
                                    customCategory={itemData.customCategory}
                                    condition={itemData.condition}
                                    description={itemData.description}
                                    onCustomCategoryChange={(val) =>
                                        setItemData((prev) => ({ ...prev, customCategory: val }))
                                    }
                                    onConditionChange={(val) =>
                                        setItemData((prev) => ({ ...prev, condition: val }))
                                    }
                                    onDescriptionChange={(val) =>
                                        setItemData((prev) => ({ ...prev, description: val }))
                                    }
                                    haptics={haptics}
                                    colors={colors}
                                />
                            )}

                            {currentStep === 3 && (
                                <Step3Pricing
                                    price={itemData.price}
                                    forSale={itemData.forSale}
                                    selectedShowcaseIds={itemData.selectedShowcaseIds}
                                    showcases={showcases || []}
                                    loadingShowcases={loadingShowcases}
                                    onPriceChange={(val) =>
                                        setItemData((prev) => ({ ...prev, price: val }))
                                    }
                                    onForSaleChange={(val) =>
                                        setItemData((prev) => ({ ...prev, forSale: val }))
                                    }
                                    onToggleShowcase={(id) => {
                                        haptics.selection();
                                        setItemData((prev) => {
                                            const selected = prev.selectedShowcaseIds;
                                            if (selected.includes(id)) {
                                                return { ...prev, selectedShowcaseIds: selected.filter((sId) => sId !== id) };
                                            } else {
                                                return { ...prev, selectedShowcaseIds: [...selected, id] };
                                            }
                                        });
                                    }}
                                    haptics={haptics}
                                    colors={colors}
                                />
                            )}
                        </KeyboardAwareScrollView>
                    </Animated.View>

                    {/* Navigation */}
                    <View style={styles.navigation}>
                        {currentStep > 1 && (
                            <TouchableOpacity style={styles.backButton} onPress={prevStep} activeOpacity={0.7}>
                                <Text style={styles.backButtonText}>Back</Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.spacer} />

                        {currentStep < 3 ? (
                            <TouchableOpacity
                                style={[
                                    styles.nextButton,
                                    currentStep === 1 && !canProceedToStep2 || currentStep === 2 && !canProceedToStep3
                                        ? styles.disabledButton
                                        : null,
                                ]}
                                onPress={nextStep}
                                disabled={currentStep === 1 ? !canProceedToStep2 : !canProceedToStep3}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.nextButtonText}>Next</Text>
                                <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 4 }} />
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
                                <Ionicons name="checkmark" size={18} color="#FFF" style={{ marginRight: 4 }} />
                                <Text style={styles.createButtonText}>Create Item</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            <ItemGenerationModal
                visible={generationModalOpen}
                onComplete={handleGenerationComplete}
                isFinished={apiFinished}
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
function ProgressIndicator({ currentStep, colors }: { currentStep: Step; colors: ThemeColors }) {
    const styles = getStyles(colors);
    return (
        <View style={styles.progressContainer}>
            <StepIndicator step={1} currentStep={currentStep} label="Details" colors={colors} />
            <StepIndicator step={2} currentStep={currentStep} label="Info" colors={colors} />
            <StepIndicator step={3} currentStep={currentStep} label="Pricing" colors={colors} />
        </View>
    );
}

function StepIndicator({
    step,
    currentStep,
    label,
    colors,
}: {
    step: number;
    currentStep: number;
    label: string;
    colors: ThemeColors;
}) {
    const styles = getStyles(colors);
    const isActive = step === currentStep;
    const isCompleted = step < currentStep;

    const scale = useSharedValue(isActive ? 1.2 : 1);
    const opacity = useSharedValue(isActive || isCompleted ? 1 : 0.5);

    useEffect(() => {
        scale.value = withSpring(isActive ? 1.1 : 1, { damping: 15 });
        opacity.value = withTiming(isActive || isCompleted ? 1 : 0.5);
    }, [isActive, isCompleted, scale, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    const checkScale = useSharedValue(0);
    useEffect(() => {
        checkScale.value = withSpring(isCompleted ? 1 : 0);
    }, [isCompleted, checkScale]);

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
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                    </Animated.View>
                )}
                {!isCompleted && (
                    <Text style={[styles.progressNumber, isActive && styles.progressNumberActive]}>
                        {step}
                    </Text>
                )}
            </Animated.View>
            <Text style={[styles.progressLabel, (isActive || isCompleted) && styles.progressLabelActive]}>
                {label}
            </Text>
        </View>
    );
}

// Step 1: Basic Details
function Step1Details({
    customTitle,
    customBrand,
    customPublisher,
    onCustomTitleChange,
    onCustomBrandChange,
    onCustomPublisherChange,
    haptics,
    imageUri,
    onImageChange,
    colors,
}: {
    customTitle: string;
    customBrand: string;
    customPublisher: string;
    onCustomTitleChange: (val: string) => void;
    onCustomBrandChange: (val: string) => void;
    onCustomPublisherChange: (val: string) => void;
    haptics: ReturnType<typeof useHaptics>;
    imageUri: string | null;
    onImageChange: (uri: string | null) => void;
    colors: ThemeColors;
}) {
    const styles = getStyles(colors);
    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: false,
        });

        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const MAX_SIZE = 5 * 1024 * 1024;

            if (asset.fileSize && asset.fileSize > MAX_SIZE) {
                alert("Image too large. Please select an image smaller than 5MB.");
                return;
            }

            await haptics.selection();
            onImageChange(asset.uri);
        }
    };

    return (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Item Details</Text>

            <View style={styles.imageSection}>
                <TouchableOpacity
                    style={styles.imagePreview}
                    onPress={handlePickImage}
                    activeOpacity={0.8}
                >
                    {imageUri ? (
                        <Image
                            source={{ uri: imageUri }}
                            style={styles.image}
                            contentFit="cover"
                            transition={200}
                        />
                    ) : (
                        <View style={styles.imagePlaceholder}>
                            <Ionicons name="camera-outline" size={32} color={colors.grey} />
                            <Text style={styles.placeholderText}>Add Photo</Text>
                        </View>
                    )}
                    <View style={styles.editIconContainer}>
                        <Ionicons name="pencil" size={12} color="#FFF" />
                    </View>
                </TouchableOpacity>
                <Text style={styles.imageHint}>
                    {imageUri ? "Tap to change image" : "Tap to add a photo"}
                </Text>
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Item Title *</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Vintage Camera"
                    placeholderTextColor={colors.grey}
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
                    placeholderTextColor={colors.grey}
                    value={customBrand}
                    onChangeText={onCustomBrandChange}
                />
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Publisher (Optional)</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Penguin Books"
                    placeholderTextColor={colors.grey}
                    value={customPublisher}
                    onChangeText={onCustomPublisherChange}
                />
            </View>
        </View>
    );
}

// Step 2: Info
function Step2Info({
    customCategory,
    condition,
    description,
    onCustomCategoryChange,
    onConditionChange,
    onDescriptionChange,
    haptics,
    colors,
}: {
    customCategory: string;
    condition: ItemCondition | "";
    description: string;
    onCustomCategoryChange: (val: string) => void;
    onConditionChange: (val: ItemCondition | "") => void;
    onDescriptionChange: (val: string) => void;
    haptics: ReturnType<typeof useHaptics>;
    colors: ThemeColors;
}) {
    const styles = getStyles(colors);
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
            <Text style={styles.stepTitle}>Additional Info</Text>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Category</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Electronics, Books"
                    placeholderTextColor={colors.grey}
                    value={customCategory}
                    onChangeText={onCustomCategoryChange}
                    autoFocus
                />
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Condition *</Text>
                <TouchableOpacity
                    style={[
                        styles.selectorButton,
                        condition && styles.selectorButtonActive,
                    ]}
                    onPress={handleOpenCondition}
                    activeOpacity={0.7}
                >
                    <Text
                        style={[
                            styles.selectorText,
                            !condition && styles.selectorTextPlaceholder,
                        ]}
                    >
                        {condition ? ITEM_CONDITION_LABELS[condition] : "Select Condition"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={condition ? colors.primary : colors.grey} />
                </TouchableOpacity>
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Description (Optional)</Text>
                <TextInput
                    style={styles.descriptionInput}
                    placeholder="Notes about this item..."
                    placeholderTextColor={colors.grey}
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
                                    <Text style={styles.optionText}>{ITEM_CONDITION_LABELS[item]}</Text>
                                    {condition === item && (
                                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                                    )}
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

// Step 3: Pricing & Visibility
function Step3Pricing({
    price,
    forSale,
    selectedShowcaseIds,
    showcases,
    loadingShowcases,
    onPriceChange,
    onForSaleChange,
    onToggleShowcase,
    haptics,
    colors,
}: {
    price: string;
    forSale: boolean;
    selectedShowcaseIds: string[];
    showcases: ShowcaseRow[];
    loadingShowcases: boolean;
    onPriceChange: (val: string) => void;
    onForSaleChange: (val: boolean) => void;
    onToggleShowcase: (id: string) => void;
    haptics: ReturnType<typeof useHaptics>;
    colors: ThemeColors;
}) {
    const styles = getStyles(colors);
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
                        placeholderTextColor={colors.grey}
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
                        trackColor={{ false: colors.slate, true: colors.primary }}
                        thumbColor={forSale ? "#FFF" : colors.grey}
                    />
                </View>
            </View>

            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Add to Showcase(s)</Text>
                <TouchableOpacity
                    style={[
                        styles.selectorButton,
                        selectedShowcaseIds.length > 0 && styles.selectorButtonActive,
                    ]}
                    onPress={handleOpenShowcase}
                    disabled={loadingShowcases}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name="albums-outline"
                        size={18}
                        color={selectedShowcaseIds.length > 0 ? colors.primary : colors.grey}
                    />
                    <Text
                        style={[
                            styles.selectorText,
                            selectedShowcaseIds.length === 0 && styles.selectorTextPlaceholder,
                        ]}
                    >
                        {selectedShowcaseIds.length === 0
                            ? "Select showcase(s)"
                            : `${selectedShowcaseIds.length} selected`}
                    </Text>
                    <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={selectedShowcaseIds.length > 0 ? colors.primary : colors.grey}
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
                                            color={checked ? colors.primary : colors.grey}
                                        />
                                        <Text
                                            style={[
                                                styles.optionText,
                                                checked && styles.optionTextActive,
                                            ]}
                                        >{label}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="albums-outline" size={40} color={colors.grey} />
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

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.background },
    modal: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        padding: 16, paddingTop: Platform.OS === "ios" ? 60 : 16,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    title: { color: colors.text, fontSize: 18, fontWeight: "700" },
    contentWrapper: { flex: 1 },
    content: { flex: 1, padding: 20 },
    progressContainer: {
        flexDirection: "row", justifyContent: "center", paddingVertical: 20,
        borderBottomWidth: 1, borderBottomColor: colors.border, gap: 60,
    },
    progressStep: { alignItems: "center" },
    progressDot: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceLight,
        marginBottom: 8, justifyContent: "center", alignItems: "center",
        borderWidth: 2, borderColor: colors.surfaceLight,
    },
    progressDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    progressDotCompleted: { backgroundColor: "#4CAF50", borderColor: "#4CAF50" },
    progressNumber: { color: colors.grey, fontSize: 14, fontWeight: "700" },
    progressNumberActive: { color: "#FFF" },
    progressLabel: { color: colors.grey, fontSize: 12, fontWeight: "500" },
    progressLabelActive: { color: colors.text, fontWeight: "600" },
    stepContent: { flex: 1 },
    stepTitle: { color: colors.text, fontSize: 24, fontWeight: "700", marginBottom: 20 },
    fieldContainer: { marginBottom: 20 },
    fieldLabel: { color: colors.text, fontSize: 15, fontWeight: "600", marginBottom: 10 },
    textInput: {
        height: 56, backgroundColor: colors.inputBg, borderRadius: 12,
        paddingHorizontal: 16, color: colors.text, borderWidth: 1,
        borderColor: colors.border, fontSize: 16,
    },
    descriptionInput: {
        backgroundColor: colors.inputBg, borderRadius: 12, padding: 16,
        color: colors.text, borderWidth: 1, borderColor: colors.border,
        minHeight: 120, textAlignVertical: "top", fontSize: 15,
    },
    selectorButton: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        height: 56, backgroundColor: colors.inputBg, borderRadius: 12,
        paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border,
    },
    selectorButtonActive: { borderColor: colors.primary },
    selectorText: { color: colors.text, fontSize: 16, fontWeight: "500" },
    selectorTextPlaceholder: { color: colors.grey, fontWeight: "400" },
    priceInputContainer: {
        flexDirection: "row", alignItems: "center", backgroundColor: colors.inputBg,
        borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        paddingHorizontal: 16, height: 56,
    },
    currencySymbol: { color: colors.grey, fontSize: 20, marginRight: 8, fontWeight: "600" },
    priceInput: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "600" },
    switchRow: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        backgroundColor: colors.inputBg, borderRadius: 12, padding: 16,
        borderWidth: 1, borderColor: colors.border,
    },
    switchHint: { color: colors.grey, fontSize: 13, marginTop: 2 },
    navigation: {
        flexDirection: "row", padding: 20, borderTopWidth: 1,
        borderTopColor: colors.border,
        marginBottom: Platform.OS === "ios" ? 20 : 0, alignItems: "center",
    },
    backButton: { paddingVertical: 12, paddingHorizontal: 8 },
    backButtonText: { color: colors.grey, fontSize: 16, fontWeight: "600" },
    spacer: { flex: 1 },
    nextButton: {
        backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 28,
        borderRadius: 999, flexDirection: "row", alignItems: "center",
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 16, elevation: 4,
    },
    nextButtonText: { color: "#000", fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    createButton: {
        backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 28,
        borderRadius: 999, flexDirection: "row", alignItems: "center",
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 16, elevation: 4,
    },
    createButtonText: { color: "#000", fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    disabledButton: { opacity: 0.4, shadowOpacity: 0 },
    modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 20 },
    modalCard: {
        backgroundColor: colors.surface, borderRadius: 20, padding: 24,
        maxHeight: "80%", borderWidth: 1, borderColor: colors.border,
    },
    modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 20, textAlign: "center" },
    optionItem: {
        flexDirection: "row", alignItems: "center", paddingVertical: 14,
        gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    optionText: { color: colors.text, fontSize: 16, flex: 1 },
    optionTextActive: { color: colors.primary, fontWeight: "600" },
    modalCancel: { marginTop: 16, alignItems: "center", paddingVertical: 12 },
    cancelText: { color: colors.primary, fontSize: 16, fontWeight: "700" },
    emptyContainer: { alignItems: "center", paddingVertical: 40 },
    emptyText: { color: colors.grey, textAlign: "center", marginTop: 12, fontSize: 16, fontWeight: "600" },
    emptySubtext: { color: colors.grey, textAlign: "center", marginTop: 4, fontSize: 14 },
    imageSection: { marginBottom: 24, alignItems: "center" },
    imagePreview: {
        width: 120, height: 120, borderRadius: 16, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border, overflow: "hidden",
        justifyContent: "center", alignItems: "center", marginBottom: 12,
        shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    image: { width: "100%", height: "100%" },
    imagePlaceholder: { alignItems: "center", justifyContent: "center", gap: 8 },
    placeholderText: { color: colors.grey, fontSize: 12, fontWeight: "500" },
    editIconContainer: {
        position: "absolute", bottom: 8, right: 8, backgroundColor: colors.primary,
        width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center",
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2, shadowRadius: 4,
    },
    imageHint: { color: colors.grey, fontSize: 13, textAlign: "center", alignSelf: "stretch" },
});
