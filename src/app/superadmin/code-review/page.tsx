

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { MOCK_CODE_REVIEWS } from "@/lib/code-review-mock-data";
import { format } from "date-fns";
import { CheckCircle, FileDiff, GitBranch, Calendar, Tag } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function CodeReviewListPage() {
    // In a real app, this would be a Firestore query with pagination
    const reviews = (MOCK_CODE_REVIEWS as any[]).sort(
        (a, b) => (b.reviewedAt as Date).getTime() - (a.reviewedAt as Date).getTime()
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Code Review History</h1>
                <p className="text-muted-foreground">
                   A log of all approved code changes implemented on the platform.
                </p>
            </div>
            
            <div className="space-y-4">
                {reviews.map(review => (
                    <Card key={review.id}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileDiff className="h-6 w-6 text-muted-foreground" />
                                {review.title}
                            </CardTitle>
                            <CardDescription>
                                {review.description}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                             <div className="flex items-center gap-2">
                                <Tag className="h-4 w-4 text-muted-foreground"/>
                                <strong>Version:</strong>
                                <span>{review.version}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500"/>
                                <strong>Approved by:</strong>
                                <span>{review.reviewedBy}</span>
                            </div>
                             <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <time className="text-muted-foreground" dateTime={review.reviewedAt.toISOString()}>
                                  {format(new Date(review.reviewedAt), 'MMM d, yyyy')}
                                </time>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button asChild variant="secondary">
                                <Link href={`/superadmin/code-review/${review.id}`}>
                                    View Details
                                </Link>
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    );
}
