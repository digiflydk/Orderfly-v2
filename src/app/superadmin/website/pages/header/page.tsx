
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import type { GeneralSettings, NavLink } from '@/types/settings';
import { getSettingsAction, saveSettingsAction } from '@/app/superadmin/website/actions';
import { Loader2, Trash2, Monitor, Smartphone, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, ArrowRight, GripVertical } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { ensureAllSectionPadding, SectionKey } from '@/lib/settings-utils';

function hslToHex(h: number, s: number, l: number) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): { h: number, s: number, l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function HslColorPicker({
  label,
  color,
  onChange,
}: {
  label: string;
  color: { h: number; s: number; l: number };
  onChange: (hsl: { h: number; s: number; l: number }) => void;
}) {
    const [hexInputValue, setHexInputValue] = useState(hslToHex(color.h, color.s, color.l));
    
    useEffect(() => {
        setHexInputValue(hslToHex(color.h, color.s, color.l));
    }, [color]);

    const handleColorChange = (part: 'h' | 's' | 'l', value: number) => {
        onChange({ ...color, [part]: value });
    };

    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setHexInputValue(e.target.value);
    }

    const handleHexBlur = () => {
        const newHsl = hexToHsl(hexInputValue);
        if(newHsl) {
            onChange(newHsl);
        } else {
            // If invalid hex, reset input to current valid color
            setHexInputValue(hslToHex(color.h, color.s, color.l));
        }
    }
  
    const handleHexKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleHexBlur();
            (e.target as HTMLInputElement).blur();
        }
    }


    return (
        <div className="space-y-4 p-4 border rounded-lg" style={{ backgroundColor: `hsl(${color.h}, ${color.s}%, ${color.l}%)` }}>
            <div className="flex justify-between items-center">
                 <h3 className="font-semibold text-lg" style={{ color: color.l > 50 ? '#000' : '#FFF' }}>{label}</h3>
                 <div className="flex items-center gap-2">
                    <span className="font-mono text-sm uppercase" style={{ color: color.l > 50 ? '#000' : '#FFF' }}>HEX</span>
                    <Input 
                        value={hexInputValue}
                        onChange={handleHexChange}
                        onBlur={handleHexBlur}
                        onKeyDown={handleHexKeyPress}
                        className="w-24 font-mono"
                        style={{
                            backgroundColor: 'hsla(0, 0%, 100%, 0.2)',
                            color: color.l > 50 ? '#000' : '#FFF',
                            borderColor: 'hsla(0, 0%, 100%, 0.3)'
                        }}
                    />
                </div>
            </div>
            <div className="space-y-2">
                <Label style={{ color: color.l > 50 ? '#000' : '#FFF' }}>Hue ({color.h})</Label>
                <Slider value={[color.h]} onValueChange={([v]) => handleColorChange('h', v)} max={360} step={1} />
            </div>
            <div className="space-y-2">
                <Label style={{ color: color.l > 50 ? '#000' : '#FFF' }}>Saturation ({color.s}%)</Label>
                <Slider value={[color.s]} onValueChange={([v]) => handleColorChange('s', v)} max={100} step={1} />
            </div>
            <div className="space-y-2">
                <Label style={{ color: color.l > 50 ? '#000' : '#FFF' }}>Lightness ({color.l}%)</Label>
                <Slider value={[color.l]} onValueChange={([v]) => handleColorChange('l', v)} max={100} step={1} />
            </div>
        </div>
    )
}

const themeColorOptions = [
    { value: 'text-primary', label: 'Primary' },
    { value: 'text-secondary-foreground', label: 'Secondary' },
    { value: 'text-accent', label: 'Accent' },
    { value: 'text-foreground', label: 'Default Text' },
    { value: 'text-muted-foreground', label: 'Muted Text' },
    { value: 'text-white', label: 'White' },
    { value: 'text-black', label: 'Black' },
] as const;

type ThemeColor = typeof themeColorOptions[number]['value'];

