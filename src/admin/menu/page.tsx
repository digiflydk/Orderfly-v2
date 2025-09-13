import { MenuImportClient } from "@/components/admin/menu-import-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MenuPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">
          Menu Management
        </h1>
        <p className="text-muted-foreground">
          Import, view, and manage your restaurant's menu items.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>AI Menu Import</CardTitle>
          <CardDescription>
            Upload an image of your menu, and our AI will automatically extract the items, descriptions, and prices for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MenuImportClient />
        </CardContent>
      </Card>
    </div>
  );
}
