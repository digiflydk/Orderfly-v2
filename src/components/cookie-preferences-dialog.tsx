"use client";
import type { Dispatch, SetStateAction } from 'react';
import type { PublicCookieTexts } from '@/lib/cookie-texts';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';

type Preferences = { necessary: boolean; functional: boolean; statistics: boolean; marketing: boolean };

function CookieCategory({ title, description, checked, onCheckedChange, disabled = false, alwaysActive = 'Altid aktiv' }: { alwaysActive?: string; title: string, description: string, checked: boolean, onCheckedChange?: (checked: boolean) => void, disabled?: boolean }) {
    return (
        <div className="space-y-2">
            <div className="flex items-start justify-between">
                <div className="flex-1 pr-4">
                    <h4 className="font-semibold text-base">{title}</h4>
                </div>
                {disabled ? (
                     <Badge variant="outline" className="text-green-600 border-green-600">{alwaysActive}</Badge>
                ) : (
                    <Switch
                        checked={checked}
                        onCheckedChange={onCheckedChange}
                        disabled={disabled}
                        aria-label={title}
                    />
                )}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    )
}

export default function CookiePreferencesDialog({ texts, preferences, setPreferences, open, onOpenChange, onSave, onAcceptAll }: {
  texts: PublicCookieTexts; preferences: Preferences; setPreferences: Dispatch<SetStateAction<Preferences>>;
  open: boolean; onOpenChange: (open: boolean) => void; onSave: () => void; onAcceptAll: () => void;
}) {
  const categories = texts?.categories ?? {};
  const compatCategories = {
    necessary: categories.necessary,
    functional: categories.functional,
    statistics: categories.statistics ?? categories.analytics,
    marketing: categories.marketing,
    performance: categories.performance
  };


  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-2xl">{texts.modal_title}</DialogTitle>
            <DialogDescription>{texts.modal_description}</DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="px-6 py-4 space-y-4">
             <CookieCategory
                title={compatCategories.necessary.title}
                description={compatCategories.necessary.description}
                checked={true}
                disabled
                alwaysActive={texts.language.toLowerCase().split('-')[0] === 'da' ? 'Altid aktiv' : 'Always active'}
             />
              <Separator />
               <CookieCategory
                title={compatCategories.functional.title}
                description={compatCategories.functional.description}
                checked={preferences.functional}
                onCheckedChange={(checked) => setPreferences(p => ({...p, functional: checked}))}
              />
               <Separator />
              <CookieCategory
                title={compatCategories.statistics.title}
                description={compatCategories.statistics.description}
                checked={preferences.statistics}
                onCheckedChange={(checked) => setPreferences(p => ({...p, statistics: checked}))}
              />
               <Separator />
              <CookieCategory
                title={compatCategories.marketing.title}
                description={compatCategories.marketing.description}
                checked={preferences.marketing}
                onCheckedChange={(checked) => setPreferences(p => ({...p, marketing: checked}))}
              />
          </div>
          <DialogFooter className="p-6 bg-muted/50 border-t flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto h-11" onClick={onSave}>{texts.save_preferences_button}</Button>
            <Button className="w-full sm:w-auto h-11" onClick={onAcceptAll}>{texts.modal_accept_all_button}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
