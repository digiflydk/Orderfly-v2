

import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MOCK_CODE_REVIEWS } from '@/lib/code-review-mock-data';
import type { CodeReview } from '@/types';
import { ArrowLeft, CheckCircle, FileDiff, GitBranch, GitCommit, User, Calendar, Tag } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


function getReviewDetails(reviewId: string): CodeReview | null {
    const review = MOCK_CODE_REVIEWS.find(r => r.id === reviewId);
    if (!review) {
        return null;
    }
    return review;
}

function InfoItem({ icon: Icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) {
    return (
        <div className="flex items-center text-sm">
            <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
            <span className="text-muted-foreground mr-2">{label}:</span>
            <span className="font-medium">{children}</span>
        </div>
    )
}

export default async function CodeReviewDetailPage({ params }: { params: { reviewId: string } }) {
    const review = getReviewDetails(params.reviewId);

    if (!review) {
        notFound();
    }

    return (
        <div className="space-y-6">
             <div>
                <Button variant="outline" size="sm" asChild className="mb-4">
                    <Link href="/superadmin/code-review">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to All Reviews
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold tracking-tight">{review.title}</h1>
                <p className="text-muted-foreground">{review.description}</p>
            </div>
            
             <Card>
                <CardHeader>
                    <CardTitle>Review Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoItem icon={User} label="Reviewed by">{review.reviewedBy}</InfoItem>
                    <InfoItem icon={Calendar} label="Reviewed at">{format(review.reviewedAt, 'MMM d, yyyy HH:mm')}</InfoItem>
                    <InfoItem icon={CheckCircle} label="Status"><Badge variant="default">{review.status}</Badge></InfoItem>
                    <InfoItem icon={GitBranch} label="Feature Ref">{review.featureRef}</InfoItem>
                    <InfoItem icon={GitCommit} label="Version">{review.version}</InfoItem>
                    <InfoItem icon={Tag} label="Related Path"><code className="text-xs">{review.relatedPath}</code></InfoItem>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileDiff className="h-6 w-6" />
                        File Changes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {review.files.map(file => (
                            <div key={file.name} className="border rounded-lg">
                                <div className="bg-muted px-4 py-2 border-b font-mono text-sm">
                                    {file.name}
                                </div>
                                <pre className="p-4 text-xs overflow-x-auto">
                                    <code>
                                        {file.diff.trim().split('\n').map((line, i) => {
                                            const isAdded = line.startsWith('+ ');
                                            const isRemoved = line.startsWith('- ');
                                            return (
                                                <div key={i} className={cn(
                                                    "flex items-start",
                                                    isAdded && "bg-green-100 dark:bg-green-900/50",
                                                    isRemoved && "bg-red-100 dark:bg-red-900/50",
                                                )}>
                                                    <span className="w-8 shrink-0 text-center">{isAdded ? '+' : isRemoved ? '-' : ' '}</span>
                                                    <span className="flex-1">{isAdded || isRemoved ? line.substring(2) : line}</span>
                                                </div>
                                            )
                                        })}
                                    </code>
                                </pre>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
