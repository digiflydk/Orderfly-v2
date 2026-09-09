import 'server-only';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { getAdminApp } from '@/lib/firebase-admin';
import { productImageInputError } from '@/lib/product-image';
import { productImageBucketName, productImageUploadError } from './product-image-config';

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
  const app = getAdminApp();
  // Server-only configuration can be corrected at runtime; NEXT_PUBLIC values are build-time values.
  const bucketName = productImageBucketName(
    process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    process.env.FIREBASE_STORAGE_PROJECT_ID ?? app.options.projectId,
  );
  try {
    const bucket = getStorage(app).bucket(bucketName);
    const object = bucket.file(`brands/${brandId}/products/${productId}/${randomUUID()}.${extension}`);
    const downloadToken = randomUUID();
    await object.save(bytes, {
      resumable: false,
      metadata: {
        contentType: file.type,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    // We just saved this token. getDownloadURL would issue a second, unnecessary
    // request to the Firebase metadata API and could fail after a successful GCS upload.
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(object.name)}?alt=media&token=${downloadToken}`;
  } catch (error) {
    const uploadError = productImageUploadError(error);
    // SDK errors can contain authenticated request headers. Log only safe diagnostics.
    console.error('[products.image] Upload failed', { stage: 'save', bucket: bucketName, code: uploadError.code });
    throw uploadError;
  }
}
