import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function M3ConfirmationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-3xl">Tak for din bestilling!</CardTitle>
          <CardDescription className="text-lg">
            Vi har modtaget din ordre og er i gang med at forberede den.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/m3">Tilbage til forsiden</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
