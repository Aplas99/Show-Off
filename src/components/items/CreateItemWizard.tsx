import { ITEM_CONDITIONS, ITEM_CONDITION_LABELS, ItemCondition } from "@/constants/itemCondition";
import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { validateCreateItem } from "@/lib/createItemValidation";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    FlatList,
    Modal,
    Platform,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import {
    useCreateItemWithProductLookup,
    type Product
} from "@/api/items";
import { ShowcaseRow, useGetVisibleShowcases, useLinkItemToShowcases } from "@/api/showcase";
import BarcodeScannerModal from "./BarcodeScannerModal";
import ItemGenerationModal from "./ItemGenerationModal";
import ItemSuccessModal from "./ItemSuccessModal";

type Props = {
    visible: boolean;
    onClose: () => void;
    onSuccess?: (itemTitle: string, showcaseCount: number) => void;
    initialBarcode?: string;
    initialProductData?: Product;
};

type Step = 1 | 2 | 3;

interface ItemData {
    barcode: string;
    productData?: Product | null;
    condition: ItemCondition | "";
    description: string;
    price: string;
    forSale: boolean;
    selectedShowcaseIds: string[];
    imageUri: string | null;
}

export default function CreateItemWizard({
    visible,
    onClose,
    onSuccess,
    initialBarcode = "",
    initialProductData,
}: Props) {
    const router = useRouter();
    const haptics = useHaptics();

    const [currentStep, setCurrentStep] = useState<Step>(1);
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [generationModalOpen, setGenerationModalOpen] = useState(false);
    const [apiFinished, setApiFinished] = useState(false);

    const [itemData, setItemData] = useState<ItemData>({
        barcode: initialBarcode,
        productData: initialProductData || null,
        condition: "",
        description: "",
        price: "",
        forSale: false,
        selectedShowcaseIds: [],
        imageUri: null,
    });

    // Entry animation values
    const slideAnim = useSharedValue(0);
    const contentOpacity = useSharedValue(1);

    // Handle initial barcode
    useEffect(() => {
        if (initialBarcode && initialBarcode !== itemData.barcode) {
            setItemData((prev) => ({ ...prev, barcode: initialBarcode }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialBarcode]);

    // Handle initial product
    useEffect(() => {
        if (initialProductData && visible) {
            setItemData((prev) => ({
                ...prev,
                productData: initialProductData,
                barcode: initialProductData.ean || initialProductData.upc || prev.barcode,
            }));
            setCurrentStep(2);
        }
    }, [initialProductData, visible]);

    // Animate on step change
    useEffect(() => {
        slideAnim.value = 0;
        contentOpacity.value = 1;
    }, [currentStep, slideAnim, contentOpacity]);

    // API hooks
    const createItemWithProduct = useCreateItemWithProductLookup();
    const linkToShowcases = useLinkItemToShowcases();
    const { data: showcases, isLoading: loadingShowcases } = useGetVisibleShowcases();

    // Step validation
    const { isValidBarcode, barcodeType } = useMemo(() => {
        const sanitized = itemData.barcode.replace(/[\s-]/g, "").trim();
        if (!sanitized) return { isValidBarcode: false, barcodeType: "" };

        if (/^\d+$/.test(sanitized)) {
            if (sanitized.length === 13) {
                return {
                    isValidBarcode: true,
                    barcodeType: sanitized.startsWith("0") ? "UPC-A (GTIN-12)" : "EAN-13",
                };
            } else if (sanitized.length === 12) {
                return { isValidBarcode: true, barcodeType: "UPC-A (GTIN-12)" };
            }
        }
        return { isValidBarcode: false, barcodeType: "" };
    }, [itemData.barcode]);

    const canProceedToStep2 = itemData.barcode.trim() !== "";
    const canProceedToStep3 = itemData.condition !== "";
    const canCreateItem = canProceedToStep3;

    const animateStepTransition = useCallback((direction: "next" | "back") => {
        // Fade out
        contentOpacity.value = withTiming(0, { duration: 150 }, () => {
            // Update step here after fade out
            slideAnim.value = direction === "next" ? 30 : -30;

            // Fade in
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

    const handleBarcodeScanned = async (barcode: string) => {
        await haptics.success();
        const sanitizedBarcode = barcode.replace(/[\s-]/g, "").trim();
        setItemData((prev) => ({ ...prev, barcode: sanitizedBarcode }));
    };

    const handleCreateItem = async () => {
        try {
            await haptics.heavy();
            const payload = {
                searchQuery: itemData.barcode,
                customTitle: undefined,
                customBrand: undefined,
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

        onSuccess?.(
            itemData.productData?.title || "Item",
            itemData.selectedShowcaseIds.length
        );
    };

    const resetWizard = () => {
        setCurrentStep(1);
        setItemData({
            barcode: "",
            productData: null,
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

    const activeTitle = itemData.productData?.title || "";

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
                            <Ionicons name="close" size={24} color={COLORS.white} />
                        </TouchableOpacity>
                        <View style={{ alignItems: "center" }}>
                            <Text style={styles.title}>Create Item</Text>
                            {activeTitle ? (
                                <Text
                                    style={{
                                        color: COLORS.grey,
                                        fontSize: 12,
                                        marginTop: 4,
                                        maxWidth: 200,
                                    }}
                                    numberOfLines={1}
                                >
                                    {activeTitle}
                                </Text>
                            ) : null}
                        </View>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Progress Indicator */}
                    <ProgressIndicator currentStep={currentStep} />

                    {/* Content */}
                    <Animated.View style={[styles.contentContainer, contentStyle]}>
                        <KeyboardAwareScrollView
                            style={styles.content}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            bottomOffset={20}
                        >
                            {currentStep === 1 && (
                                <Step1ScanCode
                                    barcode={itemData.barcode}
                                    onBarcodeChange={(barcode) => {
                                        const sanitized = barcode.replace(/[\s-]/g, "").trim();
                                        setItemData((prev) => ({ ...prev, barcode: sanitized }));
                                    }}
                                    onBarcodeScanned={handleBarcodeScanned}
                                    isValidBarcode={isValidBarcode}
                                    barcodeType={barcodeType}
                                />
                            )}

                            {currentStep === 2 && (
                                <Step2Details
                                    productData={itemData.productData}
                                    barcode={itemData.barcode}
                                    condition={itemData.condition}
                                    description={itemData.description}
                                    onConditionChange={(c) => setItemData(prev => ({ ...prev, condition: c }))}
                                    onDescriptionChange={(d) => setItemData(prev => ({ ...prev, description: d }))}
                                    haptics={haptics}
                                    imageUri={itemData.imageUri}
                                    onImageChange={(uri) => setItemData(prev => ({ ...prev, imageUri: uri }))}
                                />
                            )}

                            {currentStep === 3 && (
                                <Step3PricingVisibility
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
                        </KeyboardAwareScrollView>
                    </Animated.View>

                    {/* Navigation */}
                    <View style={styles.navigation}>
                        {currentStep > 1 && (
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={prevStep}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.backButtonText}>Back</Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.spacer} />

                        {currentStep < 3 ? (
                            <TouchableOpacity
                                style={[
                                    styles.nextButton,
                                    (currentStep === 1 && !canProceedToStep2) ||
                                        (currentStep === 2 && !canProceedToStep3)
                                        ? styles.disabledButton
                                        : null,
                                ]}
                                onPress={nextStep}
                                disabled={
                                    (currentStep === 1 && !canProceedToStep2) ||
                                    (currentStep === 2 && !canProceedToStep3)
                                }
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
                itemTitle={activeTitle}
                showcaseCount={itemData.selectedShowcaseIds.length}
            />
        </Modal>
    );
}

// Progress Indicator Component
function ProgressIndicator({ currentStep }: { currentStep: Step }) {
    return (
        <View style={styles.progressContainer}>
            {[1, 2, 3].map((step) => (
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
    isCompleted
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, isCompleted]);

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
                    <Text style={[
                        styles.progressNumber,
                        isActive && styles.progressNumberActive
                    ]}>
                        {step}
                    </Text>
                )}
            </Animated.View>
            <Text
                style={[
                    styles.progressLabel,
                    (isActive || isCompleted) && styles.progressLabelActive,
                ]}
            >
                {step === 1 ? "Scan" : step === 2 ? "Details" : "Pricing"}
            </Text>
        </View>
    );
}

// Step Components
function Step1ScanCode({
    barcode,
    onBarcodeChange,
    onBarcodeScanned,
    isValidBarcode,
    barcodeType,
}: {
    barcode: string;
    onBarcodeChange: (val: string) => void;
    onBarcodeScanned: (val: string) => void;
    isValidBarcode: boolean;
    barcodeType: string;
}) {
    const [scannerOpen, setScannerOpen] = useState(false);

    return (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Item Identification</Text>
            <Text style={styles.stepDescription}>
                Scan a barcode or enter the product code
            </Text>

            <View style={styles.inputContainer}>
                <TextInput
                    style={[
                        styles.barcodeInput,
                        isValidBarcode && styles.barcodeInputValid
                    ]}
                    placeholder="Enter barcode or scan"
                    placeholderTextColor={COLORS.grey}
                    value={barcode}
                    onChangeText={onBarcodeChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="numeric"
                />
                <TouchableOpacity
                    style={styles.scanButton}
                    onPress={() => setScannerOpen(true)}
                    activeOpacity={0.7}
                >
                    <Ionicons name="camera" size={20} color={COLORS.white} />
                </TouchableOpacity>
            </View>

            {barcode.length > 0 && (
                <View style={styles.barcodeInfo}>
                    <View style={styles.barcodeStatusRow}>
                        <Ionicons
                            name={isValidBarcode ? "checkmark-circle" : "information-circle"}
                            size={18}
                            color={isValidBarcode ? "#4CAF50" : COLORS.grey}
                        />
                        <Text
                            style={[
                                styles.barcodeStatus,
                                isValidBarcode && styles.validBarcode,
                            ]}
                        >
                            {isValidBarcode ? barcodeType : "Enter a valid barcode"}
                        </Text>
                    </View>
                </View>
            )}

            <BarcodeScannerModal
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onBarcodeScanned={(code) => {
                    onBarcodeScanned(code);
                    setScannerOpen(false);
                }}
            />
        </View>
    );
}

function Step2Details({
    productData,
    barcode,
    condition,
    description,
    onConditionChange,
    onDescriptionChange,
    haptics,
    imageUri,
    onImageChange,
}: {
    productData?: Product | null;
    barcode: string;
    condition: ItemCondition | "";
    description: string;
    onConditionChange: (val: ItemCondition | "") => void;
    onDescriptionChange: (val: string) => void;
    haptics: ReturnType<typeof useHaptics>;
    imageUri: string | null;
    onImageChange: (uri: string | null) => void;
}) {
    const [conditionModalOpen, setConditionModalOpen] = useState(false);

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1], // Square aspect ratio typically good for items
            quality: 0.8,
            base64: false,
        });

        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB

            if (asset.fileSize && asset.fileSize > MAX_SIZE) {
                alert("Image too large. Please select an image smaller than 5MB.");
                return;
            }

            await haptics.selection();
            onImageChange(asset.uri);
        }
    };

    const displayImage = imageUri || (productData?.images && productData.images.length > 0 ? productData.images[0] : null);

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

            {productData && (
                <View style={styles.productSummary}>
                    <Text style={styles.productTitle}>{productData.title}</Text>
                    <Text style={styles.productBrand}>{productData.brand}</Text>
                </View>
            )}

            <View style={styles.imageSection}>
                <TouchableOpacity
                    style={styles.imagePreview}
                    onPress={handlePickImage}
                    activeOpacity={0.8}
                >
                    {displayImage ? (
                        <Image
                            source={{ uri: displayImage }}
                            style={styles.image}
                            contentFit="cover"
                            transition={200}
                        />
                    ) : (
                        <View style={styles.imagePlaceholder}>
                            <Ionicons name="camera-outline" size={32} color={COLORS.grey} />
                            <Text style={styles.placeholderText}>Add Photo</Text>
                        </View>
                    )}
                    <View style={styles.editIconContainer}>
                        <Ionicons name="pencil" size={12} color={COLORS.white} />
                    </View>
                </TouchableOpacity>
                <Text style={styles.imageHint}>
                    {displayImage ? "Tap to change image" : "Tap to add a photo"}
                </Text>
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
                    placeholder="Notes about this specific copy..."
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

function Step3PricingVisibility({
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

    const switchTrackColor = { false: COLORS.slate, true: COLORS.primary };

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
                        trackColor={switchTrackColor}
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
    contentContainer: {
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
        gap: 40,
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
        marginBottom: 8,
    },
    stepDescription: {
        color: COLORS.grey,
        fontSize: 15,
        marginBottom: 24,
        lineHeight: 22,
    },
    inputContainer: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 12,
    },
    barcodeInput: {
        flex: 1,
        height: 56,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        color: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        fontSize: 16,
    },
    barcodeInputValid: {
        borderColor: "#4CAF50",
    },
    scanButton: {
        width: 56,
        height: 56,
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    barcodeInfo: {
        marginBottom: 24,
    },
    barcodeStatusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    barcodeStatus: {
        fontSize: 14,
        color: COLORS.grey,
        fontWeight: "500",
    },
    validBarcode: {
        color: "#4CAF50",
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
    fieldContainer: {
        marginBottom: 24,
    },
    fieldLabel: {
        color: COLORS.white,
        fontSize: 15,
        fontWeight: "600",
        marginBottom: 10,
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
    productSummary: {
        backgroundColor: COLORS.surface,
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    productTitle: {
        color: COLORS.white,
        fontSize: 17,
        fontWeight: "600",
        marginBottom: 4,
    },
    productBrand: {
        color: COLORS.primary,
        fontSize: 14,
        fontWeight: "500",
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
    imageSection: {
        marginBottom: 24,
        alignItems: "center",
    },
    imagePreview: {
        width: 120,
        height: 120,
        borderRadius: 16,
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    image: {
        width: "100%",
        height: "100%",
    },
    imagePlaceholder: {
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    placeholderText: {
        color: COLORS.grey,
        fontSize: 12,
        fontWeight: "500",
    },
    editIconContainer: {
        position: "absolute",
        bottom: 8,
        right: 8,
        backgroundColor: COLORS.primary,
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    imageHint: {
        color: COLORS.grey,
        fontSize: 13,
        textAlign: "center",
        alignSelf: "stretch",
    },
});
