
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Circle, Clock, Database, Server, Palette, ShoppingCart, User, Shield } from "lucide-react";

type Task = {
  id: string;
  name: string;
  details: string;
  status: 'Completed' | 'In Progress' | 'Pending';
  dependencies?: string;
};

type Phase = {
  title: string;
  description: string;
  tasks: Task[];
  icon: React.ElementType;
};

const backlog: Phase[] = [
  {
    title: "Phase 1: SuperAdmin Foundation",
    icon: Shield,
    description: "Build and finalize the core platform management tools for the SuperAdmin. This includes creating and managing all data models like Brands, Locations, Users, and the entire product catalog infrastructure.",
    tasks: [
      { id: "1.1", name: "Initial Setup & Core UI", details: "Configure project, styling, and basic page layouts for all portals.", status: "Completed" },
      { id: "1.2", name: "Core Data Models & Types", details: "Define all TypeScript types in `src/types` to ensure data consistency.", status: "Completed"},
      { id: "1.3", name: "User & Brand Management", details: "Implement full CRUD (Create, Read, Update, Delete) for Users and Brands.", status: "Completed"},
      { id: "1.4", name: "Subscription & Billing Management", details: "Implement CRUD for Subscription Plans and build the billing overview dashboard.", status: "Completed" },
      { id: "1.5", name: "Global Location Management", details: "Build the UI and server actions for managing all restaurant locations across brands.", status: "Completed" },
      { id: "1.6", name: "Global Product Catalog Management", details: "Implement full CRUD for Products, Categories, Toppings, and Allergens.", status: "In Progress", dependencies: "Task 1.5" },
      { id: "1.7", name: "Platform Settings", details: "Implement UI and actions for managing global settings like Analytics and Payment Gateways.", status: "Completed" },
    ],
  },
  {
    title: "Phase 2: Brand Admin Portal",
    icon: User,
    description: "Develop the dedicated portal for brand administrators to manage their own locations, menus, and view orders. This phase focuses on creating a tailored experience for the restaurant owner.",
    tasks: [
        { id: "2.1", name: "Implement Real Authentication", details: "Replace mock auth with Firebase Authentication for role-based access.", status: "Pending", dependencies: "Phase 1" },
        { id: "2.2", name: "Brand Admin Dashboard", details: "Create a dashboard showing key metrics and recent orders for the logged-in brand.", status: "Pending", dependencies: "Task 2.1" },
        { id: "2.3", name: "Live Order Dashboard", details: "Use real-time Firestore listeners to display new orders as they arrive.", status: "Pending", dependencies: "Task 2.2" },
        { id: "2.4", name: "Menu Management for Admins", details: "Allow admins to manage their assigned products, categories, etc., including the AI Menu Import.", status: "Pending", dependencies: "Task 2.1" },
        { id: "2.5", name: "Location Management for Admins", details: "Allow admins to manage settings for their assigned locations.", status: "Pending", dependencies: "Task 2.1" },
        { id: "2.6", name: "Implement Discount Logic", details: "Build the UI and backend logic for creating and applying discounts to orders.", status: "Pending", dependencies: "Task 2.3" },
    ]
  },
  {
      title: "Phase 3: Customer Webshop & Order Pipeline",
      icon: ShoppingCart,
      description: "Build the complete customer-facing experience, from selecting a location and browsing the menu to placing an order and completing payment. This also includes the backend order processing.",
      tasks: [
          { id: "3.1", name: "Location & Menu Display", details: "Build the public-facing pages for customers to browse menus for specific locations.", status: "Completed" },
          { id: "3.2", name: "Shopping Cart & Checkout", details: "Implement the shopping cart, checkout form, and Stripe integration.", status: "Completed", dependencies: "Task 1.7" },
          { id: "3.3", name: "Order Processing Pipeline", details: "Implement the server-side logic to handle incoming orders from Stripe webhooks and create structured `Order` documents in Firestore.", status: "Pending", dependencies: "Task 3.2" },
          { id: "3.4", name: "Confirmation & Status Pages", details: "Create pages for order confirmation, cancellation, and potentially a status tracking page.", status: "Completed" },
      ]
  },
];

const StatusIcon = ({ status }: { status: Task['status'] }) => {
  switch (status) {
    case 'Completed':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'In Progress':
      return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
    case 'Pending':
      return <Circle className="h-5 w-5 text-muted-foreground" />;
    default:
      return null;
  }
};

export default function BacklogPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Implementation Roadmap</h1>
        <p className="text-muted-foreground">
          A phase-by-phase plan for building the OrderFly platform.
        </p>
      </div>

      {backlog.map((phase) => (
        <Card key={phase.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <phase.icon className="h-6 w-6" />
              {phase.title}
            </CardTitle>
            <p className="pt-2 text-muted-foreground">{phase.description}</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Dependencies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phase.tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Badge variant={
                        task.status === 'Completed' ? 'default' : 
                        task.status === 'In Progress' ? 'secondary' : 'outline'
                      }>
                        <StatusIcon status={task.status} />
                        <span className="ml-2">{task.status}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{task.id}: {task.name}</p>
                      <p className="text-sm text-muted-foreground">{task.details}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{task.dependencies || 'None'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
