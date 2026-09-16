import imageCompression from "browser-image-compression";

export type PreparedMedia = {
  file: File;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  position: number;
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

async function readDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith("image/")) return { width: null, height: null };
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth || null, height: image.naturalHeight || null };
  } catch {
    return { width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressPostMedia(file: File): Promise<PreparedMedia> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("media_too_large");

  const compressed = file.type.startsWith("image/")
    ? await imageCompression(file, {
        maxSizeMB: 8,
        maxWidthOrHeight: 4096,
        useWebWorker: true,
        preserveExif: false,
      })
    : file;

  const normalized = new File([compressed], file.name, {
    type: compressed.type || file.type,
    lastModified: file.lastModified,
  });
  const dimensions = await readDimensions(normalized);

  return {
    file: normalized,
    width: dimensions.width,
    height: dimensions.height,
    // A real blurhash requires a dedicated encoder; do not invent one.
    blurhash: null,
    position: 0,
  };
}

export async function preparePostMedia(files: File[]): Promise<PreparedMedia[]> {
  const prepared: PreparedMedia[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const media = await compressPostMedia(files[index]);
    prepared.push({ ...media, position: index });
  }
  return prepared;
}
