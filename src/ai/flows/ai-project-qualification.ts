
'use server';

import {ai} from '@/ai/genkit';
import { saveLead } from '@/services/leads';
import type { AIProjectQualificationInput, AIProjectQualificationOutput } from '@/types';
import { AIProjectQualificationInputSchema, AIProjectQualificationOutputSchema } from '@/types';


const qualificationPrompt = ai.definePrompt({
    name: 'aiProjectQualificationPrompt',
    input: { schema: AIProjectQualificationInputSchema },
    output: { schema: AIProjectQualificationOutputSchema },
    prompt: `Du er en ekspert AI-assistent for OrderFly, et digitalt konsulentfirma. Dit primære mål er at kvalificere potentielle klientprojekter ved at indsamle oplysninger på en venlig og professionel måde.

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

**Conversation History:**
{{#each conversationHistory}}
- **{{role}}**: {{content}}
{{/each}}
`
});

export const aiProjectQualification = ai.defineFlow(
  {
    name: 'aiProjectQualification',
    inputSchema: AIProjectQualificationInputSchema,
    outputSchema: AIProjectQualificationOutputSchema,
  },
  async (input) => {
    const response = await qualificationPrompt(input);
    const output = response.output();

    if (!output) {
      throw new Error("The AI model did not return a valid response.");
    }
    
    const { name, email, phone, projectIdea } = output.collectedInfo;
    
    // Save lead if qualified and all info is present
    if (output.qualified && name && email && phone && projectIdea) {
        await saveLead({
            name, email, phone, projectIdea,
            status: 'Qualified',
            createdAt: new Date(),
        });
    }

    return output;
  }
);
