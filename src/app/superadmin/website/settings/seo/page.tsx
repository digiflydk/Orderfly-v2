
"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GeneralSettings } from "@/types/settings";
import { getSettingsAction, saveSettingsAction } from "@/app/superadmin/website/actions";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import CmsLayout from '../../_cmsLayout';

function SeoSettingsPageContent() {
    const [settings, setSettings] = useState<Partial<GeneralSettings>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, startSaving] = useTransition();
    const { toast } = useToast();

    useEffect(() => {
        async function loadSettings() {
            setIsLoading(true);
            const loadedSettings = await getSettingsAction();
            if (loadedSettings) {
                setSettings({
                  allowSearchEngineIndexing: loadedSettings.allowSearchEngineIndexing ?? true,
                  seoTitle: loadedSettings.seoTitle,
                  metaDescription: loadedSettings.metaDescription
                });
            } else {
                 setSettings({ allowSearchEngineIndexing: true });
            }
            setIsLoading(false);
        }
        loadSettings();
    }, []);
    
    const handleInputChange = (field: keyof GeneralSettings, value: string) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleToggle = (value: boolean) => {
        setSettings(prev => ({ ...prev, allowSearchEngineIndexing: value }));
    };

    const handleSaveChanges = () => {
        startSaving(async () => {
            const result = await saveSettingsAction(settings as GeneralSettings);
            toast({
                title: result.success ? "Gemt!" : "Fejl!",
                description: result.message,
                variant: result.success ? "default" : "destructive",
            });
        });
    }

    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

  return (
    <div className="space-y-8 max-w-4xl">
       <div className="flex justify-end">
            <Button size="lg" onClick={handleSaveChanges} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gem Ændringer
            </Button>
       </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>SEO (Search Engine Optimization)</CardTitle>
          <CardDescription>Administrer hvordan din side vises i søgemaskiner som Google.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                    <Label htmlFor="seo-switch" className="text-base">Tillad søgemaskiner at vise din side i søgeresultater</Label>
                     <p className="text-sm text-muted-foreground">Anbefales at være slået til, medmindre siden er under udvikling.</p>
                </div>
                <Switch
                    id="seo-switch"
                    checked={settings.allowSearchEngineIndexing}
                    onCheckedChange={handleToggle}
                />
            </div>
            
            <div className="space-y-4 rounded-lg border p-4">
                <h3 className="font-semibold">Metadata for Forsiden</h3>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label htmlFor="seo-title">SEO Titel</Label>
                        <span className="text-xs text-muted-foreground">{settings.seoTitle?.length || 0} / 60</span>
                    </div>
                    <Input 
                        id="seo-title" 
                        placeholder="F.eks. Digifly – Konsulentydelser i AI og digital skalering" 
                        value={settings.seoTitle || ''}
                        onChange={(e) => handleInputChange('seoTitle', e.target.value)}
                        maxLength={60}
                    />
                </div>
                 <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label htmlFor="meta-description">Meta Beskrivelse</Label>
                        <span className="text-xs text-muted-foreground">{settings.metaDescription?.length || 0} / 160</span>
                    </div>
                    <Textarea 
                        id="meta-description" 
                        placeholder="Beskriv din virksomhed og hvad du tilbyder..." 
                        value={settings.metaDescription || ''}
                        onChange={(e) => handleInputChange('metaDescription', e.target.value)}
                        maxLength={160}
                        className="min-h-[100px]"
                    />
                </div>
            </div>

            <Alert>
              <Lightbulb className="h-4 w-4" />
              <AlertTitle>Tip</AlertTitle>
              <AlertDescription>
                Brug relevante søgeord i dine tekster på hjemmesiden, især i overskrifter. Dette vil forbedre din synlighed markant for brugere, der søger efter dine ydelser.
              </AlertDescription>
            </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SeoSettingsPage() {
    return (
        <CmsLayout>
            <SeoSettingsPageContent />
        </CmsLayout>
    )
}
