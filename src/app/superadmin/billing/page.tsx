
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, DollarSign, Users, AlertTriangle } from "lucide-react";
import { getBillingDashboardData } from "./actions";
import { BillingClientPage } from "./client-page";

export default async function BillingPage() {
    const { metrics, brands } = await getBillingDashboardData();

    const metricCards = [
        { title: "Total MRR", value: `kr.${metrics.totalMrr.toFixed(2)}`, icon: DollarSign },
        { title: "Paying Brands", value: metrics.payingBrands.toString(), icon: CreditCard },
        { title: "Total Brands", value: metrics.totalBrands.toString(), icon: Users },
        { title: "Payment Issues", value: metrics.paymentIssues.toString(), icon: AlertTriangle },
    ];
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Billing Overview</h1>
                <p className="text-muted-foreground">
                    Monitor and manage subscription status for all brands.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {metricCards.map((metric) => (
                    <Card key={metric.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {metric.title}
                            </CardTitle>
                            <metric.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{metric.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            
            <BillingClientPage initialBrands={brands} />
        </div>
    );
}
