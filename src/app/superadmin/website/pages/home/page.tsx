

'use client';

import { useState, useEffect, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Service, Case, TeamMember, SectionPadding, SectionVisibility, Alignment, NavLink } from '@/types/settings';
import type { GeneralSettings } from '@/types/settings';
import { getSettingsAction, saveSettingsAction } from '@/app/superadmin/website/actions';
import { Loader2, Trash2, Monitor, Smartphone, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, ArrowRight, GripVertical } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
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

const defaultSectionOrder = ['feature', 'services', 'aiProject', 'cases', 'about', 'customers'];

const defaultServices: Service[] = [
  {
    title: 'Digital Strategi',
    description: 'Vi lægger en køreplan for jeres digitale transformation med fokus på ROI og forretningsmål.',
    imageUrl: 'https://picsum.photos/600/400?random=1',
    aiHint: 'strategy business',
  },
  {
    title: 'Softwareudvikling',
    description: 'Skræddersyede softwareløsninger, fra web-apps til komplekse systemintegrationer.',
    imageUrl: 'https://picsum.photos/600/400?random=2',
    aiHint: 'software development',
  },
  {
    title: 'AI & Automatisering',
    description: 'Implementering af kunstig intelligens og automatisering for at optimere jeres workflows.',
    imageUrl: 'https://picsum.photos/600/400?random=3',
    aiHint: 'artificial intelligence',
  },
  {
    title: 'Cloud Løsninger',
    description: 'Sikker og skalerbar cloud-infrastruktur, der understøtter jeres vækstambitioner.',
    imageUrl: 'https://picsum.photos/600/400?random=4',
    aiHint: 'cloud infrastructure',
  },
];

const defaultCases: Case[] = [
  {
    title: 'Automatiseret Fakturering',
    description: 'Udvikling af et system der sparede en mellemstor virksomhed for 20+ timer i manuelt tastearbejde om ugen.',
    imageUrl: 'https://picsum.photos/600/400?random=5',
    link: '#',
    aiHint: 'invoice automation',
  },
  {
    title: 'Dynamisk Prissætnings-AI',
    description: 'En AI-model for en webshop der optimerede priser i realtid og øgede overskuddet med 12%.',
    imageUrl: 'https://picsum.photos/600/400?random=6',
    link: '#',
    aiHint: 'pricing algorithm',
  },
  {
    title: 'Skalerbar Cloud Platform',
    description: 'Migration til en moderne cloud-arkitektur, der håndterede en 10x stigning i trafik uden problemer.',
    imageUrl: 'https://picsum.photos/600/400?random=7',
    link: '#',
    aiHint: 'cloud platform',
  },
];

const defaultTeam: TeamMember[] = [
  {
    name: 'Alex Andersen',
    title: 'Lead Developer & Arkitekt',
    description: 'Specialist i skalerbare systemer og komplekse integrationer. Elsker at bygge robuste løsninger.',
    imageUrl: 'https://picsum.photos/200/200?random=8',
    linkedinUrl: '#',
    aiHint: 'male portrait',
  },
  {
    name: 'Maria Jensen',
    title: 'AI & Data Specialist',
    description: 'Transformerer data til forretningsværdi gennem machine learning og intelligente automatiseringer.',
    imageUrl: 'https://picsum.photos/200/200?random=9',
    linkedinUrl: '#',
    aiHint: 'female portrait',
  },
  {
    name: 'Jesper Nielsen',
    title: 'Digital Strateg & Projektleder',
    description: 'Sikrer at teknologien understøtter forretningsmålene og at projekter leveres til tiden.',
    imageUrl: 'https://picsum.photos/200/200?random=10',
    linkedinUrl: '#',
    aiHint: 'man portrait',
  },
];

const defaultAboutText = "Digifly er et agilt konsulenthus grundlagt af erfarne teknologer med en passion for at skabe flow. Vi tror på, at de rigtige digitale løsninger kan frigøre potentiale og drive markant vækst. Vores mission er at være jeres betroede partner på den digitale rejse – fra idé til implementering og skalering.";

const defaultPadding: SectionPadding = { top: 96, bottom: 96, topMobile: 64, bottomMobile: 64 };

