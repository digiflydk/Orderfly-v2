
'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function PageLoader() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Show loader only if loading takes more than 200ms
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, 200);

        return () => clearTimeout(timer);
    }, []);

    if (!isVisible) {
        return null;
    }

    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
}
