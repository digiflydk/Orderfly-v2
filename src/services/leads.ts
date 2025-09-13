
'use server';
import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const LEADS_COLLECTION_ID = 'leads';

export interface Lead {
    id?: string;
    name: string;
    email: string;
    phone: string;
    projectIdea: string;
    status: 'Qualified' | 'Not Qualified';
    createdAt: Date;
}

export async function saveLead(leadData: Omit<Lead, 'id'>): Promise<string> {
    try {
        const docRef = await addDoc(collection(db, LEADS_COLLECTION_ID), leadData);
        return docRef.id;
    } catch (error) {
        console.error("Error saving lead: ", error);
        throw new Error("Could not save lead.");
    }
}

export async function getAllLeads(): Promise<Lead[]> {
    try {
        const leadsCollection = collection(db, LEADS_COLLECTION_ID);
        const q = query(leadsCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as Omit<Lead, 'id'>),
            createdAt: (doc.data().createdAt as any).toDate(), // Convert Firestore Timestamp to Date
        }));
    } catch (error) {
        console.error("Error fetching leads: ", error);
        return [];
    }
}
