

'use client';

import { BrandAppearances } from "@/types";
import { Button } from "../ui/button";

interface BrandAppearancePreviewProps {
    values: BrandAppearances;
}

export function BrandAppearancePreview({ values }: BrandAppearancePreviewProps) {
    if (!values || !values.colors || !values.typography) {
        return <div className="p-4 border rounded-lg text-center text-muted-foreground">Loading preview...</div>
    }
    
    const { colors, typography } = values;

    const previewStyle: React.CSSProperties = {
        '--preview-bg': colors.background || '#FFFFFF',
        '--preview-text': colors.text || '#111111',
        '--preview-primary': colors.primary || '#000000',
        '--preview-secondary-bg': colors.secondary || '#F0F0F0',
        fontFamily: typography.fontFamily || 'sans-serif',
    } as React.CSSProperties;

    return (
        <div style={previewStyle}>
            <div 
                className="p-6 rounded-lg border transition-colors"
                style={{
                    backgroundColor: 'var(--preview-bg)',
                    color: 'var(--preview-text)',
                    borderColor: colors.border || '#DDDDDD',
                }}
            >
                <h2 className="text-2xl font-bold mb-4">Example Heading</h2>
                <p className="mb-6">This is some example body text to demonstrate the selected font and colors.</p>
                <div className="flex items-center gap-4">
                    <Button
                        style={{
                            backgroundColor: 'var(--preview-primary)',
                            color: colors.buttonText || '#FFFFFF',
                        }}
                    >
                        Primary Button
                    </Button>
                     <Button
                        style={{
                            backgroundColor: 'var(--preview-secondary-bg)',
                            color: 'var(--preview-text)',
                            borderColor: colors.border,
                        }}
                        variant="outline"
                    >
                        Secondary
                    </Button>
                </div>
            </div>
        </div>
    );
}
