
export type Permission = {
    id: string;
    name: string;
    description: string;
    group: string;
}

export const ALL_PERMISSIONS: Permission[] = [
    // Brand Management
    { id: 'brands:view', name: 'View Brands', description: 'Can view the list of brands.', group: 'Brands' },
    { id: 'brands:create', name: 'Create Brands', description: 'Can create new brands.', group: 'Brands' },
    { id: 'brands:edit', name: 'Edit Brands', description: 'Can edit brand details.', group: 'Brands' },
    { id: 'brands:delete', name: 'Delete Brands', description: 'Can delete brands.', group: 'Brands' },

    // Location Management
    { id: 'locations:view', name: 'View Locations', description: 'Can view all locations.', group: 'Locations' },
    { id: 'locations:create', name: 'Create Locations', description: 'Can create new locations.', group: 'Locations' },
    { id: 'locations:edit', name: 'Edit Locations', description: 'Can edit location details.', group: 'Locations' },
    { id: 'locations:delete', name: 'Delete Locations', description: 'Can delete locations.', group: 'Locations' },

    // Product Management
    { id: 'products:view', name: 'View Products', description: 'Can view the global product catalog.', group: 'Products' },
    { id: 'products:create', name: 'Create Products', description: 'Can create new products.', group: 'Products' },
    { id: 'products:edit', name: 'Edit Products', description: 'Can edit existing products.', group: 'Products' },
    { id: 'products:delete', name: 'Delete Products', description: 'Can delete products.', group: 'Products' },

    // Order Management
    { id: 'orders:view', name: 'View All Orders', description: 'Can view all orders across the platform.', group: 'Orders' },
    { id: 'orders:edit', name: 'Edit Orders', description: 'Can edit order details or status.', group: 'Orders' },
    
    // User & Role Management
    { id: 'users:view', name: 'View Admin Users', description: 'Can view the list of SuperAdmin users.', group: 'Users' },
    { id: 'users:create', name: 'Create Admin Users', description: 'Can create new SuperAdmin users.', group: 'Users' },
    { id: 'users:edit', name: 'Edit Admin Users', description: 'Can edit user details and assign roles.', group: 'Users' },
    { id: 'users:delete', name: 'Delete Admin Users', description: 'Can delete SuperAdmin users.', group: 'Users' },
    { id: 'roles:manage', name: 'Manage Roles', description: 'Can create, edit, and delete roles and their permissions.', group: 'Users' },

    // Billing & Subscriptions
    { id: 'billing:view', name: 'View Billing', description: 'Can view billing information for all brands.', group: 'Finance' },
    { id: 'billing:manage', name: 'Manage Billing', description: 'Can manage subscriptions and invoices in Stripe.', group: 'Finance' },
    { id: 'subscriptions:view', name: 'View Subscriptions', description: 'Can view subscription plans.', group: 'Finance' },
    { id: 'subscriptions:manage', name: 'Manage Subscriptions', description: 'Can create, edit, and delete subscription plans.', group: 'Finance' },
    
    // Settings
    { id: 'settings:view', name: 'View Settings', description: 'Can view platform settings.', group: 'Platform' },
    { id: 'settings:edit', name: 'Edit Settings', description: 'Can edit global platform settings.', group: 'Platform' },
];


// This is a placeholder for a real permission check function that would
// get the current user's permissions from their roles.
// For now, it simulates a "SuperAdmin" user who always has all permissions.
export function hasPermission(permissionId: string): boolean {
    // In a real app, you would:
    // 1. Get the current logged-in user from Firebase Auth.
    // 2. Look up their user document in Firestore to get their `roleIds`.
    // 3. Look up those roles in the `roles` collection.
    // 4. Aggregate all permissions from those roles into a Set.
    // 5. Return `userPermissions.has(permissionId)`.

    // For now, we assume the user is a SuperAdmin and has all permissions.
    // This prevents being locked out during development.
    // To test the logic, you can temporarily return `false` or check a specific permission.
    console.log(`Checking for permission: ${permissionId}. Granting access as SuperAdmin.`);
    return true;
}
