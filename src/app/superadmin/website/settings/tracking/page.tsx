
"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GeneralSettings } from "@/types/settings";
import { getSettingsAction, saveSettingsAction } from "@/app/superadmin/website/actions";
import { Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import CmsLayout from '../../_cmsLayout';

function TrackingIntegration({
  title,
  description,
  idField,
  enableField,
  placeholder,
  settings,
  handleInputChange,
  handleToggle,
}: {
  title: string;
  description: string;
  idField: keyof GeneralSettings;
  enableField: keyof GeneralSettings;
  placeholder: string;
  settings: Partial<GeneralSettings>;
  handleInputChange: (field: keyof GeneralSettings, value: string) => void;
  handleToggle: (field: keyof GeneralSettings, value: boolean) => void;
}) {
  const isEnabled = !!settings[enableField];

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h4 className="text-base font-semibold">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={(value) => handleToggle(enableField, value)}
        />
      </div>
      {isEnabled && (
        <div className="space-y-2">
          <Label htmlFor={idField}>{title} ID</Label>
          <Input
            id={idField}
            placeholder={placeholder}
            value={(settings[idField] as string) || ""}
            onChange={(e) => handleInputChange(idField, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function TrackingSettingsPageContent() {
    const [settings, setSettings] = useState<Partial<GeneralSettings>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, startSaving] = useTransition();
    const { toast } = useToast();

    useEffect(() => {
        async function loadSettings() {
            setIsLoading(true);
            const loadedSettings = await getSettingsAction();
            if (loadedSettings) {
                setSettings(loadedSettings);
            }
            setIsLoading(false);
        }
        loadSettings();
    }, []);

    const handleInputChange = (field: keyof GeneralSettings, value: string) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };
    
    const handleToggle = (field: keyof GeneralSettings, value: boolean) => {
        setSettings(prev => ({...prev, [field]: value}));
    }

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
       <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Tracking & Analytics</h1>
            <Button size="lg" onClick={handleSaveChanges} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gem Ændringer
            </Button>
       </div>
       <p className="text-muted-foreground">Administrer dine sporings-ID'er og aktiver/deaktiver integrationer.</p>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Sporings-integrationer</CardTitle>
          <CardDescription>Indtast dine sporings-ID'er og aktiver de tjenester, du vil bruge.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <Alert>
              <Lightbulb className="h-4 w-4" />
              <AlertTitle>Anbefaling</AlertTitle>
              <AlertDescription>
                Vi anbefaler at bruge Google Tag Manager til at administrere alle dine tracking-scripts for at opnå den bedste ydeevne og fleksibilitet.
              </AlertDescription>
            </Alert>
            
            <TrackingIntegration
              title="Google Tag Manager"
              description="Administrer alle dine tracking tags fra ét sted."
              idField="gtmId"
              enableField="enableGtm"
              placeholder="GTM-XXXXXXX"
              settings={settings}
              handleInputChange={handleInputChange}
              handleToggle={handleToggle}
            />

            <TrackingIntegration
              title="Google Analytics"
              description="Få indsigt i din webstedstrafik."
              idField="googleAnalyticsId"
              enableField="enableGoogleAnalytics"
              placeholder="G-XXXXXXXXXX"
              settings={settings}
              handleInputChange={handleInputChange}
              handleToggle={handleToggle}
            />
            
            <TrackingIntegration
              title="Meta Pixel (Facebook)"
              description="Mål, optimer og opbyg målgrupper for dine annoncekampagner."
              idField="facebookPixelId"
              enableField="enableFacebookPixel"
              placeholder="Indtast dit Facebook Pixel ID"
              settings={settings}
              handleInputChange={handleInputChange}
              handleToggle={handleToggle}
            />

             <TrackingIntegration
              title="Google Ads"
              description="Mål konverteringer fra dine Google Ads-kampagner."
              idField="googleAdsId"
              enableField="enableGoogleAds"
              placeholder="AW-XXXXXXXXX"
              settings={settings}
              handleInputChange={handleInputChange}
              handleToggle={handleToggle}
            />

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Vigtigt om GDPR</AlertTitle>
              <AlertDescription>
                Husk at du skal have et cookie-banner og en privatlivspolitik, der informerer brugerne om, hvilke data du indsamler. Denne funktion implementerer ikke et cookie-banner.
              </AlertDescription>
            </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TrackingSettingsPage() {
    return (
        <CmsLayout>
            <TrackingSettingsPageContent />
        </CmsLayout>
    )
}