function NavLinkStyleEditor({
    label,
    colorValue,
    onColorChange,
    hoverColorValue,
    onHoverColorChange,
    sizeValue,
    onSizeChange,
    iconColorValue,
    onIconColorChange,
}: {
    label: string;
    colorValue: ThemeColor;
    onColorChange: (value: ThemeColor) => void;
    hoverColorValue: ThemeColor;
    onHoverColorChange: (value: ThemeColor) => void;
    sizeValue: number;
    onSizeChange: (value: number) => void;
    iconColorValue: ThemeColor;
    onIconColorChange: (value: ThemeColor) => void;
}) {
    return (
        <div className="p-4 border rounded-lg space-y-4">
            <h3 className="font-semibold">{label}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Tekstfarve</Label>
                    <Select value={colorValue} onValueChange={onColorChange}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            {themeColorOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="space-y-2">
                    <Label>Hover Farve</Label>
                    <Select value={hoverColorValue} onValueChange={onHoverColorChange}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            {themeColorOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Tekststørrelse</Label>
                    <span className="text-sm text-muted-foreground">{sizeValue}px</span>
                </div>
                <Slider 
                    value={[sizeValue]} 
                    onValueChange={([v]) => onSizeChange(v)}
                    min={12}
                    max={24}
                    step={1}
                />
            </div>
            <div className="space-y-2">
                <Label>Mobil Menu Ikonfarve</Label>
                <Select value={iconColorValue} onValueChange={onIconColorChange}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        {themeColorOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

const sectionLinks = [
    { value: '#hero', label: 'Hero Sektion' },
    { value: '#services', label: 'Services' },
    { value: '#ai-project', label: 'AI Projekt' },
    { value: '#cases', label: 'Cases' },
    { value: '#om-os', label: 'Om Os' },
    { value: '#kontakt', label: 'Kontakt' },
    { value: 'custom', label: 'Brugerdefineret link' },
]

function NavLinkEditor({ item, updateItem }: { item: NavLink, updateItem: (data: NavLink) => void }) {
    const isCustomLink = !sectionLinks.some(l => l.value === item.href);
    const selectValue = isCustomLink ? 'custom' : item.href;

    const handleSelectChange = (value: string) => {
        if (value === 'custom') {
            updateItem({ ...item, href: '' });
        } else {
            updateItem({ ...item, href: value });
        }
    };
    
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor={`label-${item.label}`}>Tekst</Label>
                <Input
                    id={`label-${item.label}`}
                    value={item.label}
                    onChange={e => updateItem({ ...item, label: e.target.value })}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor={`href-select-${item.label}`}>Link til</Label>
                <Select value={selectValue} onValueChange={handleSelectChange}>
                    <SelectTrigger id={`href-select-${item.label}`}><SelectValue/></SelectTrigger>
                    <SelectContent>
                        {sectionLinks.map(link => (
                            <SelectItem key={link.value} value={link.value}>{link.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {selectValue === 'custom' && (
                <div className="space-y-2">
                    <Label htmlFor={`href-input-${item.label}`}>Brugerdefineret Link</Label>
                     <Input
                        id={`href-input-${item.label}`}
                        value={item.href}
                        placeholder="f.eks. https://eksempel.dk"
                        onChange={e => updateItem({ ...item, href: e.target.value })}
                    />
                </div>
            )}
        </div>
    );
}


function EditableNavLinkItem({ index, item, updateItem, removeItem }: { 
    index: number, 
    item: NavLink, 
    updateItem: (index: number, data: NavLink) => void, 
    removeItem: (index: number) => void
}) {
    return (
        <AccordionItem value={`item-${index}`}>
            <div className="flex justify-between w-full items-center">
                <AccordionTrigger className="flex-1 pr-4 text-left">
                    <span>{item.label || `Nyt Link`}</span>
                </AccordionTrigger>
                <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            </div>
            <AccordionContent className="p-4 border-t">
                <NavLinkEditor item={item} updateItem={(data) => updateItem(index, data)} />
            </AccordionContent>
        </AccordionItem>
    );
}

const defaultNavLinks: NavLink[] = [
  { href: '#services', label: 'Services' },
  { href: '#cases', label: 'Cases' },
  { href: '#om-os', label: 'Om os' },
  { href: '#kontakt', label: 'Kontakt' },
];

export default function CmsHeaderPage() {
    const [settings, setSettings] = useState<Partial<GeneralSettings>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, startSaving] = useTransition();
    const { toast } = useToast();

    useEffect(() => {
        async function loadSettings() {
            setIsLoading(true);
            const loadedSettings = await getSettingsAction();
            
            const newSettings: Partial<GeneralSettings> = { ...loadedSettings };

            newSettings.headerNavLinks = newSettings.headerNavLinks && newSettings.headerNavLinks.length > 0 ? newSettings.headerNavLinks : defaultNavLinks;
            newSettings.headerInitialBackgroundColor = newSettings.headerInitialBackgroundColor || { h: 0, s: 0, l: 100 };
            newSettings.headerInitialBackgroundOpacity = newSettings.headerInitialBackgroundOpacity ?? 0;
            newSettings.headerScrolledBackgroundColor = newSettings.headerScrolledBackgroundColor || { h: 210, s: 100, l: 95 };
            newSettings.headerScrolledBackgroundOpacity = newSettings.headerScrolledBackgroundOpacity ?? 95;
            newSettings.headerIsSticky = newSettings.headerIsSticky ?? true;
            newSettings.headerLogoWidth = newSettings.headerLogoWidth || 96;
            newSettings.headerHeight = newSettings.headerHeight || 64;
            newSettings.headerLinkColor = newSettings.headerLinkColor || 'text-foreground';
            newSettings.headerLinkHoverColor = newSettings.headerLinkHoverColor || 'text-primary';
            newSettings.headerLinkSize = newSettings.headerLinkSize || 14;
            newSettings.headerMenuIconColor = newSettings.headerMenuIconColor || 'text-foreground';
            
            setSettings(newSettings);
            setIsLoading(false);
        }
        loadSettings();
    }, []);
  
    const handleInputChange = (field: keyof GeneralSettings, value: any) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleListUpdate = <T,>(listName: keyof GeneralSettings, index: number, data: T) => {
        const list = (settings[listName] as T[] || []);
        const newList = [...list];
        newList[index] = data;
        handleInputChange(listName, newList);
    };

    const handleListAdd = <T extends object,>(listName: keyof GeneralSettings, newItem: T) => {
        const list = (settings[listName] as T[] || []);
        handleInputChange(listName, [...list, newItem]);
    }
  
    const handleListRemove = (listName: keyof GeneralSettings, index: number) => {
        const list = (settings[listName] as any[] || []);
        const newList = list.filter((_, i) => i !== index);
        handleInputChange(listName, newList);
    };

    const handleSaveChanges = () => {
        startSaving(async () => {
            const result = await saveSettingsAction(settings);
            toast({
                title: result.success ? "Gemt!" : "Fejl!",
                description: result.message,
                variant: result.success ? "default" : "destructive",
            });
        });
    };

    if (isLoading) {
        return (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        );
    }
  
    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Header Indstillinger</h1>
                    <p className="text-muted-foreground">Tilpas udseendet af din sides header.</p>
                </div>
                <Button size="lg" onClick={handleSaveChanges} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Gem Ændringer
                </Button>
            </div>
            
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Generelt Design & Funktion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <Label htmlFor="sticky-header" className="text-base">Sticky Header</Label>
                            <p className="text-sm text-muted-foreground">Gør headeren fastlåst i toppen af siden.</p>
                        </div>
                        <Switch
                            id="sticky-header"
                            checked={settings.headerIsSticky}
                            onCheckedChange={(value) => handleInputChange('headerIsSticky', value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label>Header Højde</Label>
                            <span className="text-sm text-muted-foreground">{settings.headerHeight || 64}px</span>
                        </div>
                        <Slider 
                            value={[settings.headerHeight || 64]} 
                            onValueChange={([v]) => handleInputChange('headerHeight', v)}
                            min={48}
                            max={120}
                            step={1}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label>Logo Bredde</Label>
                            <span className="text-sm text-muted-foreground">{settings.headerLogoWidth || 96}px</span>
                        </div>
                        <Slider 
                            value={[settings.headerLogoWidth || 96]} 
                            onValueChange={([v]) => handleInputChange('headerLogoWidth', v)}
                            min={50}
                            max={250}
                            step={1}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                 <CardHeader>
                    <CardTitle>Baggrundsfarve</CardTitle>
                    <CardDescription>Styr headerens udseende i toppen af siden og når der scrolles.</CardDescription>
                </CardHeader>
                 <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4 p-4 border rounded-lg">
                         <h3 className="font-semibold">Normal Tilstand (Top)</h3>
                        {settings.headerInitialBackgroundColor &&
                            <HslColorPicker 
                                label="Baggrundsfarve"
                                color={settings.headerInitialBackgroundColor}
                                onChange={(hsl) => handleInputChange('headerInitialBackgroundColor', hsl)}
                            />
                        }
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label>Gennemsigtighed</Label>
                                <span className="text-sm text-muted-foreground">{settings.headerInitialBackgroundOpacity || 0}%</span>
                            </div>
                            <Slider 
                                value={[settings.headerInitialBackgroundOpacity || 0]} 
                                onValueChange={([v]) => handleInputChange('headerInitialBackgroundOpacity', v)}
                                min={0}
                                max={100}
                                step={1}
                            />
                        </div>
                    </div>
                     <div className="space-y-4 p-4 border rounded-lg">
                        <h3 className="font-semibold">Scrollet Tilstand</h3>
                        {settings.headerScrolledBackgroundColor &&
                            <HslColorPicker 
                                label="Baggrundsfarve"
                                color={settings.headerScrolledBackgroundColor}
                                onChange={(hsl) => handleInputChange('headerScrolledBackgroundColor', hsl)}
                            />
                        }
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label>Gennemsigtighed</Label>
                                <span className="text-sm text-muted-foreground">{settings.headerScrolledBackgroundOpacity || 95}%</span>
                            </div>
                            <Slider 
                                value={[settings.headerScrolledBackgroundOpacity || 95]} 
                                onValueChange={([v]) => handleInputChange('headerScrolledBackgroundOpacity', v)}
                                min={0}
                                max={100}
                                step={1}
                            />
                        </div>
                    </div>
                 </CardContent>
            </Card>


            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Navigationslinks & Menu</CardTitle>
                    <CardDescription>Tilpas udseendet og indholdet af links og ikoner i headeren.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Label>Navigationslinks</Label>
                    <Accordion type="multiple" className="w-full border rounded-md">
                        {(settings.headerNavLinks || []).map((link, index) => (
                           <EditableNavLinkItem
                                key={index}
                                index={index}
                                item={link}
                                updateItem={(i, data) => handleListUpdate('headerNavLinks', i, data)}
                                removeItem={(i) => handleListRemove('headerNavLinks', i)}
                           />
                        ))}
                    </Accordion>
                    <Button variant="outline" onClick={() => handleListAdd('headerNavLinks', { label: 'Nyt Link', href: '#' })}>Tilføj Link</Button>
                    <hr/>
                   {settings.headerLinkColor && typeof settings.headerLinkSize !== 'undefined' && settings.headerLinkHoverColor && settings.headerMenuIconColor &&
                        <NavLinkStyleEditor 
                            label="Styling for links og ikoner"
                            colorValue={settings.headerLinkColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('headerLinkColor', v)}
                            hoverColorValue={settings.headerLinkHoverColor as ThemeColor}
                            onHoverColorChange={(v) => handleInputChange('headerLinkHoverColor', v)}
                            sizeValue={settings.headerLinkSize}
                            onSizeChange={(v) => handleInputChange('headerLinkSize', v)}
                            iconColorValue={settings.headerMenuIconColor as ThemeColor}
                            onIconColorChange={(v) => handleInputChange('headerMenuIconColor', v)}
                        />
                    }
                </CardContent>
            </Card>
        </div>
    );
}
