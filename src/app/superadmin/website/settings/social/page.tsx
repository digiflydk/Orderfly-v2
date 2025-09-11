
"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { GeneralSettings } from "@/types/settings";
import { getSettingsAction, saveSettingsAction } from "@/app/superadmin/website/actions";
import { Loader2, Linkedin, Facebook, Twitter, Instagram, Clapperboard } from "lucide-react";
import CmsLayout from '../../_cmsLayout';

function SocialSettingsPageContent() {
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
    
  const socialPlatforms = [
    { name: 'linkedinUrl', label: 'LinkedIn', icon: Linkedin },
    { name: 'facebookUrl', label: 'Facebook', icon: Facebook },
    { name: 'twitterUrl', label: 'X (Twitter)', icon: Twitter },
    { name: 'instagramUrl', label: 'Instagram', icon: Instagram },
    { name: 'tiktokUrl', label: 'TikTok', icon: Clapperboard },
  ] as const;

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
          <CardTitle>Social Share</CardTitle>
          <CardDescription>Tilføj et billede, der skal vises, når din side deles på sociale netværk.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="social-share-image">Social Share Billede URL</Label>
                    <Input 
                        id="social-share-image" 
                        placeholder="Indsæt URL til billede"
                        value={settings.socialShareImageUrl || ''}
                        onChange={e => handleInputChange('socialShareImageUrl', e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">Anbefalet størrelse: 1200x630 pixels.</p>
                </div>
            </div>
            <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg p-4 bg-muted/50 w-full aspect-[1.91/1] flex flex-col justify-center items-center">
                    {settings.socialShareImageUrl ? (
                        <Image src={settings.socialShareImageUrl} alt="Preview af social delingsbillede" width={1200} height={630} className="rounded-md object-cover max-w-full max-h-full" />
                    ) : (
                        <p className="text-muted-foreground text-center">Intet billede valgt</p>
                    )}
                </div>
                 <div className="p-4 border rounded-lg bg-white">
                    <p className="text-xs text-muted-foreground truncate">{settings.websiteTitle || "digifly.dk"}</p>
                    <h3 className="font-semibold truncate">{settings.seoTitle || "OrderFly - Flow. Digitalisér. Skalér."}</h3>
                    <p className="text-sm text-muted-foreground text-ellipsis line-clamp-2">{settings.metaDescription || "Beskrivelse hentes fra SEO-fanen..."}</p>
                </div>
            </div>
        </CardContent>
      </Card>
      
       <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Sociale Links</CardTitle>
          <CardDescription>Tilføj links til dine sociale medie-profiler. De vil blive vist i footeren.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {socialPlatforms.map(platform => (
                <div key={platform.name} className="flex items-center gap-4">
                    <platform.icon className="h-6 w-6 text-muted-foreground" />
                    <Input 
                        id={platform.name}
                        placeholder={`https://www.${platform.label.toLowerCase().split(' ')[0]}.com/dit-profil`}
                        value={settings[platform.name as keyof typeof settings] as string || ''}
                        onChange={(e) => handleInputChange(platform.name, e.target.value)}
                    />
                </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}


export default function SocialSettingsPage() {
    return (
        <CmsLayout>
            <SocialSettingsPageContent />
        </CmsLayout>
    )
}
