
'use server';
import { z } from 'zod';
import { aiProjectQualification, type AIProjectQualificationInput, type AIProjectQualificationOutput } from '@/ai/flows/ai-project-qualification';
import { getGeneralSettings, saveGeneralSettings } from '@/services/settings';
import type { GeneralSettings, Customer } from '@/types/settings';
import { revalidatePath } from 'next/cache';
import { getAllLeads, Lead } from '@/services/leads';
import { v4 as uuidv4 } from 'uuid';


export async function qualifyProjectAction(input: AIProjectQualificationInput): Promise<AIProjectQualificationOutput> {
  // Here you could add server-side validation or logging if needed
  try {
    const result = await aiProjectQualification(input);
    return result;
  } catch (error) {
    console.error("Error in AI qualification flow:", error);
    throw new Error("Failed to get response from AI assistant.");
  }
}

const contactFormSchema = z.object({
  name: z.string().min(2, { message: "Navn skal være mindst 2 tegn." }),
  email: z.string().email({ message: "Indtast venligst en gyldig email." }),
  message: z.string().min(10, { message: "Besked skal være mindst 10 tegn." }),
  gdpr: z.literal(true, {
    errorMap: () => ({ message: "Du skal acceptere vilkårene." }),
  }),
});

export type ContactFields = 'name' | 'email' | 'message' | 'gdpr';

export type FormErrors = Partial<Record<ContactFields, string[]>>;

export type FormState = {
  message: string;
  errors?: FormErrors;
};


export async function sendContactMessage(prevState: FormState, formData: FormData): Promise<FormState> {
  const validatedFields = contactFormSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
    gdpr: formData.get('gdpr') === 'on',
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Udfyld venligst alle felter korrekt.',
    };
  }
  
  // In a real application, you would send an email or save to a database.
  // For this example, we'll just log the data to the console.
  console.log('New Contact Form Submission:');
  console.log(validatedFields.data);

  return {
    message: 'Tak for din besked! Vi vender tilbage hurtigst muligt.',
    errors: {},
  };
}

export async function getSettingsAction(): Promise<GeneralSettings | null> {
    return getGeneralSettings();
}

export async function saveSettingsAction(settings: Partial<GeneralSettings>): Promise<{ success: boolean; message: string }> {
    try {
        await saveGeneralSettings(settings);
        revalidatePath('/cms', 'layout');
        revalidatePath('/', 'layout');
        return { success: true, message: 'Indstillinger er blevet gemt.' };
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Der opstod en fejl under lagring.' };
    }
}

export async function getLeadsAction(): Promise<Lead[]> {
    return getAllLeads();
}

export async function saveCustomerAction(customerData: Omit<Customer, 'id'>): Promise<{ success: boolean; message: string; customers: Customer[] }> {
    try {
        const settings = await getGeneralSettings();
        const customers = settings?.customers || [];
        const newCustomer: Customer = { ...customerData, id: uuidv4() };
        const updatedCustomers = [...customers, newCustomer];
        await saveGeneralSettings({ customers: updatedCustomers });
        revalidatePath('/cms/customers');
        return { success: true, message: 'Kunde tilføjet.', customers: updatedCustomers };
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Der opstod en fejl.', customers: [] };
    }
}

export async function deleteCustomerAction(customerId: string): Promise<{ success: boolean; message: string; customers: Customer[] }> {
    try {
        const settings = await getGeneralSettings();
        const customers = settings?.customers || [];
        const updatedCustomers = customers.filter(c => c.id !== customerId);
        await saveGeneralSettings({ customers: updatedCustomers });
        revalidatePath('/cms/customers');
        return { success: true, message: 'Kunde slettet.', customers: updatedCustomers };
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Der opstod en fejl.', customers: [] };
    }
}

export async function getCustomersAction(): Promise<Customer[]> {
    const settings = await getGeneralSettings();
    return settings?.customers || [];
}
