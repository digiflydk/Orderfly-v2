import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { promises as fs } from 'fs';
import path from 'path';

type Report = {
  timestamp: string;
  files: {
    file: string;
    status: 'normalized' | 'clean';
  }[];
};

async function getAuditReport(): Promise<Report | null> {
  const reportPath = path.join(process.cwd(), 'public/build/audit/props-normalize.json');
  try {
    const data = await fs.readFile(reportPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

export default async function PropsAuditPage() {
    const report = await getAuditReport();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Props Normalization Audit</h1>
                <p className="text-muted-foreground">
                    This page shows the log from the last time the `normalize-next-props` script was run during `npm run build`.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Build Report</CardTitle>
                    <CardDescription>
                        Last run at: {report ? new Date(report.timestamp).toLocaleString() : 'N/A'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {report ? (
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>File</TableHead>
                                    <TableHead className="w-[150px]">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report.files.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-mono text-xs">{item.file}</TableCell>
                                        <TableCell>
                                            <Badge variant={item.status === 'normalized' ? 'default' : 'secondary'}>
                                                {item.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                         </Table>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">No audit report found. Run `npm run build` to generate one.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
