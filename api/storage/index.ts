import { getHasActiveMembership } from "@/api/memberships";
import { supabase } from "@/lib/supabase";
import { useMutation } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { Alert } from "react-native";

const FREE_USER_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const PAID_USER_MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

interface UploadImageParams {
    uri: string;
    fileSize?: number;
    bucketName?: string;
}

/**
 * Uploads an image to Supabase Storage.
 */
export async function uploadImageToSupabase({
    uri,
    fileSize,
    bucketName = "item-images",
}: UploadImageParams): Promise<string> {
    // Paid members get the larger upload limit (see api/memberships).
    const isPaidUser = await getHasActiveMembership();
    const MAX_FILE_SIZE_BYTES = isPaidUser ? PAID_USER_MAX_FILE_SIZE_BYTES : FREE_USER_MAX_FILE_SIZE_BYTES;

    // 1. Validate file size (measure it ourselves when not provided)
    if (fileSize == null) {
        try {
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists && typeof info.size === "number") {
                fileSize = info.size;
            }
        } catch {
            // Size unknown — the storage bucket's own limit still applies.
        }
    }
    if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
        const limitMb = MAX_FILE_SIZE_BYTES / (1024 * 1024);
        throw new Error(
            `File too large. Please select an image smaller than ${limitMb}MB.`
        );
    }

    // 2. Validate file type
    const ext = uri.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];

    if (!ext || !allowedExtensions.includes(ext)) {
        throw new Error(
            `Unsupported file format (${ext}). Please upload a valid image (JPG, PNG, GIF, WEBP, or HEIC).`
        );
    }

    // 3. Prepare file for upload — scoped per user so per-owner storage
    // policies are possible and cleanup can target a user's folder.
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in to upload images.");

    const fileName = `${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
    const filePath = `${user.id}/${fileName}`;

    const formData = new FormData();
    formData.append("file", {
        uri,
        name: fileName,
        type: `image/${ext === "png" ? "png" : "jpeg"}`,
    } as any);

    // 4. Upload to Supabase
    const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, formData, {
            cacheControl: "3600",
            upsert: false,
        });

    if (error) {
        console.error("Supabase upload error:", error);
        throw new Error(error.message);
    }

    // 5. Get Public URL
    const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
}

/**
 * React Query hook for uploading images.
 */
export function useUploadImage() {
    return useMutation({
        mutationFn: uploadImageToSupabase,
        onError: (error) => {
            Alert.alert("Upload Failed", error.message || "Could not upload image.");
        },
    });
}
