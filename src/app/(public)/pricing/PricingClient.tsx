
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import type { Brand } from '@/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';

const pricingTiers = [
  {
    name: "Starter",
    priceMonthly: "299",
    priceYearly: "2990",
    description: "Perfekt for nye restauranter eller dem, der vil digitalisere deres menu.",
    features: [
      "Online Menu & Ordresystem",
      "Basis Analyse",
      "Email Support",
      "1 Lokation",
    ],
    cta: "Vælg Starter",
    isPopular: false,
  },
  {
    name: "Pro",
    priceMonthly: "599",
    priceYearly: "5990",
    description: "For voksende forretninger, der vil optimere og øge salget.",
    features: [
      "Alt fra Starter",
      "Avanceret Analyse & Funnel",
      "AI Upsell Engine",
      "Rabat & Combo Modul",
      "Op til 5 Lokationer",
    ],
    cta: "Vælg Pro",
    isPopular: true,
  },
  {
    name: "Enterprise",
    priceMonthly: "Kontakt os",
    priceYearly: "",
    description: "Skræddersyet til kæder og store forretninger med unikke behov.",
    features: [
        "Alt fra Pro",
        "Ubegrænset Antal Lokationer",
        "Dedikeret Support & SLA",
        "Custom Integrationer",
        "Whitelabel Muligheder",
    ],
    cta: "Kontakt Salg",
    isPopular: false,
  },
];

const featureComparison = [
  { feature: "Online Menu & Ordre", starter: true, pro: true, enterprise: true },
  { feature: "Basis Analyse", starter: true, pro: true, enterprise: true },
  { feature: "Antal Lokationer", starter: "1", pro: "5", enterprise: "Ubegrænset" },
  { feature: "AI Upsell Engine", starter: false, pro: true, enterprise: true, tooltip: "Vores AI analyserer kundens kurv og foreslår relevante tilkøb for at øge ordreværdien." },
  { feature: "Rabat & Combo Modul", starter: false, pro: true, enterprise: true },
  { feature: "Avanceret Analyse", starter: false, pro: true, enterprise: true },
  { feature: "Dedikeret Support & SLA", starter: false, pro: false, enterprise: true },
  { feature: "Custom Integrationer", starter: false, pro: false, enterprise: true },
  { feature: "Whitelabel Løsning", starter: false, pro: false, enterprise: true },
];

const faqs = [
    {
        question: "Kan jeg skifte plan senere?",
        answer: "Ja, du kan altid opgradere eller nedgradere din plan direkte fra dit admin-panel. Ændringer træder i kraft ved starten af din næste betalingsperiode."
    },
    {
        question: "Hvad tæller som en 'lokation'?",
        answer: "En lokation er en enkelt fysisk restaurant eller forretningssted. Hvis du har en kæde med flere adresser, skal hver adresse have sin egen lokation i systemet."
    },
    {
        question: "Tilbyder I en gratis prøveperiode?",
        answer: "Vi tilbyder en 14-dages fuldt funktionel prøveperiode på vores Pro-plan, så du kan opleve alle fordelene, før du beslutter dig. Kontakt os for at komme i gang."
    },
    {
        question: "Hvordan fungerer AI Upsell Engine?",
        answer: "Vores AI analyserer indholdet af kundens indkøbskurv og foreslår intelligent relevante tilkøb. Hvis en kunde f.eks. lægger en burger i kurven, kan systemet foreslå pomfritter og en sodavand med en lille rabat for at øge den samlede ordreværdi."
    }
]

function PricingClientInner() {
  const [isYearly, setIsYearly] = useState(false);

  return (
      <main className="py-16 bg-muted/40">
        <div className="container mx-auto max-w-7xl px-4 md:px-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold tracking-tight">Fleksible Priser for Alle Størrelser</h1>
                <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
                    Vælg den plan, der passer bedst til din forretning. Vokser du, vokser vi med dig.
                </p>
                 <div className="flex items-center justify-center gap-4 mt-8">
                    <span className={cn("font-medium", !isYearly && "text-primary")}>Månedligt</span>
                    <Switch checked={isYearly} onCheckedChange={setIsYearly} aria-label="Skift mellem månedlig og årlig betaling"/>
                    <span className={cn("font-medium", isYearly && "text-primary")}>Årligt</span>
                     <Badge variant="destructive" className="animate-pulse">Spar 16%</Badge>
                </div>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
                {pricingTiers.map(tier => (
                    <Card key={tier.name} className={cn("flex flex-col h-full", tier.isPopular && "border-primary border-2 shadow-lg")}>
                        {tier.isPopular && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Mest Populære</Badge>}
                        <CardHeader>
                            <CardTitle className="text-2xl">{tier.name}</CardTitle>
                            <CardDescription>{tier.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow">
                             <div className="mb-6">
                                <span className="text-4xl font-bold">
                                    {isYearly && tier.priceYearly ? `kr. ${tier.priceYearly}` : `kr. ${tier.priceMonthly}`}
                                </span>
                                <span className="text-muted-foreground">
                                    {tier.name !== "Enterprise" ? (isYearly ? " /år" : " /md") : ""}
                                </span>
                             </div>
                             <ul className="space-y-3">
                                {tier.features.map(feature => (
                                     <li key={feature} className="flex items-start">
                                        <Check className="h-5 w-5 text-green-500 mr-2 mt-0.5 shrink-0" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                             </ul>
                        </CardContent>
                        <CardFooter>
                            <Button asChild size="lg" className="w-full" variant={tier.isPopular ? "default" : "outline"}>
                                <Link href="/contact?subject=Prisforespørgsel">{tier.cta}</Link>
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <div className="mt-24">
                <h2 className="text-3xl font-bold text-center mb-8">Sammenlign Planer</h2>
                <Card>
                    <CardContent className="p-0">
                       <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-1/3">Funktion</TableHead>
                                {pricingTiers.map(tier => <TableHead key={tier.name} className="text-center">{tier.name}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {featureComparison.map(feature => (
                                <TableRow key={feature.feature}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-1">
                                            <span>{feature.feature}</span>
                                            {feature.tooltip && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                                        <TooltipContent><p>{feature.tooltip}</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {typeof feature.starter === 'boolean' ? (feature.starter ? <Check className="h-5 w-5 text-green-500 mx-auto" /> : "–") : feature.starter}
                                    </TableCell>
                                     <TableCell className="text-center">
                                        {typeof feature.pro === 'boolean' ? (feature.pro ? <Check className="h-5 w-5 text-green-500 mx-auto" /> : "–") : feature.pro}
                                    </TableCell>
                                     <TableCell className="text-center">
                                        {typeof feature.enterprise === 'boolean' ? (feature.enterprise ? <Check className="h-5 w-5 text-green-500 mx-auto" /> : "–") : feature.enterprise}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                       </Table>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-24 max-w-4xl mx-auto">
                <h2 className="text-3xl font-bold text-center mb-8">Ofte Stillede Spørgsmål</h2>
                 <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq, i) => (
                         <AccordionItem key={i} value={`item-${i}`}>
                            <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                            <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                        </AccordionItem>
                    ))}
                 </Accordion>
            </div>

        </div>
      </main>
  );
}

export default function PricingClient() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PricingClientInner />
        </Suspense>
    )
}
