
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, and } from 'firebase/firestore';
import type { CookieTexts } from '@/types';
import { merge } from 'lodash';

interface UseCookieTextsProps {
  brandId: string;
}

const APP_VERSION = "1.0.59";

const defaultTexts: Omit<CookieTexts, 'id' | 'last_updated'> = {
    consent_version: APP_VERSION,
    language: "en",
    shared_scope: "orderfly",
    banner_title: "We use cookies",
    banner_description: "We use cookies to improve your experience. By clicking 'Accept All', you agree to our use of cookies.",
    accept_all_button: "Accept All",
    customize_button: "Customize",
    modal_title: "Tilpas Indstillingerne For Samtykke",
    modal_description: "We use cookies to help you navigate efficiently and perform certain functions. You will find detailed information about all cookies under each consent category below.",
    save_preferences_button: "Gem mine indstillinger",
    modal_accept_all_button: "Accepter alle",
    categories: {
        necessary: { title: "Nødvendig", description: "Necessary cookies are required to enable the basic features of this site." },
        functional: { title: "Funktionel", description: "Functional cookies help to perform certain functionalities like sharing the content of the website on social media platforms." },
        analytics: { title: "Analytics", description: "Analytical cookies are used to understand how visitors interact with the website." },
        statistics: { title: "Statistics", description: "Statistics cookies are used to understand how visitors interact with the website." },
        performance: { title: "Præstation", description: "Performance cookies are used to understand and analyze the key performance indexes of the website which helps in delivering a better user experience for the visitors." },
        marketing: { title: "Marketing", description: "Marketing cookies are used to track visitors across websites to display relevant ads."}
    }
};

export function useCookieTexts({ brandId }: UseCookieTextsProps) {
    const [texts, setTexts] = useState<Omit<CookieTexts, 'id' | 'last_updated'>>(defaultTexts);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTexts = async () => {
            setLoading(true);
            const lang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
            
            try {
                let finalTexts = defaultTexts;

                // 1. Fetch brand-specific texts
                const brandQuery = query(
                    collection(db, 'cookie_texts'),
                    where('consent_version', '==', APP_VERSION),
                    where('language', '==', lang),
                    where('brand_id', '==', brandId)
                );
                const brandSnapshot = await getDocs(brandQuery);

                if (!brandSnapshot.empty) {
                    const result = brandSnapshot.docs[0].data() as Partial<CookieTexts>;
                    finalTexts = merge({}, defaultTexts, result);
                } else {
                    // 2. If no brand-specific texts, fetch global texts
                    const globalQuery = query(
                        collection(db, 'cookie_texts'),
                        where('consent_version', '==', APP_VERSION),
                        where('language', '==', lang)
                    );
                    const globalSnapshot = await getDocs(globalQuery);
                    // Filter in client-side to find the one without a brand_id
                    const globalDoc = globalSnapshot.docs.find(doc => !doc.data().brand_id);
                    
                    if (globalDoc) {
                        const result = globalDoc.data() as Partial<CookieTexts>;
                        finalTexts = merge({}, defaultTexts, result);
                    }
                }
                
                setTexts(finalTexts);
                
            } catch (error) {
                console.error("Failed to fetch cookie texts:", error);
                setTexts(defaultTexts); // Use defaults on error
            } finally {
                setLoading(false);
            }
        };

        if (brandId) {
            fetchTexts();
        }
    }, [brandId]);

    return { texts, loading };
}
