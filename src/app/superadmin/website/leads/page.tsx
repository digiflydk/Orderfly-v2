
'use client';

import { useEffect, useState } from 'react';
import { getLeadsAction } from '@/app/superadmin/website/actions';
import type { Lead } from '@/services/leads';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import CmsLayout from '../_cmsLayout';

function CmsLeadsPageContent() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadLeads() {
            setIsLoading(true);
            const loadedLeads = await getLeadsAction();
            setLeads(loadedLeads);
            setIsLoading(false);
        }
        loadLeads();
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold">Customer Leads</h1>
                <p className="text-muted-foreground">Oversigt over leads indsamlet af AI-assistenten.</p>
            </div>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Indsamlede Leads</CardTitle>
                    <CardDescription>Liste over potentielle kunder, der har interageret med AI-assistenten.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Dato</TableHead>
                                    <TableHead>Navn</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Telefon</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Projektidé</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {leads.length > 0 ? (
                                    leads.map(lead => (
                                        <TableRow key={lead.id}>
                                            <TableCell className="whitespace-nowrap">{format(new Date(lead.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                                            <TableCell>{lead.name}</TableCell>
                                            <TableCell>{lead.email}</TableCell>
                                            <TableCell>{lead.phone}</TableCell>
                                            <TableCell>
                                                <Badge variant={lead.status === 'Qualified' ? 'default' : 'secondary'}>
                                                    {lead.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-xs whitespace-pre-wrap">{lead.projectIdea}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center">
                                            Ingen leads fundet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function CmsLeadsPage() {
    return (
        <CmsLayout>
            <CmsLeadsPageContent />
        </CmsLayout>
    )
}
