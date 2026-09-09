import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { getAdminApp } from '@/lib/firebase-admin';
import { productImageInputError } from '@/lib/product-image';

/** Save the original bytes under an immutable, brand/product-scoped object name. */
export async function uploadProductImage(file: File, brandId: string, productId: string): Promise<string> {
  const inputError = productImageInputError(file);
  if (inputError || !file.size) throw new Error(inputError || 'The image file is empty.');
  const bytes = Buffer.from(await file.arrayBuffer());
  let extension: string;
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' });
    const metadata = await image.metadata();
    const format = metadata.format === 'heif' && metadata.compression === 'av1' ? 'avif' : metadata.format;
    const mimeTypes: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', avif: 'image/avif' };
    const mime = mimeTypes[format || ''];
    if (!mime || mime !== file.type || (metadata.pages || 1) > 1) throw new Error('Invalid format');
    await image.stats(); // Decode as well as inspect the header, rejecting corrupt/truncated files.
    extension = format === 'jpeg' ? 'jpg' : format!;
  } catch {
    throw new Error('The image could not be read. Choose a valid JPEG, PNG or AVIF image.');
  }
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error('Product image storage is not configured. Contact the administrator.');
  try {
    const bucket = getStorage(getAdminApp()).bucket(bucketName);
    const object = bucket.file(`brands/${brandId}/products/${productId}/${randomUUID()}.${extension}`);
    await object.save(bytes, {
      resumable: false,
      metadata: {
        contentType: file.type,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: randomUUID() },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    // Firebase download URLs also work on buckets with uniform access (no makePublic ACL).
    return await getDownloadURL(object);
  } catch (error) {
    console.error('[products.image] Upload failed', error);
    throw new Error('Image upload failed. Your product has not been saved. Please try again.');
  }
}
