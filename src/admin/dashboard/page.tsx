
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBag, UtensilsCrossed } from "lucide-react";

const metrics = [
  { title: "Today's Revenue", value: "kr.1,250", icon: DollarSign },
  { title: "Today's Orders", value: "85", icon: ShoppingBag },
  { title: "New Customers", value: "12", icon: UtensilsCrossed },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's a quick overview of your restaurant's performance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
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

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Recent order list will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
