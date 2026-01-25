import { ITEM_CONDITIONS, ItemCondition } from "@/constants/itemCondition";
import { COLORS } from "@/constants/theme";
import { validateCreateItem } from "@/lib/createItemValidation";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
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

import {
    useCreateItemWithProductLookup,
    type Product
} from "@/api/items";
import { ShowcaseRow, useGetVisibleShowcases, useLinkItemToShowcases } from "@/api/showcase"; // Corrected import
import BarcodeScannerModal from "./BarcodeScannerModal";

type Props = {
    visible: boolean;
    onClose: () => void;
    onSuccess?: (itemTitle: string, showcaseCount: number) => void;
    initialBarcode?: string;
    initialProductData?: Product;
};

type Step = 1 | 2 | 3;

interface ItemData {
    // Step 1: Item Identification
    barcode: string;
    productData?: Product | null;

    // Step 2: Item Details
    condition: ItemCondition | "";
    description: string;

    // Step 3: Pricing & Visibility
    price: string;
    forSale: boolean;
    selectedShowcaseIds: string[];
}

export default function CreateItemWizard({
    visible,
    onClose,
    onSuccess,
    initialBarcode = "",
    initialProductData,
}: Props) {
    const router = useRouter();

    const [currentStep, setCurrentStep] = useState<Step>(1);
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [itemData, setItemData] = useState<ItemData>({
        barcode: initialBarcode,
        productData: initialProductData || null,
        condition: "",
        description: "",
        price: "",
        forSale: false,
        selectedShowcaseIds: [],
    });

    // Update barcode when initialBarcode changes
    React.useEffect(() => {
        if (initialBarcode) {
            setItemData((prev) => {
                if (initialBarcode !== prev.barcode) {
                    return { ...prev, barcode: initialBarcode };
                }
                return prev;
            });
        }
    }, [initialBarcode]);

    // Handle initial product data (skip to step 2 if provided)
    React.useEffect(() => {
        if (initialProductData && visible) {
            setItemData((prev) => ({
                ...prev,
                productData: initialProductData,
                barcode:
                    initialProductData.ean || initialProductData.upc || prev.barcode,
            }));
            setCurrentStep(2);
        }
    }, [initialProductData, visible]);

    // API hooks
    const createItemWithProduct = useCreateItemWithProductLookup();
    const linkToShowcases = useLinkItemToShowcases();
    const { data: showcases, isLoading: loadingShowcases } =
        useGetVisibleShowcases();

    // Step 1: Detect if barcode is valid
    const { isValidBarcode, barcodeType } = useMemo(() => {
        // Remove all spaces and dashes, then trim
        const sanitized = itemData.barcode.replace(/[\s-]/g, "").trim();

        if (!sanitized) return { isValidBarcode: false, barcodeType: "" };

        // Check if it's all digits
        if (/^\d+$/.test(sanitized)) {
            if (sanitized.length === 13) {
                return {
                    isValidBarcode: true,
                    barcodeType: sanitized.startsWith("0")
                        ? "UPC-A (GTIN-12)"
                        : "EAN-13 (ISBN/GTIN-13)",
                };
            } else if (sanitized.length === 12) {
                return { isValidBarcode: true, barcodeType: "UPC-A (GTIN-12)" };
            } else if (sanitized.length === 8) {
                return { isValidBarcode: true, barcodeType: "EAN-8" };
            } else if (sanitized.length >= 10 && sanitized.length <= 14) {
                return { isValidBarcode: true, barcodeType: "GTIN" };
            }
        }

        return { isValidBarcode: false, barcodeType: "" };
    }, [itemData.barcode]);

    // Step navigation
    const canProceedToStep2 = itemData.barcode.trim() !== "";
    const canProceedToStep3 = itemData.condition !== "";
    const canCreateItem =
        itemData.condition !== "" && itemData.barcode.trim() !== "";

    const nextStep = () => {
        if (currentStep < 3) {
            setCurrentStep((prev) => (prev + 1) as Step);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep((prev) => (prev - 1) as Step);
        }
    };

    const handleBarcodeScanned = (barcode: string) => {
        // Sanitize barcode by removing spaces and dashes
        const sanitizedBarcode = barcode.replace(/[\s-]/g, "").trim();
        setItemData((prev) => ({ ...prev, barcode: sanitizedBarcode }));
    };

    const handleCreateItem = async () => {
        try {
            const payload = {
                searchQuery: itemData.barcode,
                condition: itemData.condition as ItemCondition,
                userDescription: itemData.description || null,
                forSale: itemData.forSale,
                price: itemData.price.trim() !== "" ? Number(itemData.price) : null,
                imageUrl: null,
            };

            validateCreateItem(payload);

            const res = await createItemWithProduct.mutateAsync(payload);

            // Link to selected showcases
            if (itemData.selectedShowcaseIds.length > 0 && res?.itemId) {
                await linkToShowcases.mutateAsync({
                    itemId: res.itemId,
                    showcaseIds: itemData.selectedShowcaseIds,
                });
            }

            // Show success modal instead of closing immediately
            setSuccessModalOpen(true);
        } catch (error) {
            console.error("Error creating item:", error);
            alert(error instanceof Error ? error.message : "Failed to create item");
        }
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
        });
    };

    const handleClose = () => {
        resetWizard();
        onClose();
    };

    const handleCreateAnother = () => {
        setSuccessModalOpen(false);
        resetWizard();
    };

    const handleFinish = () => {
        setSuccessModalOpen(false);
        resetWizard();
        onSuccess?.(
            itemData.productData?.title || "Item",
            itemData.selectedShowcaseIds.length
        );
        onClose();
    };

    const toggleShowcase = (id: string) => {
        setItemData((prev) => ({
            ...prev,
            selectedShowcaseIds: prev.selectedShowcaseIds.includes(id)
                ? prev.selectedShowcaseIds.filter((x) => x !== id)
                : [...prev.selectedShowcaseIds, id],
        }));
    };

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
                    keyboardVerticalOffset={0}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={handleClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={24} color={COLORS.white} />
                        </TouchableOpacity>
                        <View style={{ alignItems: "center" }}>
                            <Text style={styles.title}>
                                Create Item
                            </Text>
                            {itemData.productData?.title && (
                                <Text
                                    style={{
                                        color: COLORS.grey,
                                        fontSize: 12,
                                        marginTop: 4,
                                        maxWidth: 200,
                                    }}
                                    numberOfLines={1}
                                >
                                    {itemData.productData.title}
                                </Text>
                            )}
                        </View>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Progress Indicator */}
                    <View style={styles.progressContainer}>
                        {[1, 2, 3].map((step) => (
                            <View key={step} style={styles.progressStep}>
                                <View
                                    style={[
                                        styles.progressDot,
                                        currentStep >= step && styles.progressDotActive,
                                    ]}
                                />
                                <Text
                                    style={[
                                        styles.progressLabel,
                                        currentStep >= step && styles.progressLabelActive,
                                    ]}
                                >
                                    {step === 1 ? "Scan" : step === 2 ? "Details" : "Pricing"}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Step Content */}
                    <ScrollView
                        style={styles.content}
                        keyboardShouldPersistTaps="handled"
                    >
                        {currentStep === 1 && (
                            <Step1ScanCode
                                barcode={itemData.barcode}
                                onBarcodeChange={(barcode) => {
                                    const sanitizedBarcode = barcode.replace(/[\s-]/g, "").trim();
                                    setItemData((prev) => ({
                                        ...prev,
                                        barcode: sanitizedBarcode,
                                    }));
                                }}
                                onBarcodeScanned={handleBarcodeScanned}
                                isValidBarcode={isValidBarcode}
                                barcodeType={barcodeType}
                            />
                        )}

                        {currentStep === 2 && (
                            <Step2ConditionDescription
                                condition={itemData.condition}
                                description={itemData.description}
                                onConditionChange={(condition) =>
                                    setItemData((prev) => ({ ...prev, condition }))
                                }
                                onDescriptionChange={(description) =>
                                    setItemData((prev) => ({ ...prev, description }))
                                }
                            />
                        )}

                        {currentStep === 3 && (
                            <Step3PricingVisibility
                                price={itemData.price}
                                forSale={itemData.forSale}
                                selectedShowcaseIds={itemData.selectedShowcaseIds}
                                onPriceChange={(price) =>
                                    setItemData((prev) => ({ ...prev, price }))
                                }
                                onForSaleChange={(forSale) =>
                                    setItemData((prev) => ({ ...prev, forSale }))
                                }
                                onToggleShowcase={toggleShowcase}
                                showcases={showcases || []}
                                loadingShowcases={loadingShowcases}
                            />
                        )}
                    </ScrollView>

                    {/* Navigation */}
                    <View style={styles.navigation}>
                        {currentStep > 1 && (
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={prevStep}
                            >
                                <Text style={styles.backButtonText}>Back</Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.spacer} />

                        {currentStep < 3 ? (
                            <TouchableOpacity
                                style={[
                                    styles.nextButton,
                                    (!canProceedToStep2 && currentStep === 1) ||
                                        (!canProceedToStep3 && currentStep === 2)
                                        ? styles.disabledButton
                                        : null,
                                ]}
                                onPress={nextStep}
                                disabled={
                                    (!canProceedToStep2 && currentStep === 1) ||
                                    (!canProceedToStep3 && currentStep === 2)
                                }
                            >
                                <Text style={styles.nextButtonText}>Next</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[
                                    styles.createButton,
                                    !canCreateItem || createItemWithProduct.isPending
                                        ? styles.disabledButton
                                        : null,
                                ]}
                                onPress={handleCreateItem}
                                disabled={!canCreateItem || createItemWithProduct.isPending}
                            >
                                {createItemWithProduct.isPending ? (
                                    <ActivityIndicator color={COLORS.white} />
                                ) : (
                                    <Text style={styles.createButtonText}>Create Item</Text>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </View>

            {/* Success Modal */}
            <Modal
                visible={successModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setSuccessModalOpen(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.successIcon}>
                            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
                        </View>
                        <Text style={styles.successTitle}>Item Created Successfully!</Text>
                        <Text style={styles.successMessage}>
                            Your item has been added to {itemData.selectedShowcaseIds.length}{" "}
                            showcase(s).
                        </Text>
                        <View style={styles.successActions}>
                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={handleCreateAnother}
                            >
                                <Text style={styles.secondaryButtonText}>Create Another</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={handleFinish}
                            >
                                <Text style={styles.primaryButtonText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

// Step 1: Scan/Code Entry
function Step1ScanCode({
    barcode,
    onBarcodeChange,
    onBarcodeScanned,
    isValidBarcode,
    barcodeType,
}: {
    barcode: string;
    onBarcodeChange: (barcode: string) => void;
    onBarcodeScanned: (barcode: string) => void;
    isValidBarcode: boolean;
    barcodeType: string;
}) {
    const [scannerOpen, setScannerOpen] = useState(false);

    return (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Item Identification</Text>
            <Text style={styles.stepDescription}>
                Scan a barcode or enter the product code manually
            </Text>

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.barcodeInput}
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
                >
                    <Ionicons name="camera" size={20} color={COLORS.white} />
                </TouchableOpacity>
            </View>

            {barcode.length > 0 && (
                <View style={styles.barcodeInfo}>
                    <Text
                        style={[
                            styles.barcodeStatus,
                            isValidBarcode ? styles.validBarcode : { color: COLORS.white },
                        ]}
                    >
                        {isValidBarcode ? `✓ ${barcodeType}` : "Search term"}
                    </Text>
                    <Text style={styles.barcodeHint}>
                        Spaces and dashes are automatically removed
                    </Text>
                </View>
            )}

            <BarcodeScannerModal
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onBarcodeScanned={(barcode) => {
                    onBarcodeScanned(barcode);
                    setScannerOpen(false);
                }}
            />
        </View>
    );
}

// Step 2: Condition & Description
function Step2ConditionDescription({
    condition,
    description,
    onConditionChange,
    onDescriptionChange,
}: {
    condition: ItemCondition | "";
    description: string;
    onConditionChange: (condition: ItemCondition | "") => void;
    onDescriptionChange: (description: string) => void;
}) {
    const [conditionModalOpen, setConditionModalOpen] = useState(false);

    return (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Item Details</Text>
            <Text style={styles.stepDescription}>
                Describe the condition and add any notes
            </Text>

            {/* Condition Selection */}
            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Condition *</Text>
                <TouchableOpacity
                    style={styles.selectorButton}
                    onPress={() => setConditionModalOpen(true)}
                >
                    <Text style={styles.selectorText}>
                        {condition || "Select Condition"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={COLORS.white} />
                </TouchableOpacity>
            </View>

            {/* Description */}
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

            {/* Condition Modal */}
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
                                    onPress={() => {
                                        onConditionChange(item);
                                        setConditionModalOpen(false);
                                    }}
                                >
                                    <Ionicons
                                        name={
                                            condition === item
                                                ? "radio-button-on"
                                                : "radio-button-off"
                                        }
                                        size={20}
                                        color={condition === item ? COLORS.primary : COLORS.white}
                                    />
                                    <Text style={styles.optionText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity
                            style={styles.modalCancel}
                            onPress={() => setConditionModalOpen(false)}
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
function Step3PricingVisibility({
    price,
    forSale,
    selectedShowcaseIds,
    onPriceChange,
    onForSaleChange,
    onToggleShowcase,
    showcases,
    loadingShowcases,
}: {
    price: string;
    forSale: boolean;
    selectedShowcaseIds: string[];
    onPriceChange: (price: string) => void;
    onForSaleChange: (forSale: boolean) => void;
    onToggleShowcase: (id: string) => void;
    showcases: ShowcaseRow[];
    loadingShowcases: boolean;
}) {
    const [showcaseModalOpen, setShowcaseModalOpen] = useState(false);

    return (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Pricing & Visibility</Text>
            <Text style={styles.stepDescription}>
                Set pricing and choose which showcases to add this item to
            </Text>

            {/* Price Input - Always visible */}
            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Price (USD)</Text>
                <Text style={styles.fieldHint}>Enter the item's value (optional)</Text>
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

            {/* Sale Toggle */}
            <View style={styles.fieldContainer}>
                <View style={styles.switchRow}>
                    <Text style={styles.fieldLabel}>For Sale</Text>
                    <Switch
                        value={forSale}
                        onValueChange={onForSaleChange}
                        trackColor={{ false: COLORS.slate, true: COLORS.primary }}
                        thumbColor={COLORS.white}
                    />
                </View>
                <Text style={styles.fieldHint}>
                    Toggle if you want to sell this item
                </Text>
            </View>

            {/* Showcase Selection */}
            <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Add to Showcase(s)</Text>
                <TouchableOpacity
                    style={styles.selectorButton}
                    onPress={() => setShowcaseModalOpen(true)}
                    disabled={loadingShowcases}
                >
                    <Ionicons name="albums-outline" size={18} color={COLORS.white} />
                    <Text style={styles.selectorText}>
                        {selectedShowcaseIds.length === 0
                            ? "Select showcase(s)"
                            : `${selectedShowcaseIds.length} selected`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Showcase Modal */}
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
                                const label =
                                    item.name ||
                                    (item.is_default
                                        ? "Default showcase"
                                        : `Showcase ${item.id.slice(0, 6)}…`);
                                return (
                                    <TouchableOpacity
                                        style={styles.optionItem}
                                        onPress={() => onToggleShowcase(item.id)}
                                    >
                                        <Ionicons
                                            name={checked ? "checkbox" : "square-outline"}
                                            size={20}
                                            color={checked ? COLORS.primary : COLORS.white}
                                        />
                                        <Text style={styles.optionText}>{label}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <Text style={styles.emptyText}>
                                    No showcases found. Create one first.
                                </Text>
                            }
                        />
                        <TouchableOpacity
                            style={styles.modalCancel}
                            onPress={() => setShowcaseModalOpen(false)}
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
        borderBottomWidth: 1,
        borderBottomColor: "#333", // Using hex for simpler styling
    },
    title: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "600",
    },
    progressContainer: {
        flexDirection: "row",
        justifyContent: "center",
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#333",
    },
    progressStep: {
        alignItems: "center",
        marginHorizontal: 16,
    },
    progressDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: "#333",
        marginBottom: 8,
    },
    progressDotActive: {
        backgroundColor: COLORS.primary,
    },
    progressLabel: {
        color: COLORS.grey,
        fontSize: 12,
        fontWeight: "500",
    },
    progressLabelActive: {
        color: COLORS.white,
    },
    content: {
        flex: 1,
        padding: 20,
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        color: COLORS.white,
        fontSize: 20,
        fontWeight: "600",
        marginBottom: 8,
    },
    stepDescription: {
        color: COLORS.grey,
        fontSize: 14,
        marginBottom: 24,
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    barcodeInput: {
        flex: 1,
        height: 50,
        borderWidth: 1,
        borderColor: "#333",
        borderRadius: 8,
        paddingHorizontal: 16,
        backgroundColor: COLORS.surface,
        color: COLORS.white,
        fontSize: 16,
        marginRight: 12,
    },
    scanButton: {
        height: 50,
        width: 50,
        backgroundColor: COLORS.primary,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    barcodeInfo: {
        marginTop: 8,
    },
    barcodeStatus: {
        fontSize: 14,
        fontWeight: "500",
    },
    validBarcode: {
        color: "#10B981",
    },
    barcodeHint: {
        color: COLORS.grey,
        fontSize: 12,
        marginTop: 4,
        fontStyle: "italic",
    },
    fieldContainer: {
        marginBottom: 20,
    },
    fieldLabel: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "500",
        marginBottom: 8,
    },
    fieldHint: {
        color: COLORS.grey,
        fontSize: 12,
        marginBottom: 8,
        fontStyle: "italic",
    },
    selectorButton: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#333",
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.surface,
    },
    selectorText: {
        color: COLORS.white,
        fontSize: 16,
        flex: 1,
        marginLeft: 8,
    },
    descriptionInput: {
        height: 100,
        borderWidth: 1,
        borderColor: "#333",
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.surface,
        color: COLORS.white,
        fontSize: 16,
        textAlignVertical: "top",
    },
    switchRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    priceInputContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#333",
        borderRadius: 8,
        backgroundColor: COLORS.surface,
        paddingHorizontal: 16,
    },
    currencySymbol: {
        fontSize: 16,
        color: COLORS.white,
        marginRight: 8,
    },
    priceInput: {
        flex: 1,
        height: 50,
        fontSize: 16,
        color: COLORS.white,
    },
    navigation: {
        flexDirection: "row",
        alignItems: "center",
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: "#333",
    },
    backButton: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#333",
    },
    backButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "500",
    },
    spacer: {
        flex: 1,
    },
    nextButton: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    nextButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "600",
    },
    createButton: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    createButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "600",
    },
    disabledButton: {
        backgroundColor: COLORS.grey,
        opacity: 0.5,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.6)",
        justifyContent: "center",
        padding: 20,
    },
    modalCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 20,
        maxHeight: "70%",
    },
    modalTitle: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 20,
    },
    optionItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#333",
    },
    optionText: {
        color: COLORS.white,
        fontSize: 16,
        marginLeft: 12,
    },
    modalCancel: {
        alignSelf: "flex-end",
        marginTop: 20,
    },
    cancelText: {
        color: COLORS.primary,
        fontSize: 16,
        fontWeight: "600",
    },
    emptyText: {
        color: COLORS.grey,
        textAlign: "center",
        paddingVertical: 20,
    },
    // Success Modal Styles
    successIcon: {
        alignItems: "center",
        marginBottom: 20,
    },
    successTitle: {
        color: COLORS.white,
        fontSize: 20,
        fontWeight: "600",
        textAlign: "center",
        marginBottom: 8,
    },
    successMessage: {
        color: COLORS.grey,
        fontSize: 14,
        textAlign: "center",
        marginBottom: 24,
        lineHeight: 20,
    },
    successActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    secondaryButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#333",
        alignItems: "center",
    },
    secondaryButtonText: {
        color: COLORS.white,
        fontSize: 14,
        fontWeight: "500",
        textAlign: "center",
    },
    primaryButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: COLORS.primary,
        alignItems: "center",
    },
    primaryButtonText: {
        color: COLORS.white,
        fontSize: 14,
        fontWeight: "600",
        textAlign: "center",
    },
});
