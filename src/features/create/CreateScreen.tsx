import { useProductSearch, type Product } from "@/api/items";
import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import BarcodeScannerModal from "@/src/components/items/BarcodeScannerModal";
import CreateItemWizard from "@/src/components/items/CreateItemWizard";
import ManualCreateItemWizard from "@/src/components/items/ManualCreateItemWizard";
import {
    PulseLoader,
    SkeletonSearchResults,
} from "@/src/components/ui/SkeletonLoader";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
import {
    FlatList,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type InputMode = "barcode" | "manual" | "search";

const CATEGORIES = [
    "Electronics",
    "Media",
    "Toys",
    "Games",
    "Apparel",
    "Home",
    "Garden",
    "Sports",
    "Automotive",
    "Office",
    "Health & Beauty",
    "Food & Beverages",
    "Arts & Crafts",
    "Pet Supplies",
    "Books",
    "Music",
    "Movies",
];

export default function Create() {
    const insets = useSafeAreaInsets();
    const haptics = useHaptics();

    const [wizardVisible, setWizardVisible] = useState(false);
    const [inputMode, setInputMode] = useState<InputMode>("barcode");
    const [barcodeInput, setBarcodeInput] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [wizardMode, setWizardMode] = useState<"barcode" | "manual">("barcode");

    // Advanced filters state
    const [brandInput, setBrandInput] = useState("");
    const [manufacturerInput, setManufacturerInput] = useState("");
    const [categoryInput, setCategoryInput] = useState("");
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);

    const [searchParams, setSearchParams] = useState({
        query: "",
        brand: "",
        manufacturer: "",
        category: "",
    });

    const [scannerOpen, setScannerOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
    } = useProductSearch(searchParams);

    const searchResults = data?.pages.flatMap((page) => page.items) || [];

    // Tab indicator animation
    const tabIndicatorX = useSharedValue(0);

    useEffect(() => {
        const tabIndex = inputMode === "barcode" ? 0 : inputMode === "manual" ? 1 : 2;
        tabIndicatorX.value = withSpring(tabIndex * (100 / 3) + "%" as any, {
            damping: 15,
            stiffness: 200,
        });
    }, [inputMode, tabIndicatorX]);

    const handleWizardSuccess = useCallback(
        async (itemTitle: string, showcaseCount: number) => {
            await haptics.success();
            console.log(`Created ${itemTitle} in ${showcaseCount} showcase(s)`);
        },
        [haptics]
    );

    const handleWizardClose = useCallback(async () => {
        await haptics.light();
        setWizardVisible(false);
        setBarcodeInput("");
        setSelectedProduct(undefined);
        setWizardMode("barcode");
    }, [haptics]);

    const handleBarcodeScanned = useCallback(
        async (barcode: string) => {
            await haptics.success();
            setBarcodeInput(barcode);
            setScannerOpen(false);
            setSelectedProduct(undefined);
            setWizardVisible(true);
        },
        [haptics]
    );

    const handleBarcodeSubmit = useCallback(async () => {
        if (barcodeInput.trim()) {
            await haptics.medium();
            setSelectedProduct(undefined);
            setWizardVisible(true);
        }
    }, [barcodeInput, haptics]);

    const handleSearchSubmit = useCallback(async () => {
        if (searchInput.trim()) {
            await haptics.medium();
            setSearchParams({
                query: searchInput.trim(),
                brand: brandInput.trim(),
                manufacturer: manufacturerInput.trim(),
                category: categoryInput.trim(),
            });
        }
    }, [searchInput, brandInput, manufacturerInput, categoryInput, haptics]);

    const handleProductSelect = useCallback(
        async (product: Product) => {
            await haptics.selection();
            setSelectedProduct(product);
            setWizardVisible(true);
        },
        [haptics]
    );

    const handleModeSwitch = useCallback(
        async (mode: InputMode) => {
            await haptics.light();
            setInputMode(mode);
            if (mode === "barcode" || mode === "manual") {
                setSearchParams({
                    query: "",
                    brand: "",
                    manufacturer: "",
                    category: "",
                });
            }
        },
        [haptics]
    );

    const handleOpenCategoryModal = useCallback(async () => {
        await haptics.light();
        setCategoryModalOpen(true);
    }, [haptics]);

    const handleCloseCategoryModal = useCallback(async () => {
        await haptics.light();
        setCategoryModalOpen(false);
    }, [haptics]);

    const handleSelectCategory = useCallback(
        async (category: string) => {
            await haptics.selection();
            setCategoryInput(category);
            setCategoryModalOpen(false);
        },
        [haptics]
    );

    const handleClearCategory = useCallback(async () => {
        await haptics.light();
        setCategoryInput("");
        setCategoryModalOpen(false);
    }, [haptics]);

    const handleCreateManually = useCallback(async () => {
        await haptics.medium();
        setWizardMode("manual");
        setWizardVisible(true);
    }, [haptics]);

    const renderSearchResult = useCallback(
        ({ item, index }: { item: Product; index: number }) => (
            <SearchResultItem
                item={item}
                index={index}
                onPress={() => handleProductSelect(item)}
            />
        ),
        [handleProductSelect]
    );

    const renderFooter = useCallback(() => {
        if (!isFetchingNextPage) return null;
        return (
            <View style={styles.footerLoader}>
                <PulseLoader size="small" />
            </View>
        );
    }, [isFetchingNextPage]);

    return (
        <View
            style={styles.container}
        >
            <StatusBar barStyle="light-content" />
            <View
                style={[
                    styles.contentContainer,
                    { paddingTop: insets.top + 20, paddingBottom: insets.bottom },
                ]}
            >
                {/* Fixed Header Section */}
                <View style={styles.fixedHeader}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Create New Item</Text>
                        <Text style={styles.description}>
                            Scan a barcode or search for an item to get started
                        </Text>
                    </View>

                    {/* Tab Selector */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[
                                styles.tab,
                                inputMode === "barcode" && styles.activeTab,
                            ]}
                            onPress={() => handleModeSwitch("barcode")}
                            activeOpacity={0.8}
                        >
                            <Ionicons
                                name="barcode-outline"
                                size={20}
                                color={
                                    inputMode === "barcode" ? COLORS.white : COLORS.grey
                                }
                            />
                            <Text
                                style={[
                                    styles.tabText,
                                    inputMode === "barcode" && styles.activeTabText,
                                ]}
                            >
                                Barcode
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.tab,
                                inputMode === "manual" && styles.activeTab,
                            ]}
                            onPress={() => handleModeSwitch("manual")}
                            activeOpacity={0.8}
                        >
                            <Ionicons
                                name="create-outline"
                                size={20}
                                color={
                                    inputMode === "manual" ? COLORS.white : COLORS.grey
                                }
                            />
                            <Text
                                style={[
                                    styles.tabText,
                                    inputMode === "manual" && styles.activeTabText,
                                ]}
                            >
                                Manual
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.tab,
                                inputMode === "search" && styles.activeTab,
                            ]}
                            onPress={() => handleModeSwitch("search")}
                            activeOpacity={0.8}
                        >
                            <Ionicons
                                name="search-outline"
                                size={20}
                                color={
                                    inputMode === "search" ? COLORS.white : COLORS.grey
                                }
                            />
                            <Text
                                style={[
                                    styles.tabText,
                                    inputMode === "search" && styles.activeTabText,
                                ]}
                            >
                                Search
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Scrollable Content */}
                <View style={styles.flexContent}>
                    {inputMode === "barcode" && (
                        <ScrollView
                            contentContainerStyle={styles.scrollPadding}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <View style={styles.formSection}>
                                <Text style={styles.sectionTitle}>
                                    Scan or Enter Barcode
                                </Text>
                                <View style={styles.inputGroup}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter barcode manually"
                                        placeholderTextColor={COLORS.grey}
                                        value={barcodeInput}
                                        onChangeText={setBarcodeInput}
                                        keyboardType="numeric"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="done"
                                        onSubmitEditing={handleBarcodeSubmit}
                                    />
                                    <TouchableOpacity
                                        style={styles.scanButton}
                                        onPress={() => setScannerOpen(true)}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons
                                            name="camera"
                                            size={24}
                                            color={COLORS.white}
                                        />
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    style={[
                                        styles.submitButton,
                                        !barcodeInput.trim() && styles.disabledButton,
                                    ]}
                                    onPress={handleBarcodeSubmit}
                                    disabled={!barcodeInput.trim()}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.submitButtonText}>
                                        Continue
                                    </Text>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={20}
                                        color={COLORS.white}
                                        style={{ marginLeft: 8 }}
                                    />
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    )}

                    {inputMode === "manual" && (
                        <View style={styles.manualCenterContent}>
                            <View style={styles.manualIconContainer}>
                                <Ionicons
                                    name="create-outline"
                                    size={48}
                                    color={COLORS.primary}
                                />
                            </View>
                            <Text style={styles.sectionTitle}>
                                Create Custom Item
                            </Text>
                            <Text style={styles.description}>
                                Enter item details manually without a barcode.
                            </Text>
                            <TouchableOpacity
                                style={[styles.submitButton, { marginTop: 24, paddingHorizontal: 32 }]}
                                onPress={handleCreateManually}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.submitButtonText}>
                                    Start Creation
                                </Text>
                                <Ionicons
                                    name="arrow-forward"
                                    size={20}
                                    color={COLORS.white}
                                    style={{ marginLeft: 8 }}
                                />
                            </TouchableOpacity>
                        </View>
                    )}

                    {inputMode === "search" && (
                        <View style={styles.searchContainer}>
                            <View style={styles.searchFormSection}>
                                <View style={styles.inputGroup}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Search by name, brand, etc."
                                        placeholderTextColor={COLORS.grey}
                                        value={searchInput}
                                        onChangeText={setSearchInput}
                                        onSubmitEditing={handleSearchSubmit}
                                        returnKeyType="search"
                                        autoCapitalize="words"
                                        autoCorrect={true}
                                    />
                                    <TouchableOpacity
                                        style={[
                                            styles.searchButtonIcon,
                                            !searchInput.trim() &&
                                            styles.searchButtonDisabled,
                                        ]}
                                        onPress={handleSearchSubmit}
                                        disabled={!searchInput.trim()}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons
                                            name="search"
                                            size={24}
                                            color={
                                                searchInput.trim()
                                                    ? COLORS.white
                                                    : COLORS.grey
                                            }
                                        />
                                    </TouchableOpacity>
                                </View>

                                {/* Optional Filters */}
                                <View style={styles.filtersContainer}>
                                    <Text style={styles.filtersHint}>
                                        Optional filters (enhances results)
                                    </Text>

                                    <View style={styles.filterRow}>
                                        <TextInput
                                            style={[
                                                styles.filterInput,
                                                { flex: 1, marginRight: 8 },
                                            ]}
                                            placeholder="Brand"
                                            placeholderTextColor={COLORS.grey}
                                            value={brandInput}
                                            onChangeText={setBrandInput}
                                            autoCapitalize="words"
                                        />
                                        <TextInput
                                            style={[styles.filterInput, { flex: 1 }]}
                                            placeholder="Manufacturer"
                                            placeholderTextColor={COLORS.grey}
                                            value={manufacturerInput}
                                            onChangeText={setManufacturerInput}
                                            autoCapitalize="words"
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={styles.categorySelector}
                                        onPress={handleOpenCategoryModal}
                                        activeOpacity={0.8}
                                    >
                                        <Text
                                            style={[
                                                styles.categoryText,
                                                !categoryInput && { color: COLORS.grey },
                                            ]}
                                        >
                                            {categoryInput || "Select Category"}
                                        </Text>
                                        <Ionicons
                                            name="chevron-down"
                                            size={16}
                                            color={COLORS.grey}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Search Results List */}
                            {isLoading ? (
                                <View style={styles.loadingContainer}>
                                    <PulseLoader
                                        text="Searching products..."
                                        size="large"
                                    />
                                    <View style={styles.skeletonContainer}>
                                        <SkeletonSearchResults count={4} />
                                    </View>
                                </View>
                            ) : isError ? (
                                <View style={styles.centerContent}>
                                    <View style={styles.errorIconContainer}>
                                        <Ionicons
                                            name="alert-circle-outline"
                                            size={48}
                                            color={COLORS.secondary}
                                        />
                                    </View>
                                    <Text style={styles.errorText}>
                                        Something went wrong
                                    </Text>
                                    <Text style={styles.errorSubtext}>
                                        Please try again
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.retryButton}
                                        onPress={handleSearchSubmit}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.retryButtonText}>
                                            Retry Search
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ) : searchParams.query && searchResults.length === 0 ? (
                                <View style={styles.centerContent}>
                                    <View style={styles.emptyIconContainer}>
                                        <Ionicons
                                            name="search-outline"
                                            size={48}
                                            color={COLORS.grey}
                                        />
                                    </View>
                                    <Text style={styles.emptyText}>
                                        No products found
                                    </Text>
                                    <Text style={styles.emptySubtext}>
                                        Try adjusting your search or filters
                                    </Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={searchResults}
                                    renderItem={renderSearchResult}
                                    keyExtractor={(item, index) =>
                                        `${item.ean || item.upc || index}-${index}`
                                    }
                                    contentContainerStyle={styles.listContent}
                                    showsVerticalScrollIndicator={false}
                                    onEndReached={() => {
                                        if (hasNextPage) fetchNextPage();
                                    }}
                                    onEndReachedThreshold={0.5}
                                    ListFooterComponent={renderFooter}
                                    keyboardShouldPersistTaps="handled"
                                />
                            )}
                        </View>
                    )}
                </View>
            </View>

            {/* Category Selection Modal */}
            <Modal
                visible={categoryModalOpen}
                transparent
                animationType="fade"
                onRequestClose={handleCloseCategoryModal}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Select Category</Text>
                        <FlatList
                            data={CATEGORIES}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.categoryOption}
                                    onPress={() => handleSelectCategory(item)}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.categoryOptionText,
                                            categoryInput === item && {
                                                color: COLORS.primary,
                                            },
                                        ]}
                                    >
                                        {item}
                                    </Text>
                                    {categoryInput === item && (
                                        <Ionicons
                                            name="checkmark"
                                            size={20}
                                            color={COLORS.primary}
                                        />
                                    )}
                                </TouchableOpacity>
                            )}
                            showsVerticalScrollIndicator={false}
                        />
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                onPress={handleClearCategory}
                                style={{ marginRight: 20 }}
                                activeOpacity={0.7}
                            >
                                <Text style={{ color: COLORS.grey }}>Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleCloseCategoryModal}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={{
                                        color: COLORS.primary,
                                        fontWeight: "600",
                                    }}
                                >
                                    Close
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Barcode Scanner Modal */}
            <BarcodeScannerModal
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onBarcodeScanned={handleBarcodeScanned}
            />

            {/* Wizards */}
            {wizardMode === "barcode" && (
                <CreateItemWizard
                    visible={wizardVisible && wizardMode === "barcode"}
                    onClose={handleWizardClose}
                    onSuccess={handleWizardSuccess}
                    initialBarcode={
                        selectedProduct?.ean || selectedProduct?.upc || barcodeInput
                    }
                    initialProductData={selectedProduct}
                />
            )}

            {wizardMode === "manual" && (
                <ManualCreateItemWizard
                    visible={wizardVisible && wizardMode === "manual"}
                    onClose={handleWizardClose}
                    onSuccess={handleWizardSuccess}
                />
            )}
        </View>
    );
}

