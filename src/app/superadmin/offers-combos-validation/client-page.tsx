

'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Loader2, CircleHelp } from "lucide-react";
import { type TestResult } from "./actions";
import { useState, useTransition } from "react";
import { runOffersCombosValidationTests } from "./actions";

interface ClientPageProps {
    initialTestResults: TestResult[];
}

const StatusIcon = ({ status }: { status: TestResult['status'] }) => {
    if (status === 'Pass') {
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
     if (status === 'Fail') {
        return <XCircle className="h-5 w-5 text-destructive" />;
    }
    return <CircleHelp className="h-5 w-5 text-muted-foreground" />;
};

export function OffersCombosValidationClientPage({ initialTestResults }: ClientPageProps) {
    const [isPending, startTransition] = useTransition();
    const [results, setResults] = useState<TestResult[]>(initialTestResults);

    const handleRerun = () => {
        startTransition(async () => {
            const newResults = await runOffersCombosValidationTests();
            setResults(newResults);
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Offers & Combos Validation</h1>
                    <p className="text-muted-foreground">
                        Automated test runner for Offers and Combos display logic.
                    </p>
                </div>
                <Button onClick={handleRerun} disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                    Rerun Tests
                </Button>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Status</TableHead>
                                <TableHead className="w-[120px]">Test Case ID</TableHead>
                                <TableHead>Scenario</TableHead>
                                <TableHead>Expected Result</TableHead>
                                <TableHead>Actual Result</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {results.map((result) => (
                                <TableRow key={result.id} className={result.status === 'Fail' ? 'bg-destructive/10' : ''}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <StatusIcon status={result.status} />
                                            <span className="font-bold">{result.status}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{result.id}</TableCell>
                                    <TableCell>{result.scenario}</TableCell>
                                    <TableCell className="text-muted-foreground">{result.expected}</TableCell>
                                    <TableCell className="font-medium">{result.actual}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
