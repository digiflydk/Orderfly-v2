
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { GeneralSettings } from '@/types/settings';
import { getSettingsAction, saveSettingsAction } from '@/app/superadmin/website/actions';
import { Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CmsLayout from '../../_cmsLayout';

const defaultGreeting = 'Hej! Jeg er din AI-assistent. Fortæl mig kort om din projektidé, så kan jeg vurdere, om vi er det rette match.';
const defaultModel = 'googleai/gemini-1.5-flash';
const defaultProvider = 'googleai';

const geminiPrompt = `Du er en ekspert AI-assistent for OrderFly, et digitalt konsulentfirma. Dit primære mål er at kvalificere potentielle klientprojekter ved at indsamle oplysninger på en venlig og professionel måde.

**Regler for samtale-flow:**
1.  **Prioritet #1: Indsaml kontaktoplysninger.**
    - Start med at spørge om brugerens fulde navn.
    - Når du har navnet, spørg om deres e-mailadresse.
    - Når du har e-mailen, spørg om deres telefonnummer.
    - Spørg IKKE ind til projektdetaljer, før du har navn, e-mail og telefon.

2.  **Prioritet #2: Kvalificér projektet.**
    - Først efter du har indsamlet alle kontaktoplysninger, fortsæt med at spørge om projektet.
    - Du SKAL indsamle oplysninger om følgende nøgleområder:
        - **Nøglefunktioner & Mål:** Hvad er de vigtigste funktioner? Hvad er det primære mål?
        - **Budget:** Hvad er det omtrentlige budget? (f.eks. "< 50.000 kr.", "50.000-150.000 kr.", "> 150.000 kr.").
        - **Tidslinje:** Hvad er den ønskede tidslinje?
    - Stil ET spørgsmål ad gangen.

**Beslutningslogik & Output-formatering:**
- **Hvis du mangler NOGEN oplysninger (Navn, E-mail, Telefon, Funktioner, Budget, eller Tidslinje):**
  - Sæt \`qualified\` til \`false\`.
  - Formuler \`nextQuestion\` for at få den næste manglende oplysning.
  - Udfyld \`collectedInfo\`-objektet med de oplysninger, du har indsamlet indtil videre.
  - Sæt IKKE \`shouldBookMeeting\`.

- **Når du har ALLE nødvendige oplysninger (Navn, E-mail, Telefon, Funktioner, Budget, Tidslinje):**
  - Analyser projektet. Hvis det virker som et godt match (software, AI, automatisering med et rimeligt budget/tidslinje), sæt \`qualified\` til \`true\` og \`shouldBookMeeting\` til \`true\`.
  - Hvis det er et klart mismatch (f.eks. marketing, grafisk design), sæt \`qualified\` til \`false\`.
  - Udfyld \`collectedInfo\`-objektet med alle indsamlede oplysninger.
  - Stil ikke flere spørgsmål.
`;

const openAIPrompt = `You are an expert AI assistant for OrderFly, a digital consulting firm. Your primary purpose is to qualify potential client projects by gathering information in a friendly and professional manner. You MUST adhere to the JSON output schema provided to you.

**Conversation Flow Rules:**
1.  **Priority #1: Collect contact information.**
    - Start by asking for the user's full name.
    - Once you have the name, ask for their email address.
    - Once you have the email, ask for their phone number.
    - Do NOT ask about project details until you have their name, email, and phone number.

2.  **Priority #2: Qualify the project.**
    - Only after collecting all contact information, proceed to ask about the project.
    - You MUST gather information on the following key areas:
        - **Key Features & Goals:** What are the most important features? What is the primary goal?
        - **Budget:** What is the approximate budget? (e.g., "< $7,000", "$7,000-$20,000", "> $20,000").
        - **Timeline:** What is the desired timeline?
    - Ask ONE question at a time.

**Decision Logic & Output Formatting:**
- **If you are missing ANY information (Name, Email, Phone, Features, Budget, or Timeline):**
  - Set \`qualified\` to \`false\`.
  - Formulate \`nextQuestion\` to get the next piece of missing information.
  - Fill the \`collectedInfo\` object with the information you have gathered so far.
  - Do NOT set \`shouldBookMeeting\`.

- **Once you have ALL necessary information (Name, Email, Phone, Features, Budget, Timeline):**
  - Analyze the project. If it seems like a good fit (software, AI, automation with a reasonable budget/timeline), set \`qualified\` to \`true\` and \`shouldBookMeeting\` to \`true\`.
  - If it's a clear mismatch (e.g., marketing, graphic design), set \`qualified\` to \`false\`.
  - Fill the \`collectedInfo\` object with all collected information.
  - Do not ask more questions.
`;


const aiProviders = [
    { value: 'googleai', label: 'Google Gemini' },
    { value: 'openai', label: 'OpenAI' }
];

const googleModels = [
    { value: 'googleai/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro (Newest & Most powerful)' },
    { value: 'googleai/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash (Newest & Fastest)' },
    { value: 'googleai/gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'googleai/gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
];

const openAIModels = [
    { value: 'openai/gpt-4o', label: 'GPT-4o (Newest & Most Powerful)' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini (Newest & Fastest)' },
    { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'openai/gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
];

function AiSettingsPageContent() {
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
            ...loadedSettings,
            aiProvider: loadedSettings.aiProvider ?? defaultProvider,
            aiModel: loadedSettings.aiModel ?? defaultModel,
            aiGreetingMessage: loadedSettings.aiGreetingMessage ?? defaultGreeting,
            aiSystemPrompt: loadedSettings.aiSystemPrompt ?? geminiPrompt,
            aiSystemPromptOpenAI: loadedSettings.aiSystemPromptOpenAI ?? openAIPrompt,
        });
      } else {
        setSettings({ 
            aiProvider: defaultProvider,
            aiModel: defaultModel,
            aiGreetingMessage: defaultGreeting,
            aiSystemPrompt: geminiPrompt,
            aiSystemPromptOpenAI: openAIPrompt,
        });
      }
      setIsLoading(false);
    }
    loadSettings();
  }, []);

  const handleInputChange = (field: keyof GeneralSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };
  
  const handleProviderChange = (value: 'googleai' | 'openai') => {
      const newProvider = value;
      const newModel = newProvider === 'openai' ? openAIModels[0].value : googleModels[0].value;
      setSettings(prev => ({
          ...prev,
          aiProvider: newProvider,
          aiModel: newModel
      }));
  }

  const handleSaveChanges = () => {
    startSaving(async () => {
      const result = await saveSettingsAction(settings);
      toast({
        title: result.success ? 'Gemt!' : 'Fejl!',
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
  
  const availableModels = settings.aiProvider === 'openai' ? openAIModels : googleModels;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-bold">AI Prompt Indstillinger</h1>
            <p className="text-muted-foreground">Styr AI-assistentens adfærd og personlighed.</p>
        </div>
        <Button size="lg" onClick={handleSaveChanges} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Gem Ændringer
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>AI Assistent Konfiguration</CardTitle>
          <CardDescription>
            Vælg AI-udbyder, model, og den første besked som AI-assistenten skal sende.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="ai-greeting">AI Startbesked</Label>
            <Input
              id="ai-greeting"
              value={settings.aiGreetingMessage || ''}
              onChange={(e) => handleInputChange('aiGreetingMessage', e.target.value)}
              placeholder="Indtast den første besked AI'en skal sende."
            />
            <p className="text-sm text-muted-foreground">Dette er den allerførste besked, brugeren ser i chat-vinduet.</p>
          </div>
          <hr/>
          <div className='grid md:grid-cols-2 gap-6'>
            <div className="space-y-2">
                <Label htmlFor="ai-provider">AI Provider</Label>
                <Select value={settings.aiProvider} onValueChange={(v: 'googleai' | 'openai') => handleProviderChange(v)}>
                    <SelectTrigger id="ai-provider">
                        <SelectValue placeholder="Vælg AI udbyder" />
                    </SelectTrigger>
                    <SelectContent>
                        {aiProviders.map(provider => (
                            <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="ai-model">AI Model</Label>
                <Select value={settings.aiModel} onValueChange={(value) => handleInputChange('aiModel', value)}>
                    <SelectTrigger id="ai-model">
                        <SelectValue placeholder="Vælg en AI model" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableModels.map(model => (
                            <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>
          
          {settings.aiProvider === 'openai' && (
             <div className="space-y-4">
                 <Alert variant="destructive">
                  <KeyRound className="h-4 w-4" />
                  <AlertTitle>API Nøgle Påkrævet</AlertTitle>
                  <AlertDescription>
                    For at aktivere OpenAI, **skal** du tilføje din API-nøgle til din <code className="bg-muted px-1 py-0.5 rounded-sm">.env</code> fil i formatet: <code className="bg-muted px-1 py-0.5 rounded-sm">OPENAI_API_KEY=sk-...</code>. Applikationen vil automatisk falde tilbage til Google Gemini, hvis nøglen ikke er sat korrekt i dine server-miljøvariabler.
                  </AlertDescription>
                </Alert>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
             <CardTitle>System Prompt</CardTitle>
             <CardDescription>
                Dette er den centrale instruktion, der definerer AI-assistentens mål, tone og regler. Vær specifik for at få de bedste resultater. Husk at forskellige modeller kræver forskellige prompt-strategier.
             </CardDescription>
        </CardHeader>
        <CardContent>
            {settings.aiProvider === 'googleai' ? (
                <div className="space-y-2">
                <Textarea
                    id="ai-prompt-gemini"
                    value={settings.aiSystemPrompt || ''}
                    onChange={(e) => handleInputChange('aiSystemPrompt', e.target.value)}
                    className="min-h-[400px] font-mono text-xs w-full"
                />
                </div>
            ) : (
                <div className="space-y-2">
                <Textarea
                    id="ai-prompt-openai"
                    value={settings.aiSystemPromptOpenAI || ''}
                    onChange={(e) => handleInputChange('aiSystemPromptOpenAI', e.target.value)}
                    className="min-h-[400px] font-mono text-xs w-full"
                />
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AiSettingsPage() {
    return (
        <CmsLayout>
            <AiSettingsPageContent />
        </CmsLayout>
    )
}
