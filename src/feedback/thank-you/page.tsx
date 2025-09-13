
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function ThankYouPage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-muted/40">
            <Card className="w-full max-w-lg text-center shadow-lg">
                <CardHeader>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                        <CheckCircle2 className="h-10 w-10 text-green-600" />
                    </div>
                    <CardTitle className="text-3xl">Thank You!</CardTitle>
                    <CardDescription className="text-lg">
                        Your feedback has been received. We appreciate you taking the time to help us improve.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild>
                        <Link href="/">Back to Home</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
