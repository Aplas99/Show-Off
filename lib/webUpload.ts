const EXTENSIONS_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
  "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/x-m4v": "m4v", "video/webm": "webm",
};

/** Browser image pickers return blob/data URIs rather than filesystem paths. */
export async function prepareWebUpload(uri: string, maxBytes: number, allowVideo: boolean, fetchFile: typeof fetch = fetch) {
  if (!uri.startsWith("blob:") && !uri.startsWith("data:")) {
    throw new Error("Please select the file again before uploading.");
  }
  const response = await fetchFile(uri);
  if (!response.ok) throw new Error("Could not read the selected file. Please select it again.");
  const blob = await response.blob();
  const contentType = blob.type.toLowerCase().split(";", 1)[0];
  const extension = EXTENSIONS_BY_MIME[contentType];
  if (!extension || (!allowVideo && !contentType.startsWith("image/"))) {
    throw new Error("Unsupported file format. Please select a supported image or video.");
  }
  if (!blob.size) throw new Error("The selected file is empty.");
  if (blob.size > maxBytes) throw new Error(`File too large. Please select a file smaller than ${maxBytes / (1024 * 1024)}MB.`);
  return { body: await blob.arrayBuffer(), extension, contentType };
}
