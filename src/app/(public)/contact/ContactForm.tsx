
'use client';

import { useActionState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { sendContactMessage } from '@/app/superadmin/website/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

type FormErrors = {
    name?: string[];
    email?: string[];
    message?: string[];
    gdpr?: string[];
}

type FormState = {
  message: string;
  errors?: FormErrors;
};

const initialState: FormState = {
  message: '',
  errors: {},
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending} data-cta="send_contact_message">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Send Besked
    </Button>
  );
}

function ContactFormInner() {
  const [state, formAction] = useActionState(sendContactMessage, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const searchParams = useSearchParams();

  const subject = useMemo(() => {
    return searchParams.get('subject') || '';
  }, [searchParams]);

  useEffect(() => {
    if (state.message && (!state.errors || Object.keys(state.errors).length === 0)) {
      toast({
        title: "Besked sendt!",
        description: state.message,
      });
      formRef.current?.reset();
    } else if (state.message && state.errors && Object.keys(state.errors).length > 0) {
        toast({
            title: "Fejl",
            description: state.message,
            variant: "destructive",
        })
    }
  }, [state, toast]);

  return (
      <main className="py-24 bg-muted/40">
        <div className="container mx-auto max-w-xl px-4 md:px-6">
            <Card className="shadow-lg">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl font-bold tracking-tight">Kom i kontakt</CardTitle>
                <CardDescription className="mt-4 text-lg text-muted-foreground">
                Har du et projekt, eller vil du bare sige hej? Udfyld formularen, så vender vi tilbage.
                </CardDescription>
            </CardHeader>
            <form ref={formRef} action={formAction} data-form="contact">
                <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="name">Navn</Label>
                    <Input id="name" name="name" placeholder="Dit navn" required />
                    {state?.errors?.name?.[0] && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" placeholder="din@email.dk" required />
                    {state?.errors?.email?.[0] && <p className="text-sm text-destructive">{state.errors.email[0]}</p>}
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="subject">Emne (valgfrit)</Label>
                    <Input id="subject" name="subject" placeholder="Angiv emne" defaultValue={subject} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="message">Besked</Label>
                    <Textarea id="message" name="message" placeholder="Fortæl os lidt om, hvad du har på hjerte..." required minLength={10} />
                    {state?.errors?.message?.[0] && <p className="text-sm text-destructive">{state.errors.message[0]}</p>}
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="gdpr" name="gdpr" required />
                    <Label htmlFor="gdpr" className="text-sm font-normal text-muted-foreground">
                    Jeg forstår, at OrderFly indsamler mine oplysninger for at kunne kontakte mig.
                    </Label>
                </div>
                {state?.errors?.gdpr?.[0] && <p className="text-sm text-destructive">{state.errors.gdpr[0]}</p>}
                </CardContent>
                <CardFooter className="flex-col gap-4">
                <SubmitButton />
                </CardFooter>
            </form>
            </Card>
        </div>
      </main>
  );
}

export function ContactForm() {
    return (
        <Suspense fallback={<div>Loading form...</div>}>
            <ContactFormInner />
        </Suspense>
    )
}
