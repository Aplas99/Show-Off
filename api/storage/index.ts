import { supabase } from "@/lib/supabase";
import { useMutation } from "@tanstack/react-query";
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
    // Determine max size based on user type (Scaffolding)
    // TODO: Connect to actual user subscription logic
    const isPaidUser = false;
    const MAX_FILE_SIZE_BYTES = isPaidUser ? PAID_USER_MAX_FILE_SIZE_BYTES : FREE_USER_MAX_FILE_SIZE_BYTES;

    // 1. Validate file size
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

    // 3. Prepare file for upload
    const fileName = `${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
    const filePath = `public/${fileName}`;

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
