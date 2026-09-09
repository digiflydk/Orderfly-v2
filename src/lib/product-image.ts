export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/avif,.jpg,.jpeg,.png,.avif';

export function productImageInputError(file: File): string | null {
  if (file.name && !file.size) return 'The image file is empty.';
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return 'The image must be at most 5 MB.';
  if (file.size && !['image/jpeg', 'image/png', 'image/avif'].includes(file.type)) {
    return 'Choose a JPEG, PNG or AVIF image.';
  }
  return null;
}
