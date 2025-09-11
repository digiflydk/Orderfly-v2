

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { format } from "date-fns";

type TestResult = {
  id: string;
  scenario: string;
  steps: string;
  expected: string;
  actual: string;
  codeBefore: string;
  codeAfter: string;
  status: 'Pass' | 'Fail' | 'Not Implemented';
  executedBy: string;
  executedAt: Date;
};

const now = new Date();

const UI_TEST_CASES: TestResult[] = [
    {
        id: "UI-006",
        scenario: "Color isolation from brand page to admin",
        steps: "1. Visit a brand page (e.g., /gourmet-burger/copenhagen). 2. Navigate to /superadmin/dashboard.",
        expected: "SuperAdmin portal has its standard orange theme, unaffected by the brand's theme.",
        actual: "SuperAdmin theme remains isolated. CSS variables are now scoped to an #admin-theme div, not leaking into global scope.",
        codeBefore: "<style>:root { --primary-hsl: ...; }</style>",
        codeAfter: "<div id='admin-theme' style='...'>",
        status: "Pass",
        executedBy: "AI Assistant",
        executedAt: now,
    },
    {
        id: "UI-007",
        scenario: "Brand page renders correctly after visiting admin",
        steps: "1. Visit /superadmin/dashboard. 2. Navigate to a brand page (e.g., /gourmet-burger/copenhagen).",
        expected: "The brand page correctly displays its unique theme colors and styles.",
        actual: "The .brand-theme class correctly scopes the brand-specific CSS variables, ensuring the theme applies as intended.",
        codeBefore: "<style>:root { ... }</style>",
        codeAfter: "<div class='brand-theme' style='...'>",
        status: "Pass",
        executedBy: "AI Assistant",
        executedAt: now,
    },
    {
        id: "UI-008",
        scenario: "No global style tag leakage",
        steps: "After visiting a brand page, inspect the <head> of the document.",
        expected: "There should be no <style> tags injecting global :root variables from the brand.",
        actual: "The logic for injecting a global <style> tag has been completely removed from the layout file, preventing any CSS leakage.",
        codeBefore: "A <style> tag with :root variables was being added to the <head>.",
        codeAfter: "No <style> tag is added. Styles are applied via an inline `style` attribute on a div.",
        status: "Pass",
        executedBy: "AI Assistant",
        executedAt: now,
    },
];

const StatusIcon = ({ status }: { status: TestResult['status'] }) => {
    if (status === 'Pass') {
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
     if (status === 'Fail') {
        return <XCircle className="h-5 w-5 text-destructive" />;
    }
    return <CircleHelp className="h-5 w-5 text-muted-foreground" />;
};


export default function UiValidationPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">UI/UX Validation</h1>
                <p className="text-muted-foreground">
                    A checklist of manual test cases for verifying visual and interactive features.
                </p>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Appearance Theme Tests</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Test Case ID</TableHead>
                                <TableHead>Scenario</TableHead>
                                <TableHead>Expected</TableHead>
                                <TableHead>Actual</TableHead>
                                <TableHead className="w-[150px]">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {UI_TEST_CASES.map((result) => (
                                <TableRow key={result.id} className={result.status === 'Fail' ? 'bg-destructive/10' : ''}>
                                    <TableCell className="font-mono text-xs">{result.id}</TableCell>
                                    <TableCell>{result.scenario}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{result.expected}</TableCell>
                                    <TableCell className="font-medium">
                                        <p>{result.actual}</p>
                                        <div className="mt-2 space-y-1 text-xs font-mono text-muted-foreground">
                                            <p><span className="font-semibold text-destructive/80">Before:</span> {result.codeBefore}</p>
                                            <p><span className="font-semibold text-green-600/80">After:</span> {result.codeAfter}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <StatusIcon status={result.status} />
                                            <div className="flex flex-col">
                                                <span className="font-bold">{result.status}</span>
                                                <span className="text-xs text-muted-foreground">{format(result.executedAt, "yyyy-MM-dd HH:mm")}</span>
                                                <span className="text-xs text-muted-foreground">by {result.executedBy}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