const defaultVisibility: SectionVisibility = {
    feature: true,
    services: true,
    aiProject: true,
    cases: true,
    about: true,
    customers: true,
    contact: true,
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

const sectionLinks = [
    { value: '#hero', label: 'Hero Sektion' },
    { value: '#feature', label: 'Fremhævet Sektion' },
    { value: '#services', label: 'Services' },
    { value: '#ai-project', label: 'AI Projekt' },
    { value: '#om-os', label: 'Om Os' },
    { value: '#customers', label: 'Kunder' },
    { value: '#kontakt', label: 'Kontakt' },
    { value: 'custom', label: 'Brugerdefineret link' },
];


function HslColorPicker({
  label,
  color,
  onChange,
}: {
  label: string;
  color: { h: number; s: number; l: number };
  onChange: (hsl: { h: number; s: number; l: number }) => void;
}) {
    function hslToHex(h: number, s: number, l: number) {
      l /= 100;
      const a = (s * Math.min(l, 1 - l)) / 100;
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    }
    function hexToHsl(hex: string): { h: number, s: number, l: number } | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return null;
        let r = parseInt(result[1], 16) / 255, g = parseInt(result[2], 16) / 255, b = parseInt(result[3], 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max === min) { h = s = 0; } else {
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
    const [hexInputValue, setHexInputValue] = useState(hslToHex(color.h, color.s, color.l));
    useEffect(() => { setHexInputValue(hslToHex(color.h, color.s, color.l)); }, [color]);
    const handleColorChange = (part: 'h' | 's' | 'l', value: number) => { onChange({ ...color, [part]: value }); };
    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => { setHexInputValue(e.target.value); }
    const handleHexBlur = () => {
        const newHsl = hexToHsl(hexInputValue);
        if(newHsl) { onChange(newHsl); } else { setHexInputValue(hslToHex(color.h, color.s, color.l)); }
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
                    <Input value={hexInputValue} onChange={handleHexChange} onBlur={handleHexBlur} onKeyDown={handleHexKeyPress} className="w-24 font-mono" style={{ backgroundColor: 'hsla(0, 0%, 100%, 0.2)', color: color.l > 50 ? '#000' : '#FFF', borderColor: 'hsla(0, 0%, 100%, 0.3)' }}/>
                </div>
            </div>
            <div className="space-y-2"> <Label style={{ color: color.l > 50 ? '#000' : '#FFF' }}>Hue ({color.h})</Label> <Slider value={[color.h]} onValueChange={([v]) => handleColorChange('h', v)} max={360} step={1} /> </div>
            <div className="space-y-2"> <Label style={{ color: color.l > 50 ? '#000' : '#FFF' }}>Saturation ({color.s}%)</Label> <Slider value={[color.s]} onValueChange={([v]) => handleColorChange('s', v)} max={100} step={1} /> </div>
            <div className="space-y-2"> <Label style={{ color: color.l > 50 ? '#000' : '#FFF' }}>Lightness ({color.l}%)</Label> <Slider value={[color.l]} onValueChange={([v]) => handleColorChange('l', v)} max={100} step={1} /> </div>
        </div>
    )
}

function AlignmentControl({ value, onValueChange }: { value: Alignment, onValueChange: (value: Alignment) => void}) {
    return (
        <div className="p-4 border rounded-lg space-y-2 bg-muted/20">
            <Label>Justering</Label>
            <ToggleGroup 
                type="single" 
                value={value}
                onValueChange={(v: Alignment) => v && onValueChange(v)}
                className='w-full'
            >
                <ToggleGroupItem value="left" aria-label="Venstre" className='flex-1'><AlignHorizontalJustifyStart className='h-4 w-4'/></ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Center" className='flex-1'><AlignHorizontalJustifyCenter className='h-4 w-4'/></ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Højre" className='flex-1'><AlignHorizontalJustifyEnd className='h-4 w-4'/></ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}


function TextStyleEditor({
    label,
    colorValue,
    onColorChange,
    desktopSize,
    onDesktopSizeChange,
    mobileSize,
    onMobileSizeChange,
    previewMode,
    isOptional = false
}: {
    label: string;
    colorValue?: ThemeColor;
    onColorChange?: (value: ThemeColor) => void;
    desktopSize: number;
    onDesktopSizeChange: (value: number) => void;
    mobileSize: number;
    onMobileSizeChange: (value: number) => void;
    previewMode: 'desktop' | 'mobile';
    isOptional?: boolean;
}) {
    const size = previewMode === 'desktop' ? desktopSize : mobileSize;
    const onSizeChange = previewMode === 'desktop' ? onDesktopSizeChange : onMobileSizeChange;
    const max = previewMode === 'desktop' ? 120 : 80;

    return (
        <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
            <h3 className="font-semibold md:col-span-2">{label}</h3>
             {!isOptional && colorValue && onColorChange && (
                <div className="space-y-2">
                    <Label>Farve</Label>
                    <Select value={colorValue} onValueChange={onColorChange}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            {themeColorOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>
                        <span className="flex items-center gap-2">
                            {previewMode === 'desktop' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                            Størrelse
                        </span>
                    </Label>
                    <span className="text-sm text-muted-foreground">{size}px</span>
                </div>
                <Slider 
                    value={[size]} 
                    onValueChange={([v]) => onSizeChange(v)}
                    min={10}
                    max={max}
                    step={1}
                />
            </div>
        </div>
    );
}

function EditableListItem({ index, item, updateItem, removeItem, fields, titleField }: { 
    index: number, 
    item: any, 
    updateItem: (index: number, data: any) => void, 
    removeItem: (index: number) => void,
    fields: {key: string, label: string, type?: 'textarea'}[],
    titleField: string
}) {
    const handleFieldChange = (field: string, value: string) => {
        updateItem(index, { ...item, [field]: value });
    };
    
    return (
        <AccordionItem value={`item-${index}`}>
            <div className="flex justify-between w-full items-center">
                <AccordionTrigger className="flex-1 pr-4 text-left">
                    <span>{item[titleField] || `Element ${index + 1}`}</span>
                </AccordionTrigger>
                <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            </div>
            <AccordionContent className="p-4 border-t">
                <div className="space-y-4">
                    {fields.map(field => (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={`item-${index}-${field.key}`}>{field.label}</Label>
                            {field.type === 'textarea' ? (
                                 <Textarea
                                    id={`item-${index}-${field.key}`}
                                    value={item[field.key] || ''}
                                    onChange={e => handleFieldChange(field.key, e.target.value)}
                                    rows={3}
                                    className="w-full"
                                />
                            ) : (
                                <Input
                                    id={`item-${index}-${field.key}`}
                                    value={item[field.key] || ''}
                                    onChange={e => handleFieldChange(field.key, e.target.value)}
                                    className="w-full"
                                />
                            )}
                        </div>
                    ))}
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}

function SpacingEditor({
  label,
  padding,
  onPaddingChange,
  previewMode,
}: {
  label: string;
  padding: SectionPadding;
  onPaddingChange: (value: number, part: keyof SectionPadding) => void;
  previewMode: 'desktop' | 'mobile';
}) {
  return (
    <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
      <h3 className="font-semibold">{label}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        {previewMode === 'desktop' ? (
          <>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> Afstand i toppen
                </Label>
                <span className="text-sm text-muted-foreground">{padding.top || 0}px</span>
              </div>
              <Slider
                value={[padding.top || 0]}
                onValueChange={([v]) => onPaddingChange(v, 'top')}
                min={0}
                max={200}
                step={4}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> Afstand i bunden
                </Label>
                <span className="text-sm text-muted-foreground">{padding.bottom || 0}px</span>
              </div>
              <Slider
                value={[padding.bottom || 0]}
                onValueChange={([v]) => onPaddingChange(v, 'bottom')}
                min={0}
                max={200}
                step={4}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" /> Afstand i toppen
                </Label>
                <span className="text-sm text-muted-foreground">{padding.topMobile || 0}px</span>
              </div>
              <Slider
                value={[padding.topMobile || 0]}
                onValueChange={([v]) => onPaddingChange(v, 'topMobile')}
                min={0}
                max={150}
                step={4}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" /> Afstand i bunden
                </Label>
                <span className="text-sm text-muted-foreground">{padding.bottomMobile || 0}px</span>
              </div>
              <Slider
                value={[padding.bottomMobile || 0]}
                onValueChange={([v]) => onPaddingChange(v, 'bottomMobile')}
                min={0}
                max={150}
                step={4}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SortableSection({ id, children }: { id: string, children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative">
            {children}
            <div {...attributes} {...listeners} className="absolute top-4 right-4 z-10 p-2 cursor-grab text-muted-foreground hover:bg-muted rounded-md active:cursor-grabbing">
                <GripVertical className="h-5 w-5" />
            </div>
        </div>
    );
}

export default function CmsHomePage() {
  const [settings, setSettings] = useState<Partial<GeneralSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startSaving] = useTransition();
  const { toast } = useToast();
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activeAccordionItem, setActiveAccordionItem] = useState<string[]>([]);


  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      const loadedSettings = await getSettingsAction();
      const initialSettings = loadedSettings || {};
      
      setSettings({
          ...initialSettings,
          homePageSectionOrder: initialSettings.homePageSectionOrder?.filter(id => id !== 'blog') ?? defaultSectionOrder,
          
          heroHeadline: initialSettings.heroHeadline ?? 'Flow. Automatisér. Skalér.',
          heroHeadlineColor: initialSettings.heroHeadlineColor ?? 'text-white',
          heroHeadlineSize: initialSettings.heroHeadlineSize ?? 64,
          heroHeadlineSizeMobile: initialSettings.heroHeadlineSizeMobile ?? 40,
          heroDescription: initialSettings.heroDescription ?? 'Vi hjælper virksomheder med at bygge skalerbare digitale løsninger, der optimerer processer og driver vækst.',
          heroDescriptionColor: initialSettings.heroDescriptionColor ?? 'text-primary-foreground/80',
          heroDescriptionSize: initialSettings.heroDescriptionSize ?? 18,
          heroDescriptionSizeMobile: initialSettings.heroDescriptionSizeMobile ?? 16,
          heroEnableGradientOverlay: initialSettings.heroEnableGradientOverlay ?? true,
          heroImageGrid: initialSettings.heroImageGrid && initialSettings.heroImageGrid.length === 4 ? initialSettings.heroImageGrid : Array(4).fill({ imageUrl: '', alt: ''}),
          heroAlignment: initialSettings.heroAlignment ?? 'center',
          heroVerticalAlignment: initialSettings.heroVerticalAlignment ?? 'center',
          heroTextMaxWidth: initialSettings.heroTextMaxWidth ?? 700,
          heroCtaEnabled: initialSettings.heroCtaEnabled ?? false,
          heroCtaText: initialSettings.heroCtaText ?? 'Kontakt Os',
          heroCtaLink: initialSettings.heroCtaLink ?? '#kontakt',
          heroCtaVariant: initialSettings.heroCtaVariant ?? 'default',
          heroCtaSize: initialSettings.heroCtaSize ?? 'lg',
          heroCtaTextSize: initialSettings.heroCtaTextSize ?? 16,
          heroCtaTextSizeMobile: initialSettings.heroCtaTextSizeMobile ?? 14,
          
          featureSectionHeading: initialSettings.featureSectionHeading ?? 'Fremhævet Overskrift',
          featureSectionHeadingColor: initialSettings.featureSectionHeadingColor ?? 'text-foreground',
          featureSectionHeadingSize: initialSettings.featureSectionHeadingSize ?? 48,
          featureSectionHeadingSizeMobile: initialSettings.featureSectionHeadingSizeMobile ?? 36,
          featureSectionBody: initialSettings.featureSectionBody ?? "Dette er en beskrivelse af den fremhævede funktion. Du kan redigere denne tekst i CMS'et. Det er et godt sted at uddybe fordelene ved dit produkt eller din service.",
          featureSectionBodyColor: initialSettings.featureSectionBodyColor ?? 'text-muted-foreground',
          featureSectionBodySize: initialSettings.featureSectionBodySize ?? 18,
          featureSectionBodySizeMobile: initialSettings.featureSectionBodySizeMobile ?? 16,
          featureSectionImageUrl: initialSettings.featureSectionImageUrl ?? 'https://picsum.photos/800/600',
          featureSectionAiHint: initialSettings.featureSectionAiHint ?? 'featured content',
          featureSectionCtaText: initialSettings.featureSectionCtaText ?? 'Lær Mere',
          featureSectionCtaLink: initialSettings.featureSectionCtaLink ?? '#',
          featureSectionCtaVariant: initialSettings.featureSectionCtaVariant ?? 'default',
          featureSectionCtaSize: initialSettings.featureSectionCtaSize ?? 'lg',
          featureSectionCtaTextSize: initialSettings.featureSectionCtaTextSize ?? 16,
          featureSectionCtaTextSizeMobile: initialSettings.featureSectionCtaTextSizeMobile ?? 14,
          featureSectionBackgroundColor: initialSettings.featureSectionBackgroundColor ?? { h: 210, s: 60, l: 98 },
          featureSectionAlignment: initialSettings.featureSectionAlignment ?? 'left',


          servicesSectionTitle: initialSettings.servicesSectionTitle ?? "Vores Services",
          servicesSectionTitleColor: initialSettings.servicesSectionTitleColor ?? "text-black",
          servicesSectionTitleSize: initialSettings.servicesSectionTitleSize ?? 36,
          servicesSectionDescription: initialSettings.servicesSectionDescription ?? "Vi tilbyder en bred vifte af ydelser for at accelerere jeres digitale rejse.",
          servicesSectionDescriptionColor: initialSettings.servicesSectionDescriptionColor ?? "text-muted-foreground",
          servicesSectionDescriptionSize: initialSettings.servicesSectionDescriptionSize ?? 18,
          servicesSectionAlignment: initialSettings.servicesSectionAlignment ?? 'center',
          servicesSectionBackgroundColor: initialSettings.servicesSectionBackgroundColor ?? { h: 210, s: 60, l: 98 },
          services: initialSettings.services && initialSettings.services.length > 0 ? initialSettings.services : defaultServices,
          serviceCardTitleColor: initialSettings.serviceCardTitleColor ?? "text-foreground",
          serviceCardTitleSize: initialSettings.serviceCardTitleSize ?? 24,
          serviceCardDescriptionColor: initialSettings.serviceCardDescriptionColor ?? "text-muted-foreground",
          serviceCardDescriptionSize: initialSettings.serviceCardDescriptionSize ?? 14,
          servicesCtaEnabled: initialSettings.servicesCtaEnabled ?? false,
          servicesCtaText: initialSettings.servicesCtaText ?? 'Book et møde med os',
          servicesCtaLink: initialSettings.servicesCtaLink ?? '#kontakt',
          servicesCtaVariant: initialSettings.servicesCtaVariant ?? 'default',
          servicesCtaSize: initialSettings.servicesCtaSize ?? 'lg',
          servicesCtaTextSize: initialSettings.servicesCtaTextSize ?? 16,
          servicesCtaTextSizeMobile: initialSettings.servicesCtaTextSizeMobile ?? 14,
          
          aiProjectSectionIconText: initialSettings.aiProjectSectionIconText ?? 'AI-drevet Projektkvalificering',
          aiProjectSectionTitle: initialSettings.aiProjectSectionTitle ?? 'Har du en idé? Lad os validere den sammen.',
          aiProjectSectionTitleColor: initialSettings.aiProjectSectionTitleColor ?? 'text-white',
          aiProjectSectionTitleSize: initialSettings.aiProjectSectionTitleSize ?? 36,
          aiProjectSectionDescription: initialSettings.aiProjectSectionDescription ?? 'Vores AI-assistent er designet til at forstå din vision. Start en samtale, og lad os sammen afdække potentialet i dit projekt. Det er det første, uforpligtende skridt mod at realisere din idé.',
          aiProjectSectionDescriptionColor: initialSettings.aiProjectSectionDescriptionColor ?? 'text-gray-300',
          aiProjectSectionDescriptionSize: initialSettings.aiProjectSectionDescriptionSize ?? 18,
          aiProjectSectionBackgroundColor: initialSettings.aiProjectSectionBackgroundColor ?? { h: 240, s: 10, l: 10 },
          aiProjectSectionAlignment: initialSettings.aiProjectSectionAlignment ?? 'left',

          casesSectionTitle: initialSettings.casesSectionTitle ?? "Vores Arbejde",
          casesSectionTitleColor: initialSettings.casesSectionTitleColor ?? "text-black",
          casesSectionTitleSize: initialSettings.casesSectionTitleSize ?? 36,
          casesSectionDescription: initialSettings.casesSectionDescription ?? "Se eksempler på, hvordan vi har hjulpet andre virksomheder med at opnå deres mål.",
          casesSectionDescriptionColor: initialSettings.casesSectionDescriptionColor ?? "text-muted-foreground",
          casesSectionDescriptionSize: initialSettings.casesSectionDescriptionSize ?? 18,
          casesSectionAlignment: initialSettings.casesSectionAlignment ?? 'center',
          cases: initialSettings.cases && initialSettings.cases.length > 0 ? initialSettings.cases : defaultCases,
          
          aboutSectionTitle: initialSettings.aboutSectionTitle ?? "Hvem er Digifly?",
          aboutSectionTitleColor: initialSettings.aboutSectionTitleColor ?? "text-black",
          aboutSectionTitleSize: initialSettings.aboutSectionTitleSize ?? 36,
          aboutText: initialSettings.aboutText ?? defaultAboutText,
          aboutTextColor: initialSettings.aboutTextColor ?? "text-muted-foreground",
          aboutTextSize: initialSettings.aboutTextSize ?? 18,
          aboutSectionAlignment: initialSettings.aboutSectionAlignment ?? 'left',
          teamMembers: initialSettings.teamMembers && initialSettings.teamMembers.length > 0 ? initialSettings.teamMembers : defaultTeam,
          teamMemberNameColor: initialSettings.teamMemberNameColor ?? 'text-foreground',
          teamMemberNameSize: initialSettings.teamMemberNameSize ?? 18,
          teamMemberTitleColor: initialSettings.teamMemberTitleColor ?? 'text-primary',
          teamMemberTitleSize: initialSettings.teamMemberTitleSize ?? 14,
          teamMemberDescriptionColor: initialSettings.teamMemberDescriptionColor ?? 'text-muted-foreground',
          teamMemberDescriptionSize: initialSettings.teamMemberDescriptionSize ?? 14,
          
          customersSectionTitle: initialSettings.customersSectionTitle ?? "Betroet af branchens bedste",
          customersSectionDescription: initialSettings.customersSectionDescription ?? "",
          customersSectionTitleColor: initialSettings.customersSectionTitleColor ?? "text-muted-foreground",
          customersSectionTitleSize: initialSettings.customersSectionTitleSize ?? 16,
          customersSectionDescriptionColor: initialSettings.customersSectionDescriptionColor ?? "text-muted-foreground",
          customersSectionDescriptionSize: initialSettings.customersSectionDescriptionSize ?? 18,
          customersSectionBackgroundColor: initialSettings.customersSectionBackgroundColor ?? { h: 210, s: 60, l: 98 },
          customersSectionAlignment: initialSettings.customersSectionAlignment ?? 'center',

          sectionPadding: initialSettings.sectionPadding ?? {},
          sectionVisibility: { ...defaultVisibility, ...initialSettings.sectionVisibility },
      });

      setIsLoading(false);
    }
    loadSettings();
  }, []);
  
  const handleInputChange = (field: keyof GeneralSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handlePaddingChange = (section: SectionKey, value: number, part: keyof SectionPadding) => {
    setSettings(prev => {
      const full = ensureAllSectionPadding(
        prev.sectionPadding as Partial<Record<SectionKey, SectionPadding>> | undefined,
        defaultPadding
      );
      const updated: SectionPadding = { ...full[section], [part]: value };
      return {
        ...prev,
        sectionPadding: { ...full, [section]: updated },
      } satisfies Partial<GeneralSettings>;
    });
  };

  const handleVisibilityChange = (section: keyof SectionVisibility, isVisible: boolean) => {
    setSettings(prev => {
        const prevVis = (prev.sectionVisibility ?? {}) as Partial<SectionVisibility>;

        const nextVis: SectionVisibility = {
            feature:   prevVis.feature   ?? defaultVisibility.feature!,
            services:  prevVis.services  ?? defaultVisibility.services!,
            aiProject: prevVis.aiProject ?? defaultVisibility.aiProject!,
            cases:     prevVis.cases     ?? defaultVisibility.cases!,
            about:     prevVis.about     ?? defaultVisibility.about!,
            customers: prevVis.customers ?? defaultVisibility.customers!,
            contact:   prevVis.contact   ?? defaultVisibility.contact!,
        };

        nextVis[section] = isVisible;

        return {
            ...prev,
            sectionVisibility: nextVis,
        } satisfies Partial<GeneralSettings>;
    });
  }

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
  
  const handleHeroGridChange = (index: number, field: 'imageUrl' | 'alt', value: string) => {
      const grid = [...(settings.heroImageGrid || [])];
      grid[index] = { ...grid[index], [field]: value };
      handleInputChange('heroImageGrid', grid);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
        setSettings((prev) => {
            const oldOrder = prev.homePageSectionOrder || [];
            const oldIndex = oldOrder.indexOf(active.id as string);
            const newIndex = oldOrder.indexOf(over!.id as string);
            return {
                ...prev,
                homePageSectionOrder: arrayMove(oldOrder, oldIndex, newIndex)
            }
        });
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const heroCtaIsCustomLink = !sectionLinks.some(l => l.value === settings.heroCtaLink);
  const heroCtaSelectValue = heroCtaIsCustomLink ? 'custom' : settings.heroCtaLink;
  const servicesCtaIsCustomLink = !sectionLinks.some(l => l.value === settings.servicesCtaLink);
  const servicesCtaSelectValue = servicesCtaIsCustomLink ? 'custom' : settings.servicesCtaLink;
  const featureCtaIsCustomLink = !sectionLinks.some(l => l.value === settings.featureSectionCtaLink);
  const featureCtaSelectValue = featureCtaIsCustomLink ? 'custom' : settings.featureSectionCtaLink;

  const sectionComponents: Record<string, React.ReactNode> = {
    hero: (
        <Card className="shadow-lg">
            <AccordionItem value="hero">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>Hero Sektion</CardTitle>
                        <CardDescription className="mt-1">Indholdet i toppen af siden.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-6 pt-6">
                         <div className="space-y-2">
                            <Label htmlFor="hero-headline">Overskrift</Label>
                            <Input id="hero-headline" value={settings.heroHeadline || ''} onChange={e => handleInputChange('heroHeadline', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                            label="Design for Overskrift"
                            colorValue={settings.heroHeadlineColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('heroHeadlineColor', v)}
                            desktopSize={settings.heroHeadlineSize || 64}
                            onDesktopSizeChange={(v) => handleInputChange('heroHeadlineSize', v)}
                            mobileSize={settings.heroHeadlineSizeMobile || 40}
                            onMobileSizeChange={(v) => handleInputChange('heroHeadlineSizeMobile', v)}
                            previewMode={previewMode}
                        />
                        <div className="space-y-2">
                            <Label htmlFor="hero-description">Beskrivelse</Label>
                            <Textarea id="hero-description" value={settings.heroDescription || ''} onChange={e => handleInputChange('heroDescription', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                            label="Design for Beskrivelse"
                            colorValue={settings.heroDescriptionColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('heroDescriptionColor', v)}
                            desktopSize={settings.heroDescriptionSize || 18}
                            onDesktopSizeChange={(v) => handleInputChange('heroDescriptionSize', v)}
                            mobileSize={settings.heroDescriptionSizeMobile || 16}
                            onMobileSizeChange={(v) => handleInputChange('heroDescriptionSizeMobile', v)}
                            previewMode={previewMode}
                        />
                        <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
                            <h3 className="font-semibold">Tekst Justering & Placering</h3>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                <div className="space-y-2">
                                    <Label>Horisontal Placering</Label>
                                    <ToggleGroup 
                                        type="single" 
                                        value={settings.heroAlignment}
                                        onValueChange={(value: Alignment) => value && handleInputChange('heroAlignment', value)}
                                        className='w-full'
                                    >
                                        <ToggleGroupItem value="left" aria-label="Venstre" className='flex-1'><AlignHorizontalJustifyStart className='h-4 w-4'/></ToggleGroupItem>
                                        <ToggleGroupItem value="center" aria-label="Center" className='flex-1'><AlignHorizontalJustifyCenter className='h-4 w-4'/></ToggleGroupItem>
                                        <ToggleGroupItem value="right" aria-label="Højre" className='flex-1'><AlignHorizontalJustifyEnd className='h-4 w-4'/></ToggleGroupItem>
                                    </ToggleGroup>
                                </div>
                                <div className="space-y-2">
                                    <Label>Vertikal Placering</Label>
                                    <ToggleGroup 
                                        type="single" 
                                        value={settings.heroVerticalAlignment}
                                        onValueChange={(value: 'top' | 'center' | 'bottom') => value && handleInputChange('heroVerticalAlignment', value)}
                                        className='w-full'
                                    >
                                        <ToggleGroupItem value="top" aria-label="Top" className='flex-1'><AlignVerticalJustifyStart className='h-4 w-4'/></ToggleGroupItem>
                                        <ToggleGroupItem value="center" aria-label="Center" className='flex-1'><AlignVerticalJustifyCenter className='h-4 w-4'/></ToggleGroupItem>
                                        <ToggleGroupItem value="bottom" aria-label="Bund" className='flex-1'><AlignVerticalJustifyEnd className='h-4 w-4'/></ToggleGroupItem>
                                    </ToggleGroup>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label>Maksimal tekstbredde</Label>
                                    <span className="text-sm text-muted-foreground">{settings.heroTextMaxWidth}px</span>
                                </div>
                                <Slider 
                                    value={[settings.heroTextMaxWidth || 700]} 
                                    onValueChange={([v]) => handleInputChange('heroTextMaxWidth', v)}
                                    min={300}
                                    max={1200}
                                    step={10}
                                />
                            </div>
                        </div>

                        <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">Call to Action Knap</h3>
                                <Switch
                                    checked={settings.heroCtaEnabled}
                                    onCheckedChange={(value) => handleInputChange('heroCtaEnabled', value)}
                                />
                            </div>
                            {settings.heroCtaEnabled && (
                                <div className='space-y-4'>
                                    <div className="space-y-2">
                                        <Label htmlFor="hero-cta-text">Knap Tekst</Label>
                                        <Input id="hero-cta-text" value={settings.heroCtaText || ''} onChange={e => handleInputChange('heroCtaText', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="hero-cta-link-select">Knap Link</Label>
                                        <Select
                                            value={heroCtaSelectValue || ''}
                                            onValueChange={(value) => handleInputChange('heroCtaLink', value === 'custom' ? '' : value)}
                                        >
                                            <SelectTrigger id="hero-cta-link-select"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {sectionLinks.map(link => (
                                                    <SelectItem key={link.value} value={link.value}>{link.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {heroCtaSelectValue === 'custom' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="hero-cta-link-input">Brugerdefineret Link</Label>
                                            <Input
                                                id="hero-cta-link-input"
                                                value={settings.heroCtaLink || ''}
                                                placeholder="f.eks. https://eksempel.dk"
                                                onChange={e => handleInputChange('heroCtaLink', e.target.value)}
                                            />
                                        </div>
                                    )}
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                        <div className="space-y-2">
                                            <Label>Knap Design</Label>
                                            <Select value={settings.heroCtaVariant} onValueChange={(v) => handleInputChange('heroCtaVariant', v)}>
                                                <SelectTrigger><SelectValue/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="default">Default</SelectItem>
                                                    <SelectItem value="pill">Pill</SelectItem>
                                                    <SelectItem value="secondary">Secondary</SelectItem>
                                                    <SelectItem value="outline">Outline</SelectItem>
                                                    <SelectItem value="destructive">Destructive</SelectItem>
                                                    <SelectItem value="ghost">Ghost</SelectItem>
                                                    <SelectItem value="link">Link</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                         <div className="space-y-2">
                                            <Label>Knap Størrelse</Label>
                                            <Select value={settings.heroCtaSize} onValueChange={(v) => handleInputChange('heroCtaSize', v)}>
                                                <SelectTrigger><SelectValue/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="default">Default</SelectItem>
                                                    <SelectItem value="sm">Small</SelectItem>
                                                    <SelectItem value="lg">Large</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <TextStyleEditor 
                                        label="Design for Knap Tekst"
                                        desktopSize={settings.heroCtaTextSize || 16}
                                        onDesktopSizeChange={(v) => handleInputChange('heroCtaTextSize', v)}
                                        mobileSize={settings.heroCtaTextSizeMobile || 14}
                                        onMobileSizeChange={(v) => handleInputChange('heroCtaTextSizeMobile', v)}
                                        previewMode={previewMode}
                                        isOptional={true}
                                    />
                                </div>
                            )}
                        </div>
                        
                         <div className="p-4 border rounded-lg space-y-4">
                            <h3 className="font-semibold">Billedgalleri</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(settings.heroImageGrid || Array(4).fill({ imageUrl: '', alt: '' })).map((image, index) => (
                                    <div key={index} className="space-y-2">
                                        <Label>Billede {index + 1}</Label>
                                        <Input
                                            placeholder="Billede URL"
                                            value={image.imageUrl}
                                            onChange={(e) => handleHeroGridChange(index, 'imageUrl', e.target.value)}
                                        />
                                        <Input
                                            placeholder="Alt tekst"
                                            value={image.alt}
                                            onChange={(e) => handleHeroGridChange(index, 'alt', e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    ),
    feature: (
        <Card className="shadow-lg">
            <AccordionItem value="feature">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>Fremhævet Sektion</CardTitle>
                        <CardDescription className="mt-1">En sektion med billede, tekst og knap.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="feature-visible" className="text-base">Aktivér sektion</Label>
                                <p className="text-sm text-muted-foreground">Hvis slået fra, vil denne sektion ikke blive vist på forsiden.</p>
                            </div>
                            <Switch
                                id="feature-visible"
                                checked={settings.sectionVisibility?.feature}
                                onCheckedChange={(value) => handleVisibilityChange('feature', value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="feature-heading">Overskrift</Label>
                            <Input id="feature-heading" value={settings.featureSectionHeading || ''} onChange={e => handleInputChange('featureSectionHeading', e.target.value)} />
                        </div>
                        <TextStyleEditor
                            label="Design for Overskrift"
                            colorValue={settings.featureSectionHeadingColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('featureSectionHeadingColor', v)}
                            desktopSize={settings.featureSectionHeadingSize || 48}
                            onDesktopSizeChange={(v) => handleInputChange('featureSectionHeadingSize', v)}
                            mobileSize={settings.featureSectionHeadingSizeMobile || 36}
                            onMobileSizeChange={(v) => handleInputChange('featureSectionHeadingSizeMobile', v)}
                            previewMode={previewMode}
                        />
                        <div className="space-y-2">
                            <Label htmlFor="feature-body">Brødtekst</Label>
                            <Textarea id="feature-body" value={settings.featureSectionBody || ''} onChange={e => handleInputChange('featureSectionBody', e.target.value)} rows={4} />
                        </div>
                        <TextStyleEditor
                            label="Design for Brødtekst"
                            colorValue={settings.featureSectionBodyColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('featureSectionBodyColor', v)}
                            desktopSize={settings.featureSectionBodySize || 18}
                            onDesktopSizeChange={(v) => handleInputChange('featureSectionBodySize', v)}
                            mobileSize={settings.featureSectionBodySizeMobile || 16}
                            onMobileSizeChange={(v) => handleInputChange('featureSectionBodySizeMobile', v)}
                            previewMode={previewMode}
                        />
                        <AlignmentControl 
                            value={settings.featureSectionAlignment || 'left'}
                            onValueChange={(v) => handleInputChange('featureSectionAlignment', v)}
                        />
                        <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
                            <h3 className="font-semibold">Call to Action Knap</h3>
                            <div className='space-y-4'>
                                <div className="space-y-2">
                                    <Label htmlFor="feature-cta-text">Knap Tekst</Label>
                                    <Input id="feature-cta-text" value={settings.featureSectionCtaText || ''} onChange={e => handleInputChange('featureSectionCtaText', e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="feature-cta-link-select">Knap Link</Label>
                                    <Select
                                        value={featureCtaSelectValue || ''}
                                        onValueChange={(value) => handleInputChange('featureSectionCtaLink', value === 'custom' ? '' : value)}
                                    >
                                        <SelectTrigger id="feature-cta-link-select"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {sectionLinks.map(link => (
                                                <SelectItem key={link.value} value={link.value}>{link.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {featureCtaSelectValue === 'custom' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="feature-cta-link-input">Brugerdefineret Link</Label>
                                        <Input
                                            id="feature-cta-link-input"
                                            value={settings.featureSectionCtaLink || ''}
                                            placeholder="f.eks. https://eksempel.dk"
                                            onChange={e => handleInputChange('featureSectionCtaLink', e.target.value)}
                                        />
                                    </div>
                                )}
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <div className="space-y-2">
                                        <Label>Knap Design</Label>
                                        <Select value={settings.featureSectionCtaVariant} onValueChange={(v) => handleInputChange('featureSectionCtaVariant', v)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="default">Default</SelectItem>
                                                <SelectItem value="pill">Pill</SelectItem>
                                                <SelectItem value="secondary">Secondary</SelectItem>
                                                <SelectItem value="outline">Outline</SelectItem>
                                                <SelectItem value="destructive">Destructive</SelectItem>
                                                <SelectItem value="ghost">Ghost</SelectItem>
                                                <SelectItem value="link">Link</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Knap Størrelse</Label>
                                        <Select value={settings.featureSectionCtaSize} onValueChange={(v) => handleInputChange('featureSectionCtaSize', v)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="default">Default</SelectItem>
                                                <SelectItem value="sm">Small</SelectItem>
                                                <SelectItem value="lg">Large</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <TextStyleEditor
                                    label="Design for Knap Tekst"
                                    desktopSize={settings.featureSectionCtaTextSize || 16}
                                    onDesktopSizeChange={(v) => handleInputChange('featureSectionCtaTextSize', v)}
                                    mobileSize={settings.featureSectionCtaTextSizeMobile || 14}
                                    onMobileSizeChange={(v) => handleInputChange('featureSectionCtaTextSizeMobile', v)}
                                    previewMode={previewMode}
                                    isOptional={true}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="feature-image-url">Billede URL</Label>
                            <Input id="feature-image-url" value={settings.featureSectionImageUrl || ''} onChange={e => handleInputChange('featureSectionImageUrl', e.target.value)} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="feature-ai-hint">AI Billede Hint</Label>
                            <Input id="feature-ai-hint" value={settings.featureSectionAiHint || ''} onChange={e => handleInputChange('featureSectionAiHint', e.target.value)} />
                        </div>
                        {settings.featureSectionBackgroundColor &&
                            <HslColorPicker
                                label="Baggrundsfarve"
                                color={settings.featureSectionBackgroundColor}
                                onChange={(hsl) => handleInputChange('featureSectionBackgroundColor', hsl)}
                            />
                        }
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    ),
    services: (
        <Card className="shadow-lg">
            <AccordionItem value="services">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>Services Sektion</CardTitle>
                        <CardDescription className="mt-1">Administrer de viste services.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="services-visible" className="text-base">Aktivér sektion</Label>
                                <p className="text-sm text-muted-foreground">Hvis slået fra, vil denne sektion ikke blive vist på forsiden.</p>
                            </div>
                            <Switch
                                id="services-visible"
                                checked={settings.sectionVisibility?.services}
                                onCheckedChange={(value) => handleVisibilityChange('services', value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="services-title">Sektionstitel</Label>
                            <Input id="services-title" value={settings.servicesSectionTitle || ''} onChange={e => handleInputChange('servicesSectionTitle', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                            label="Design for Sektionstitel"
                            colorValue={settings.servicesSectionTitleColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('servicesSectionTitleColor', v)}
                            desktopSize={settings.servicesSectionTitleSize || 36}
                            onDesktopSizeChange={(v) => handleInputChange('servicesSectionTitleSize', v)}
                            mobileSize={settings.servicesSectionTitleSize || 36}
                            onMobileSizeChange={(v) => handleInputChange('servicesSectionTitleSize', v)}
                            previewMode={previewMode}
                        />

                        <div className="space-y-2">
                            <Label htmlFor="services-description">Sektionsbeskrivelse</Label>
                            <Textarea id="services-description" value={settings.servicesSectionDescription || ''} onChange={e => handleInputChange('servicesSectionDescription', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                             label="Design for Sektionsbeskrivelse"
                             colorValue={settings.servicesSectionDescriptionColor as ThemeColor}
                             onColorChange={(v) => handleInputChange('servicesSectionDescriptionColor', v)}
                             desktopSize={settings.servicesSectionDescriptionSize || 18}
                             onDesktopSizeChange={(v) => handleInputChange('servicesSectionDescriptionSize', v)}
                             mobileSize={settings.servicesSectionDescriptionSize || 18}
                             onMobileSizeChange={(v) => handleInputChange('servicesSectionDescriptionSize', v)}
                             previewMode={previewMode}
                        />
                        <AlignmentControl 
                            value={settings.servicesSectionAlignment || 'center'}
                            onValueChange={(v) => handleInputChange('servicesSectionAlignment', v)}
                        />

                        <div className="space-y-4">
                            <h3 className="text-base font-semibold">Design for Service Kort</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TextStyleEditor 
                                    label="Kort Titel"
                                    colorValue={settings.serviceCardTitleColor as ThemeColor}
                                    onColorChange={(v) => handleInputChange('serviceCardTitleColor', v)}
                                    desktopSize={settings.serviceCardTitleSize || 24}
                                    onDesktopSizeChange={(v) => handleInputChange('serviceCardTitleSize', v)}
                                    mobileSize={settings.serviceCardTitleSize || 24}
                                    onMobileSizeChange={(v) => handleInputChange('serviceCardTitleSize', v)}
                                    previewMode={previewMode}
                                />
                                <TextStyleEditor 
                                    label="Kort Beskrivelse"
                                    colorValue={settings.serviceCardDescriptionColor as ThemeColor}
                                    onColorChange={(v) => handleInputChange('serviceCardDescriptionColor', v)}
                                    desktopSize={settings.serviceCardDescriptionSize || 14}
                                    onDesktopSizeChange={(v) => handleInputChange('serviceCardDescriptionSize', v)}
                                    mobileSize={settings.serviceCardDescriptionSize || 14}
                                    onMobileSizeChange={(v) => handleInputChange('serviceCardDescriptionSize', v)}
                                    previewMode={previewMode}
                                />
                            </div>
                        </div>

                        <Label>Service-kort</Label>
                        <Accordion type="multiple" className="w-full border rounded-md">
                            {(settings.services || []).map((service, index) => (
                                <EditableListItem 
                                    key={index}
                                    index={index}
                                    item={service}
                                    updateItem={(i, data) => handleListUpdate('services', i, data)}
                                    removeItem={(i) => handleListRemove('services', i)}
                                    fields={[
                                        {key: 'title', label: 'Titel'},
                                        {key: 'description', label: 'Beskrivelse', type: 'textarea'},
                                        {key: 'imageUrl', label: 'Billede URL'},
                                        {key: 'aiHint', label: 'AI Billede Hint'},
                                    ]}
                                    titleField="title"
                                />
                            ))}
                        </Accordion>
                        <Button variant="outline" onClick={() => handleListAdd('services', { title: 'Ny Service', description: '', imageUrl: '', aiHint: '' })}>Tilføj Service</Button>

                        <div className="p-4 border rounded-lg space-y-4 bg-muted/20">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">Call to Action Knap</h3>
                                <Switch
                                    checked={settings.servicesCtaEnabled}
                                    onCheckedChange={(value) => handleInputChange('servicesCtaEnabled', value)}
                                />
                            </div>
                            {settings.servicesCtaEnabled && (
                                <div className='space-y-4'>
                                    <div className="space-y-2">
                                        <Label htmlFor="services-cta-text">Knap Tekst</Label>
                                        <Input id="services-cta-text" value={settings.servicesCtaText || ''} onChange={e => handleInputChange('servicesCtaText', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="services-cta-link-select">Knap Link</Label>
                                        <Select
                                            value={servicesCtaSelectValue || ''}
                                            onValueChange={(value) => handleInputChange('servicesCtaLink', value === 'custom' ? '' : value)}
                                        >
                                            <SelectTrigger id="services-cta-link-select"><SelectValue/></SelectTrigger>
                                            <SelectContent>
                                                {sectionLinks.map(link => (
                                                    <SelectItem key={link.value} value={link.value}>{link.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {servicesCtaSelectValue === 'custom' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="services-cta-link-input">Brugerdefineret Link</Label>
                                            <Input
                                                id="services-cta-link-input"
                                                value={settings.servicesCtaLink || ''}
                                                placeholder="f.eks. https://eksempel.dk"
                                                onChange={e => handleInputChange('servicesCtaLink', e.target.value)}
                                            />
                                        </div>
                                    )}
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                        <div className="space-y-2">
                                            <Label>Knap Design</Label>
                                            <Select value={settings.servicesCtaVariant} onValueChange={(v) => handleInputChange('servicesCtaVariant', v)}>
                                                <SelectTrigger><SelectValue/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="default">Default</SelectItem>
                                                    <SelectItem value="pill">Pill</SelectItem>
                                                    <SelectItem value="secondary">Secondary</SelectItem>
                                                    <SelectItem value="outline">Outline</SelectItem>
                                                    <SelectItem value="destructive">Destructive</SelectItem>
                                                    <SelectItem value="ghost">Ghost</SelectItem>
                                                    <SelectItem value="link">Link</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                         <div className="space-y-2">
                                            <Label>Knap Størrelse</Label>
                                            <Select value={settings.servicesCtaSize} onValueChange={(v) => handleInputChange('servicesCtaSize', v)}>
                                                <SelectTrigger><SelectValue/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="default">Default</SelectItem>
                                                    <SelectItem value="sm">Small</SelectItem>
                                                    <SelectItem value="lg">Large</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <TextStyleEditor 
                                        label="Design for Knap Tekst"
                                        desktopSize={settings.servicesCtaTextSize || 16}
                                        onDesktopSizeChange={(v) => handleInputChange('servicesCtaTextSize', v)}
                                        mobileSize={settings.servicesCtaTextSizeMobile || 14}
                                        onMobileSizeChange={(v) => handleInputChange('servicesCtaTextSizeMobile', v)}
                                        previewMode={previewMode}
                                        isOptional={true}
                                    />
                                </div>
                            )}
                        </div>
                        
                        {settings.servicesSectionBackgroundColor &&
                          <HslColorPicker 
                              label="Baggrundsfarve"
                              color={settings.servicesSectionBackgroundColor}
                              onChange={(hsl) => handleInputChange('servicesSectionBackgroundColor', hsl)}
                          />
                        }

                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    ),
    aiProject: (
        <Card className="shadow-lg">
            <AccordionItem value="ai-project">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>AI Projekt Sektion</CardTitle>
                        <CardDescription className="mt-1">Administrer indhold og design for AI-chat sektionen.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-6 pt-6">
                         <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="ai-project-visible" className="text-base">Aktivér sektion</Label>
                                <p className="text-sm text-muted-foreground">Hvis slået fra, vil denne sektion ikke blive vist på forsiden.</p>
                            </div>
                            <Switch
                                id="ai-project-visible"
                                checked={settings.sectionVisibility?.aiProject}
                                onCheckedChange={(value) => handleVisibilityChange('aiProject', value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ai-project-icon-text">Ikon-tekst</Label>
                            <Input id="ai-project-icon-text" value={settings.aiProjectSectionIconText || ''} onChange={e => handleInputChange('aiProjectSectionIconText', e.target.value)} className="w-full" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ai-project-title">Titel</Label>
                            <Input id="ai-project-title" value={settings.aiProjectSectionTitle || ''} onChange={e => handleInputChange('aiProjectSectionTitle', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                            label="Design for Titel"
                            colorValue={settings.aiProjectSectionTitleColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('aiProjectSectionTitleColor', v)}
                            desktopSize={settings.aiProjectSectionTitleSize || 36}
                            onDesktopSizeChange={(v) => handleInputChange('aiProjectSectionTitleSize', v)}
                            mobileSize={settings.aiProjectSectionTitleSize || 36}
                            onMobileSizeChange={(v) => handleInputChange('aiProjectSectionTitleSize', v)}
                            previewMode={previewMode}
                        />

                        <div className="space-y-2">
                            <Label htmlFor="ai-project-description">Beskrivelse</Label>
                            <Textarea id="ai-project-description" value={settings.aiProjectSectionDescription || ''} onChange={e => handleInputChange('aiProjectSectionDescription', e.target.value)} rows={4} className="w-full" />
                        </div>
                        <TextStyleEditor 
                            label="Design for Beskrivelse"
                            colorValue={settings.aiProjectSectionDescriptionColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('aiProjectSectionDescriptionColor', v)}
                            desktopSize={settings.aiProjectSectionDescriptionSize || 18}
                            onDesktopSizeChange={(v) => handleInputChange('aiProjectSectionDescriptionSize', v)}
                            mobileSize={settings.aiProjectSectionDescriptionSize || 18}
                            onMobileSizeChange={(v) => handleInputChange('aiProjectSectionDescriptionSize', v)}
                            previewMode={previewMode}
                        />
                         <AlignmentControl 
                            value={settings.aiProjectSectionAlignment || 'left'}
                            onValueChange={(v) => handleInputChange('aiProjectSectionAlignment', v)}
                        />

                        {settings.aiProjectSectionBackgroundColor &&
                          <HslColorPicker 
                              label="Baggrundsfarve (Mørk)"
                              color={settings.aiProjectSectionBackgroundColor}
                              onChange={(hsl) => handleInputChange('aiProjectSectionBackgroundColor', hsl)}
                          />
                        }
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    ),
    cases: (
        <Card className="shadow-lg">
            <AccordionItem value="cases">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>Cases Sektion</CardTitle>
                        <CardDescription className="mt-1">Administrer de viste cases.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-6 pt-6">
                         <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="cases-visible" className="text-base">Aktivér sektion</Label>
                                <p className="text-sm text-muted-foreground">Hvis slået fra, vil denne sektion ikke blive vist på forsiden.</p>
                            </div>
                            <Switch
                                id="cases-visible"
                                checked={settings.sectionVisibility?.cases}
                                onCheckedChange={(value) => handleVisibilityChange('cases', value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cases-title">Sektionstitel</Label>
                            <Input id="cases-title" value={settings.casesSectionTitle || ''} onChange={e => handleInputChange('casesSectionTitle', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                            label="Design for Sektionstitel"
                            colorValue={settings.casesSectionTitleColor as ThemeColor}
                            onColorChange={(v) => handleInputChange('casesSectionTitleColor', v)}
                            desktopSize={settings.casesSectionTitleSize || 36}
                            onDesktopSizeChange={(v) => handleInputChange('casesSectionTitleSize', v)}
                            mobileSize={settings.casesSectionTitleSize || 36}
                            onMobileSizeChange={(v) => handleInputChange('casesSectionTitleSize', v)}
                            previewMode={previewMode}
                        />

                        <div className="space-y-2">
                            <Label htmlFor="cases-description">Sektionsbeskrivelse</Label>
                            <Textarea id="cases-description" value={settings.casesSectionDescription || ''} onChange={e => handleInputChange('casesSectionDescription', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                             label="Design for Sektionsbeskrivelse"
                             colorValue={settings.casesSectionDescriptionColor as ThemeColor}
                             onColorChange={(v) => handleInputChange('casesSectionDescriptionColor', v)}
                             desktopSize={settings.casesSectionDescriptionSize || 18}
                             onDesktopSizeChange={(v) => handleInputChange('casesSectionDescriptionSize', v)}
                             mobileSize={settings.casesSectionDescriptionSize || 18}
                             onMobileSizeChange={(v) => handleInputChange('casesSectionDescriptionSize', v)}
                             previewMode={previewMode}
                         />
                         <AlignmentControl 
                            value={settings.casesSectionAlignment || 'center'}
                            onValueChange={(v) => handleInputChange('casesSectionAlignment', v)}
                        />

                        <Label>Case-kort</Label>
                        <Accordion type="multiple" className="w-full border rounded-md">
                            {(settings.cases || []).map((caseItem, index) => (
                                <EditableListItem 
                                    key={index}
                                    index={index}
                                    item={caseItem}
                                    updateItem={(i, data) => handleListUpdate('cases', i, data)}
                                    removeItem={(i) => handleListRemove('cases', i)}
                                    fields={[
                                        {key: 'title', label: 'Titel'},
                                        {key: 'description', label: 'Beskrivelse', type: 'textarea'},
                                        {key: 'imageUrl', label: 'Billede URL'},
                                        {key: 'link', label: 'Link URL'},
                                        {key: 'aiHint', label: 'AI Billede Hint'},
                                    ]}
                                    titleField="title"
                                />
                            ))}
                        </Accordion>
                        <Button variant="outline" onClick={() => handleListAdd('cases', { title: 'Ny Case', description: '', imageUrl: '', link: '#', aiHint: '' })}>Tilføj Case</Button>
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    ),
    about: (
        <Card className="shadow-lg">
            <AccordionItem value="about">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>Om Os Sektion</CardTitle>
                        <CardDescription className="mt-1">Administrer tekst og teammedlemmer.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="about-visible" className="text-base">Aktivér sektion</Label>
                                <p className="text-sm text-muted-foreground">Hvis slået fra, vil denne sektion ikke blive vist på forsiden.</p>
                            </div>
                            <Switch
                                id="about-visible"
                                checked={settings.sectionVisibility?.about}
                                onCheckedChange={(value) => handleVisibilityChange('about', value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="about-title">Sektionstitel</Label>
                            <Input id="about-title" value={settings.aboutSectionTitle || ''} onChange={e => handleInputChange('aboutSectionTitle', e.target.value)} className="w-full" />
                        </div>
                        <TextStyleEditor 
                           label="Design for Sektionstitel"
                           colorValue={settings.aboutSectionTitleColor as ThemeColor}
                           onColorChange={(v) => handleInputChange('aboutSectionTitleColor', v)}
                           desktopSize={settings.aboutSectionTitleSize || 36}
                           onDesktopSizeChange={(v) => handleInputChange('aboutSectionTitleSize', v)}
                           mobileSize={settings.aboutSectionTitleSize || 36}
                           onMobileSizeChange={(v) => handleInputChange('aboutSectionTitleSize', v)}
                           previewMode={previewMode}
                        />
                         <AlignmentControl 
                            value={settings.aboutSectionAlignment || 'left'}
                            onValueChange={(v) => handleInputChange('aboutSectionAlignment', v)}
                        />

                        <div className="space-y-2">
                            <Label htmlFor="about-text">Intro tekst</Label>
                            <Textarea id="about-text" value={settings.aboutText || ''} onChange={e => handleInputChange('aboutText', e.target.value)} rows={5} className="w-full" />
                        </div>
                        <TextStyleEditor 
                           label="Design for Intro Tekst"
                           colorValue={settings.aboutTextColor as ThemeColor}
                           onColorChange={(v) => handleInputChange('aboutTextColor', v)}
                           desktopSize={settings.aboutTextSize || 18}
                           onDesktopSizeChange={(v) => handleInputChange('aboutTextSize', v)}
                           mobileSize={settings.aboutTextSize || 18}
                           onMobileSizeChange={(v) => handleInputChange('aboutTextSize', v)}
                           previewMode={previewMode}
                        />

                        <div className="space-y-2">
                             <Label>Team</Label>
                             <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
                                <h3 className="font-semibold">Design for teammedlemmer</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <TextStyleEditor 
                                        label="Navn"
                                        colorValue={settings.teamMemberNameColor as ThemeColor}
                                        onColorChange={(v) => handleInputChange('teamMemberNameColor', v)}
                                        desktopSize={settings.teamMemberNameSize || 18}
                                        onDesktopSizeChange={(v) => handleInputChange('teamMemberNameSize', v)}
                                        mobileSize={settings.teamMemberNameSize || 18}
                                        onMobileSizeChange={(v) => handleInputChange('teamMemberNameSize', v)}
                                        previewMode={previewMode}
                                    />
                                      <TextStyleEditor 
                                        label="Titel"
                                        colorValue={settings.teamMemberTitleColor as ThemeColor}
                                        onColorChange={(v) => handleInputChange('teamMemberTitleColor', v)}
                                        desktopSize={settings.teamMemberTitleSize || 14}
                                        onDesktopSizeChange={(v) => handleInputChange('teamMemberTitleSize', v)}
                                        mobileSize={settings.teamMemberTitleSize || 14}
                                        onMobileSizeChange={(v) => handleInputChange('teamMemberTitleSize', v)}
                                        previewMode={previewMode}
                                    />
                                </div>
                                <TextStyleEditor 
                                    label="Beskrivelse"
                                    colorValue={settings.teamMemberDescriptionColor as ThemeColor}
                                    onColorChange={(v) => handleInputChange('teamMemberDescriptionColor', v)}
                                    desktopSize={settings.teamMemberDescriptionSize || 14}
                                    onDesktopSizeChange={(v) => handleInputChange('teamMemberDescriptionSize', v)}
                                    mobileSize={settings.teamMemberDescriptionSize || 14}
                                    onMobileSizeChange={(v) => handleInputChange('teamMemberDescriptionSize', v)}
                                    previewMode={previewMode}
                                />
                             </div>
                        </div>

                        <Accordion type="multiple" className="w-full border rounded-md">
                            {(settings.teamMembers || []).map((member, index) => (
                                <EditableListItem 
                                    key={index}
                                    index={index}
                                    item={member}
                                    updateItem={(i, data) => handleListUpdate('teamMembers', i, data)}
                                    removeItem={(i) => handleListRemove('teamMembers', i)}
                                    fields={[
                                        {key: 'name', label: 'Navn'},
                                        {key: 'title', label: 'Titel'},
                                        {key: 'description', label: 'Beskrivelse', type: 'textarea'},
                                        {key: 'imageUrl', label: 'Billede URL'},
                                        {key: 'linkedinUrl', label: 'LinkedIn URL'},
                                        {key: 'aiHint', label: 'AI Billede Hint'},
                                    ]}
                                    titleField="name"
                                />
                            ))}
                        </Accordion>
                        <Button variant="outline" onClick={() => handleListAdd('teamMembers', { name: 'Nyt Medlem', title: '', description: '', imageUrl: '', linkedinUrl: '#', aiHint: '' })}>Tilføj Medlem</Button>
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    ),
    customers: (
        <Card className="shadow-lg">
            <AccordionItem value="customers">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>Kunde Sektion</CardTitle>
                        <CardDescription className="mt-1">Administrer indholdet i sektionen med kundelogoer.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="customers-visible" className="text-base">Aktivér sektion</Label>
                                <p className="text-sm text-muted-foreground">Hvis slået fra, vil denne sektion ikke blive vist på forsiden.</p>
                            </div>
                            <Switch
                                id="customers-visible"
                                checked={settings.sectionVisibility?.customers}
                                onCheckedChange={(value) => handleVisibilityChange('customers', value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="customers-title">Sektionstitel</Label>
                            <Input id="customers-title" value={settings.customersSectionTitle || ''} onChange={e => handleInputChange('customersSectionTitle', e.target.value)} className="w-full" />
                        </div>
                         <TextStyleEditor 
                             label="Design for Sektionstitel"
                             colorValue={settings.customersSectionTitleColor as ThemeColor}
                             onColorChange={(v) => handleInputChange('customersSectionTitleColor', v)}
                             desktopSize={settings.customersSectionTitleSize || 16}
                             onDesktopSizeChange={(v) => handleInputChange('customersSectionTitleSize', v)}
                             mobileSize={settings.customersSectionTitleSize || 16}
                             onMobileSizeChange={(v) => handleInputChange('customersSectionTitleSize', v)}
                             previewMode={previewMode}
                         />

                        <div className="space-y-2">
                            <Label htmlFor="customers-description">Sektionsbeskrivelse</Label>
                            <Textarea id="customers-description" value={settings.customersSectionDescription || ''} onChange={e => handleInputChange('customersSectionDescription', e.target.value)} className="w-full" />
                        </div>
                         <TextStyleEditor 
                             label="Design for Sektionsbeskrivelse"
                             colorValue={settings.customersSectionDescriptionColor as ThemeColor}
                             onColorChange={(v) => handleInputChange('customersSectionDescriptionColor', v)}
                             desktopSize={settings.customersSectionDescriptionSize || 18}
                             onDesktopSizeChange={(v) => handleInputChange('customersSectionDescriptionSize', v)}
                             mobileSize={settings.customersSectionDescriptionSize || 18}
                             onMobileSizeChange={(v) => handleInputChange('customersSectionDescriptionSize', v)}
                             previewMode={previewMode}
                         />
                         <AlignmentControl 
                            value={settings.customersSectionAlignment || 'center'}
                            onValueChange={(v) => handleInputChange('customersSectionAlignment', v)}
                        />

                        {settings.customersSectionBackgroundColor &&
                          <HslColorPicker 
                              label="Baggrundsfarve"
                              color={settings.customersSectionBackgroundColor}
                              onChange={(hsl) => handleInputChange('customersSectionBackgroundColor', hsl)}
                          />
                        }
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    ),
    spacing: (
        <Card className="shadow-lg">
            <AccordionItem value="spacing">
                <AccordionTrigger className="px-6 py-4">
                    <div className="text-left">
                        <CardTitle>Sektionsafstand</CardTitle>
                        <CardDescription className="mt-1">Juster den vertikale afstand (padding) for hver sektion.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t">
                    <CardContent className="space-y-4 pt-6">
                        <SpacingEditor
                            label="Fremhævet Sektion"
                            padding={settings.sectionPadding?.feature || defaultPadding}
                            onPaddingChange={(v, p) => handlePaddingChange('feature', v, p)}
                            previewMode={previewMode}
                        />
                        <SpacingEditor
                            label="Services"
                            padding={settings.sectionPadding?.services || defaultPadding}
                            onPaddingChange={(v, p) => handlePaddingChange('services', v, p)}
                            previewMode={previewMode}
                        />
                        <SpacingEditor
                            label="Fortæl os om dit projekt"
                            padding={settings.sectionPadding?.aiProject || defaultPadding}
                            onPaddingChange={(v, p) => handlePaddingChange('aiProject', v, p)}
                            previewMode={previewMode}
                        />
                        <SpacingEditor
                            label="Cases"
                            padding={settings.sectionPadding?.cases || defaultPadding}
                            onPaddingChange={(v, p) => handlePaddingChange('cases', v, p)}
                            previewMode={previewMode}
                        />
                        <SpacingEditor
                            label="Om Os"
                            padding={settings.sectionPadding?.about || defaultPadding}
                            onPaddingChange={(v, p) => handlePaddingChange('about', v, p)}
                            previewMode={previewMode}
                        />
                        <SpacingEditor
                            label="Kunder"
                            padding={settings.sectionPadding?.customers || defaultPadding}
                            onPaddingChange={(v, p) => handlePaddingChange('customers', v, p)}
                            previewMode={previewMode}
                        />
                        <SpacingEditor
                            label="Kontakt"
                            padding={settings.sectionPadding?.contact || defaultPadding}
                            onPaddingChange={(v, p) => handlePaddingChange('contact', v, p)}
                            previewMode={previewMode}
                        />
                    </CardContent>
                </AccordionContent>
            </AccordionItem>
        </Card>
    )
  };


  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Forside Indhold</h1>
          <p className="text-muted-foreground">Administrer indholdet på din forside. Træk i sektionerne for at ændre rækkefølgen.</p>
        </div>
        <div className="flex items-center gap-4">
            <ToggleGroup 
                type="single" 
                value={previewMode}
                onValueChange={(value: 'desktop' | 'mobile') => value && setPreviewMode(value)}
                aria-label="Vælg visning"
                variant="outline"
            >
                <ToggleGroupItem value="desktop" aria-label="Desktop visning">
                    <Monitor className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="mobile" aria-label="Mobil visning">
                    <Smartphone className="h-4 w-4" />
                </ToggleGroupItem>
            </ToggleGroup>

            <Button size="lg" onClick={handleSaveChanges} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gem Ændringer
            </Button>
        </div>
      </div>
        <Accordion 
            type="multiple" 
            className="w-full space-y-4" 
            value={activeAccordionItem} 
            onValueChange={(value: string[]) => setActiveAccordionItem(value)}
        >
            {sectionComponents['hero']}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
            >
                <SortableContext
                    items={settings.homePageSectionOrder || []}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-4">
                        {(settings.homePageSectionOrder || []).map(id => (
                            <SortableSection key={id} id={id}>
                                {sectionComponents[id]}
                            </SortableSection>
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
             {sectionComponents['spacing']}
        </Accordion>
    </div>
  );
}
