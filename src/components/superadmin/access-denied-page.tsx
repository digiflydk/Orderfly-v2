'use client';

import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "../ui/button";
import Link from "next/link";

export function AccessDeniedPage() {
    return (
        <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <ShieldAlert className="h-8 w-8 text-destructive" />
                    </div>
                    <CardTitle className="mt-4">Access Denied</CardTitle>
                    <CardDescription>
                        You do not have permission to access this feature. Please contact an administrator if you believe this is an error.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild>
                        <Link href="/superadmin/dashboard">Go to Dashboard</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
