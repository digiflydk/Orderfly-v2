
'use server';

import { menuImportFromImage } from '@/ai/flows/menu-import';

async function fileToDataUri(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${file.type};base64,${base64}`;
}

export type FormState = {
  message: string | null;
  data: any | null;
  error: string | null;
};

export async function importMenuAction(
    prevState: FormState | null,
    formData: FormData
): Promise<FormState> {
    const imageFile = formData.get('menuImage') as File | null;

    if (!imageFile || imageFile.size === 0) {
        return { message: null, data: null, error: 'Please select an image file.' };
    }

    try {
        const menuImageUri = await fileToDataUri(imageFile);
        const menuItems = await menuImportFromImage({ menuImageUri });
        if (!menuItems || menuItems.length === 0) {
          return { message: null, data: null, error: 'The AI could not detect any menu items. Please try a clearer image.' };
        }
        return { message: `${menuItems.length} menu items imported successfully.`, data: menuItems, error: null };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: null, data: null, error: `Failed to import menu: ${errorMessage}` };
    }
}
