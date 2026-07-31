import imageCompression from 'browser-image-compression'

export interface CompressImageOptions {
  maxSizeMB: number
  maxWidthOrHeight: number
}

/** Compresses to WebP via canvas re-encode, which drops EXIF as a side effect. */
export async function compressToWebp(file: File, opts: CompressImageOptions): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: opts.maxSizeMB,
    maxWidthOrHeight: opts.maxWidthOrHeight,
    useWebWorker: true,
    fileType: 'image/webp',
  })
}
