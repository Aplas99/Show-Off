import {
    getCurrentMembershipAccess,
    getMembershipUploadLimitBytes,
} from "@/api/memberships";
import { supabase } from "@/lib/supabase";
import { useMutation } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { Alert } from "react-native";

interface UploadImageParams {
    uri: string;
    fileSize?: number;
    bucketName?: string;
    /** Allow video formats too (post uploads). Defaults to images only. */
    kind?: "image" | "media";
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm"];

const MIME_BY_EXT: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
};

/**
 * Uploads an image (or, with `kind: "media"`, a video) to Supabase Storage.
 */
export async function uploadImageToSupabase({
    uri,
    fileSize,
    bucketName = "item-images",
    kind = "image",
}: UploadImageParams): Promise<string> {
    const membership = await getCurrentMembershipAccess().catch(() => null);
    const MAX_FILE_SIZE_BYTES = getMembershipUploadLimitBytes({
        isPaidUser: membership?.isPaidUser ?? false,
        tier: membership?.tier,
        planId: membership?.planId,
    });

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
            `File too large. Please select a file smaller than ${limitMb}MB.`
        );
    }

    // 2. Validate file type
    const ext = uri.split(".").pop()?.toLowerCase();
    const allowedExtensions =
        kind === "media"
            ? [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]
            : IMAGE_EXTENSIONS;

    if (!ext || !allowedExtensions.includes(ext)) {
        throw new Error(
            kind === "media"
                ? `Unsupported file format (${ext}). Please upload an image (JPG, PNG, GIF, WEBP, HEIC) or video (MP4, MOV, WEBM).`
                : `Unsupported file format (${ext}). Please upload a valid image (JPG, PNG, GIF, WEBP, or HEIC).`
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
        type: MIME_BY_EXT[ext] ?? "application/octet-stream",
    } as any);

    // 4. Upload to Supabase
    const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, formData, {
            cacheControl: "0",
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
