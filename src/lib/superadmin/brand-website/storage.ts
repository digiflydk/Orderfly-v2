
'use server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '@/lib/firebase-admin';

export async function uploadFileToFirebaseStorage(file: File, destinationPath: string): Promise<string> {
    const app = getAdminApp();
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
        throw new Error("Firebase Storage bucket name is not configured.");
    }
    const bucket = getStorage(app).bucket(bucketName);
    
    // Check if the file already exists and delete it if so.
    const fileRef = bucket.file(destinationPath);
    const [exists] = await fileRef.exists();
    if (exists) {
        await fileRef.delete();
    }

    // Upload the new file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fileRef.save(buffer, {
        metadata: {
            contentType: file.type,
        },
    });

    // Make the file public and get the URL
    await fileRef.makePublic();
    return fileRef.publicUrl();
}

