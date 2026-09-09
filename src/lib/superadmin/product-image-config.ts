export class ProductImageStorageError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ProductImageStorageError';
  }
}

/** Accept the bucket name or the gs:// form displayed in the Firebase console. */
export function productImageBucketName(configured: string | undefined, projectId?: string): string {
  const name = (configured || '').trim().replace(/^gs:\/\//, '').replace(/\/$/, '');
  if (!name) {
    throw new ProductImageStorageError('image/storage-not-configured',
      'Product image storage is not configured. Ask an administrator to configure the image storage bucket.');
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(name)) {
    throw new ProductImageStorageError('image/invalid-bucket',
      'The image storage bucket setting is invalid. Use a bucket name, not an image or console URL.');
  }
  const firebaseProject = name.match(/^(.+)\.(?:appspot\.com|firebasestorage\.app)$/)?.[1];
  if (projectId && firebaseProject && firebaseProject !== projectId) {
    throw new ProductImageStorageError('image/wrong-project',
      'Image storage does not match the configured storage project. Ask an administrator to correct the bucket setting.');
  }
  return name;
}

export function productImageUploadError(error: unknown): ProductImageStorageError {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '403') return new ProductImageStorageError('image/storage-permission-denied',
    'Image upload failed: storage access was denied (403). Ask an administrator to check upload permissions for the configured storage account. Your entries are preserved.');
  if (code === '401' || code === 'app/invalid-credential') return new ProductImageStorageError('image/storage-credentials',
    'Image upload failed: storage authentication failed. Ask an administrator to check the storage credentials. Your entries are preserved.');
  if (code === '404') return new ProductImageStorageError('image/storage-not-found',
    'Image upload failed: the configured storage bucket was not found (404). Ask an administrator to check the bucket setting. Your entries are preserved.');
  return new ProductImageStorageError('image/storage-unavailable',
    'Image upload failed. Your product has not been saved. Please try again. If it continues, ask an administrator to check the image storage log.');
}