// Animated search result item
function SearchResultItem({
    item,
    index,
    onPress,
}: {
    item: Product;
    index: number;
    onPress: () => void;
}) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(20);

    useEffect(() => {
        opacity.value = withDelay(
            index * 50,
            withTiming(1, { duration: 300 })
        );
        translateY.value = withDelay(
            index * 50,
            withSpring(0, { damping: 15, stiffness: 150 })
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index]);

    const handlePressIn = () => {
        scale.value = withTiming(0.98, { duration: 100 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }, { translateY: translateY.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={animatedStyle}>
            <TouchableOpacity
                style={styles.resultItem}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
            >
                <View style={styles.resultImageContainer}>
                    {item.images && item.images.length > 0 ? (
                        <Image
                            source={{ uri: item.images[0] }}
                            style={styles.resultImage}
                            contentFit="contain"
                            transition={200}
                        />
                    ) : (
                        <Ionicons
                            name="image-outline"
                            size={24}
                            color={COLORS.grey}
                        />
                    )}
                </View>
                <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={2}>
                        {item.title}
                    </Text>
                    {item.brand && (
                        <Text style={styles.resultBrand} numberOfLines={1}>
                            {item.brand}
                        </Text>
                    )}
                    <View style={styles.resultMeta}>
                        {item.category && (
                            <Text style={styles.resultCategory} numberOfLines={1}>
                                {item.category}
                            </Text>
                        )}
                        {item.ean && (
                            <Text style={styles.resultEan}>EAN: {item.ean}</Text>
                        )}
                    </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    contentContainer: {
        flex: 1,
    },
    fixedHeader: {
        paddingHorizontal: 20,
    },
    flexContent: {
        flex: 1,
    },
    scrollPadding: {
        paddingHorizontal: 20,
    },
    header: {
        alignItems: "center",
        marginBottom: 24,
    },
    title: {
        color: COLORS.white,
        fontSize: 32,
        fontWeight: "800",
        marginBottom: 8,
        textAlign: "center",
    },
    description: {
        color: COLORS.grey,
        fontSize: 16,
        textAlign: "center",
        lineHeight: 24,
    },
    // Tab Styles
    tabContainer: {
        flexDirection: "row",
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 4,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    tab: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 8,
    },
    activeTab: {
        backgroundColor: COLORS.surfaceLight,
    },
    tabText: {
        color: COLORS.grey,
        fontSize: 15,
        fontWeight: "600",
    },
    activeTabText: {
        color: COLORS.white,
    },
    // Form Styles
    formSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        color: COLORS.white,
        fontSize: 20,
        fontWeight: "700",
        marginBottom: 16,
    },
    inputGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
    },
    input: {
        flex: 1,
        height: 56,
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        paddingHorizontal: 16,
        color: COLORS.white,
        fontSize: 16,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    scanButton: {
        width: 56,
        height: 56,
        backgroundColor: COLORS.primary,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    searchButtonIcon: {
        width: 56,
        height: 56,
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    searchButtonDisabled: {
        opacity: 0.5,
    },
    submitButton: {
        backgroundColor: COLORS.primary,
        height: 56,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    disabledButton: {
        backgroundColor: COLORS.surface,
        shadowOpacity: 0,
    },
    submitButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "700",
    },
    // Manual Mode
    manualCenterContent: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    manualIconContainer: {
        marginBottom: 16,
        opacity: 0.8,
    },
    // Search Mode Styles
    searchContainer: {
        flex: 1,
    },
    searchFormSection: {
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    filtersContainer: {
        marginBottom: 16,
    },
    filtersHint: {
        color: COLORS.grey,
        fontSize: 12,
        marginBottom: 8,
        marginLeft: 4,
    },
    filterRow: {
        flexDirection: "row",
        marginBottom: 8,
    },
    filterInput: {
        height: 44,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        color: COLORS.white,
        fontSize: 14,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    categorySelector: {
        height: 44,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    categoryText: {
        color: COLORS.white,
        fontSize: 14,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    resultItem: {
        flexDirection: "row",
        backgroundColor: COLORS.surface,
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    resultImageContainer: {
        width: 50,
        height: 50,
        borderRadius: 8,
        backgroundColor: COLORS.surfaceLight,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
        overflow: "hidden",
    },
    resultImage: {
        width: "100%",
        height: "100%",
    },
    resultInfo: {
        flex: 1,
        marginRight: 8,
    },
    resultTitle: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
    },
    resultBrand: {
        color: COLORS.grey,
        fontSize: 14,
        marginBottom: 2,
    },
    resultMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    resultCategory: {
        color: COLORS.primary,
        fontSize: 12,
        fontWeight: "500",
    },
    resultEan: {
        color: COLORS.textDim,
        fontSize: 12,
    },
    // Loading States
    loadingContainer: {
        flex: 1,
        paddingTop: 40,
    },
    skeletonContainer: {
        marginTop: 24,
    },
    centerContent: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingTop: 60,
    },
    errorIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: `${COLORS.secondary}20`,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    errorText: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 4,
    },
    errorSubtext: {
        color: COLORS.grey,
        fontSize: 14,
        marginBottom: 20,
    },
    retryButton: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    retryButtonText: {
        color: COLORS.white,
        fontSize: 14,
        fontWeight: "600",
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: COLORS.surface,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    emptyText: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 4,
    },
    emptySubtext: {
        color: COLORS.grey,
        fontSize: 14,
    },
    footerLoader: {
        paddingVertical: 24,
        alignItems: "center",
    },
    // Modal Styles
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        padding: 20,
    },
    modalCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 20,
        padding: 20,
        maxHeight: "70%",
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
    },
    modalTitle: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 16,
        textAlign: "center",
    },
    categoryOption: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceLight,
    },
    categoryOptionText: {
        color: COLORS.white,
        fontSize: 16,
    },
    modalFooter: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 16,
        alignItems: "center",
    },
});
