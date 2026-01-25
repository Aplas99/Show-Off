import { useProductSearch, type Product } from "@/api/items";
import { COLORS } from "@/constants/theme";
import BarcodeScannerModal from "@/src/components/items/BarcodeScannerModal";
import CreateItemWizard from "@/src/components/items/CreateItemWizard";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type InputMode = "barcode" | "search";

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
    const [wizardVisible, setWizardVisible] = useState(false);
    const [inputMode, setInputMode] = useState<InputMode>("barcode");
    const [barcodeInput, setBarcodeInput] = useState("");
    const [searchInput, setSearchInput] = useState("");

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

    const handleWizardSuccess = (itemTitle: string, showcaseCount: number) => {
        console.log(`Created ${itemTitle} in ${showcaseCount} showcase(s)`);
    };

    const handleWizardClose = () => {
        setWizardVisible(false);
        setBarcodeInput("");
        // We don't clear search input/results to let user go back to list if they cancel
        setSelectedProduct(undefined);
    };

    const handleBarcodeScanned = (barcode: string) => {
        setBarcodeInput(barcode);
        setScannerOpen(false);
        setSelectedProduct(undefined);
        setWizardVisible(true);
    };

    const handleBarcodeSubmit = () => {
        if (barcodeInput.trim()) {
            setSelectedProduct(undefined);
            setWizardVisible(true);
        }
    };

    const handleSearchSubmit = () => {
        if (searchInput.trim()) {
            setSearchParams({
                query: searchInput.trim(),
                brand: brandInput.trim(),
                manufacturer: manufacturerInput.trim(),
                category: categoryInput.trim(),
            });
        }
    };

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product);
        setWizardVisible(true);
    };

    const renderSearchResult = ({ item }: { item: Product }) => (
        <TouchableOpacity
            style={styles.resultItem}
            onPress={() => handleProductSelect(item)}
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
                    <Ionicons name="image-outline" size={24} color={COLORS.grey} />
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
                    {item.ean && <Text style={styles.resultEan}>EAN: {item.ean}</Text>}
                </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
        </TouchableOpacity>
    );

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                            style={[styles.tab, inputMode === "barcode" && styles.activeTab]}
                            onPress={() => {
                                setInputMode("barcode");
                                setSearchParams({
                                    query: "",
                                    brand: "",
                                    manufacturer: "",
                                    category: "",
                                }); // Clear search results when switching
                            }}
                        >
                            <Ionicons
                                name="barcode-outline"
                                size={20}
                                color={inputMode === "barcode" ? COLORS.white : COLORS.grey}
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
                            style={[styles.tab, inputMode === "search" && styles.activeTab]}
                            onPress={() => setInputMode("search")}
                        >
                            <Ionicons
                                name="search-outline"
                                size={20}
                                color={inputMode === "search" ? COLORS.white : COLORS.grey}
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
                        >
                            <View style={styles.formSection}>
                                <Text style={styles.sectionTitle}>Scan or Enter Barcode</Text>
                                <View style={styles.inputGroup}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter barcode manually"
                                        placeholderTextColor="#666"
                                        value={barcodeInput}
                                        onChangeText={setBarcodeInput}
                                        keyboardType="numeric"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                    <TouchableOpacity
                                        style={styles.scanButton}
                                        onPress={() => setScannerOpen(true)}
                                    >
                                        <Ionicons name="camera" size={24} color={COLORS.white} />
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    style={[
                                        styles.submitButton,
                                        !barcodeInput.trim() && styles.disabledButton,
                                    ]}
                                    onPress={handleBarcodeSubmit}
                                    disabled={!barcodeInput.trim()}
                                >
                                    <Text style={styles.submitButtonText}>Continue</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    )}

                    {inputMode === "search" && (
                        <View style={styles.searchContainer}>
                            <View style={styles.searchFormSection}>
                                <View style={styles.inputGroup}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Search by name, brand, etc."
                                        placeholderTextColor="#666"
                                        value={searchInput}
                                        onChangeText={setSearchInput}
                                        onSubmitEditing={handleSearchSubmit}
                                        returnKeyType="search"
                                        autoCapitalize="words"
                                        autoCorrect={true}
                                    />
                                    <TouchableOpacity
                                        style={styles.searchButtonIcon}
                                        onPress={handleSearchSubmit}
                                        disabled={!searchInput.trim()}
                                    >
                                        <Ionicons
                                            name="search"
                                            size={24}
                                            color={searchInput.trim() ? COLORS.white : COLORS.grey}
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
                                            style={[styles.filterInput, { flex: 1, marginRight: 8 }]}
                                            placeholder="Brand"
                                            placeholderTextColor="#666"
                                            value={brandInput}
                                            onChangeText={setBrandInput}
                                            autoCapitalize="words"
                                        />
                                        <TextInput
                                            style={[styles.filterInput, { flex: 1 }]}
                                            placeholder="Manufacturer"
                                            placeholderTextColor="#666"
                                            value={manufacturerInput}
                                            onChangeText={setManufacturerInput}
                                            autoCapitalize="words"
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={styles.categorySelector}
                                        onPress={() => setCategoryModalOpen(true)}
                                    >
                                        <Text
                                            style={[
                                                styles.categoryText,
                                                !categoryInput && { color: "#666" },
                                            ]}
                                        >
                                            {categoryInput || "Select Category"}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color="#666" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Search Results List */}
                            {isLoading ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color={COLORS.primary} />
                                    <Text style={styles.loadingText}>Searching products...</Text>
                                </View>
                            ) : isError ? (
                                <View style={styles.centerContent}>
                                    <Text style={styles.errorText}>
                                        Something went wrong. Please try again.
                                    </Text>
                                </View>
                            ) : searchParams.query && searchResults.length === 0 ? (
                                <View style={styles.centerContent}>
                                    <Text style={styles.emptyText}>
                                        No products found for "{searchParams.query}"
                                    </Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={searchResults}
                                    renderItem={renderSearchResult}
                                    keyExtractor={(item, index) =>
                                        item.ean || item.upc || `${index}`
                                    }
                                    contentContainerStyle={styles.listContent}
                                    showsVerticalScrollIndicator={false}
                                    onEndReached={() => {
                                        if (hasNextPage) fetchNextPage();
                                    }}
                                    onEndReachedThreshold={0.5}
                                    ListFooterComponent={
                                        isFetchingNextPage ? (
                                            <View style={styles.footerLoader}>
                                                <ActivityIndicator
                                                    size="small"
                                                    color={COLORS.primary}
                                                />
                                            </View>
                                        ) : null
                                    }
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
                onRequestClose={() => setCategoryModalOpen(false)}
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
                                    onPress={() => {
                                        setCategoryInput(item);
                                        setCategoryModalOpen(false);
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.categoryOptionText,
                                            categoryInput === item && { color: COLORS.primary },
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
                        />
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                onPress={() => {
                                    setCategoryInput(""); // Clear selection
                                    setCategoryModalOpen(false);
                                }}
                                style={{ marginRight: 20 }}
                            >
                                <Text style={{ color: COLORS.grey }}>Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setCategoryModalOpen(false)}>
                                <Text style={{ color: COLORS.primary, fontWeight: "600" }}>
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

            {/* Create Item Wizard */}
            <CreateItemWizard
                visible={wizardVisible}
                onClose={handleWizardClose}
                onSuccess={handleWizardSuccess}
                initialBarcode={selectedProduct?.ean || selectedProduct?.upc || barcodeInput}
                initialProductData={selectedProduct}
            />
        </KeyboardAvoidingView>
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
        fontWeight: "700",
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
        borderColor: "#333",
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
        backgroundColor: "#333",
    },
    tabText: {
        color: COLORS.grey,
        fontSize: 16,
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
        fontSize: 18,
        fontWeight: "600",
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
        borderColor: "#333",
    },
    scanButton: {
        width: 56,
        height: 56,
        backgroundColor: COLORS.primary,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    searchButtonIcon: {
        width: 56,
        height: 56,
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#333",
    },
    submitButton: {
        backgroundColor: COLORS.primary,
        height: 56,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
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
        borderColor: "#333",
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
        borderColor: "#333",
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
        borderColor: "#333",
    },
    resultImageContainer: {
        width: 50,
        height: 50,
        borderRadius: 8,
        backgroundColor: "#222",
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
    },
    resultEan: {
        color: "#666",
        fontSize: 12,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 40,
    },
    loadingText: {
        color: COLORS.grey,
        marginTop: 12,
    },
    centerContent: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingTop: 60,
    },
    errorText: {
        color: "#ef4444",
        textAlign: "center",
    },
    emptyText: {
        color: COLORS.grey,
        textAlign: "center",
    },
    footerLoader: {
        paddingVertical: 16,
        alignItems: "center",
    },
    // Modal Styles
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.6)",
        justifyContent: "center",
        padding: 20,
    },
    modalCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 16,
        maxHeight: "70%",
    },
    modalTitle: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 16,
    },
    categoryOption: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#333",
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
