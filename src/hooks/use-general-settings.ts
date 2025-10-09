
'use client';

import { useState, useEffect } from 'react';
import { getGeneralSettings } from '@/services/settings';
import type { GeneralSettings } from '@/types/settings';

export function useGeneralSettings() {
    const [settings, setSettings] = useState<GeneralSettings | null>(null);

    useEffect(() => {
        async function load() {
            const loadedSettings = await getGeneralSettings();
            setSettings(loadedSettings);
        }
        load();
    }, []);

    return settings;
}
