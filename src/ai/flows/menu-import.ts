'use server';

/**
 * @fileOverview An AI agent that imports menu items from an image.
 *
 * - menuImportFromImage - A function that handles the menu import process.
 * - MenuImportInput - The input type for the menuImportFromImage function.
 * - MenuImportOutput - The return type for the menuImportFromImage function.
 */

import {ai} from '@/ai/genkit';
import { MenuImportInputSchema, MenuImportOutputSchema, type MenuImportInput, type MenuImportOutput } from '@/types';

export type { MenuImportOutput } from '@/types';


export async function menuImportFromImage(input: MenuImportInput): Promise<MenuImportOutput> {
  return menuImportFlow(input);
}

const prompt = ai.definePrompt({
  name: 'menuImportPrompt',
  input: {schema: MenuImportInputSchema},
  output: {schema: MenuImportOutputSchema},
  prompt: `You are an expert menu data extractor for restaurants.

You will receive an image of a menu and extract all menu items, descriptions, and prices.

Ensure that the output is a valid JSON array of menu items.

Here is the menu image:
{{media url=menuImageUri}}`,
});

const menuImportFlow = ai.defineFlow(
  {
    name: 'menuImportFlow',
    inputSchema: MenuImportInputSchema,
    outputSchema: MenuImportOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
