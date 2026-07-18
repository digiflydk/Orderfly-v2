'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

import type {
  Allergen,
  Brand,
  Category,
  Location,
  Product,
  ToppingGroup,
} from '@/types';
import {
  createOrUpdateProduct,
  type FormState,
} from '@/app/superadmin/products/actions';
import { useToast } from '@/hooks/use-toast';
import { safeImage } from '@/lib/images';

type ProductFlag =
  | 'isActive'
  | 'isFeatured'
  | 'isNew'
  | 'isPopular';

function asBool(value: unknown): boolean | undefined {
  if (value === true || value === false) {
    return value;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  const normalizedValue = String(value)
    .toLowerCase()
    .trim();

  return [
    '1',
    'true',
    'on',
    'yes',
    'checked',
  ].includes(normalizedValue);
}

const baseFields = {
  id: z.string().optional().nullable(),

  brandId: z
    .string()
    .min(1, 'A brand must be selected.'),

  locationIds: z
    .array(z.string())
    .optional()
    .default([]),

  categoryId: z
    .string()
    .min(1, 'A category must be selected.'),

  productName: z
    .string()
    .min(
      2,
      'Product name must be at least 2 characters.',
    ),

  description: z.string().optional(),

  price: z.coerce
    .number()
    .min(
      0,
      'Price must be a non-negative number.',
    ),

  priceDelivery: z.coerce
    .number()
    .min(
      0,
      'Delivery price must be a non-negative number.',
    )
    .optional(),

  allergenIds: z
    .array(z.string())
    .optional()
    .default([]),

  toppingGroupIds: z
    .array(z.string())
    .optional()
    .default([]),

  imageUrl: z.any().optional(),
};

const createSchema = z.object({
  ...baseFields,

  isActive: z
    .preprocess(asBool, z.boolean())
    .optional()
    .default(false),

  isFeatured: z
    .preprocess(asBool, z.boolean())
    .optional()
    .default(false),

  isNew: z
    .preprocess(asBool, z.boolean())
    .optional()
    .default(false),

  isPopular: z
    .preprocess(asBool, z.boolean())
    .optional()
    .default(false),
});

const updateSchema = z.object({
  ...baseFields,

  isActive: z
    .preprocess(asBool, z.boolean())
    .optional(),

  isFeatured: z
    .preprocess(asBool, z.boolean())
    .optional(),

  isNew: z
    .preprocess(asBool, z.boolean())
    .optional(),

  isPopular: z
    .preprocess(asBool, z.boolean())
    .optional(),
});

type ProductFormValues = z.output<
  typeof createSchema
>;

interface ProductFormPageProps {
  product?: Product;
  brands: Brand[];
  locations: Location[];
  categories: Category[];
  toppingGroups: ToppingGroup[];
  allergens: Allergen[];
}

function SubmitButton({
  isEditing,
}: {
  isEditing: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : isEditing ? (
        'Save Changes'
      ) : (
        'Create Product'
      )}
    </Button>
  );
}

function uniq<T>(
  values: T[] | undefined | null,
): T[] {
  return Array.from(
    new Set(
      (values ?? []).filter(
        (value): value is T =>
          value !== null &&
          value !== undefined,
      ),
    ),
  );
}

export function ProductFormPage({
  product,
  brands,
  locations,
  categories,
  toppingGroups,
  allergens,
}: ProductFormPageProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [state, formAction] = useActionState<
    FormState | null,
    FormData
  >(createOrUpdateProduct, null);

  const [imagePreview, setImagePreview] =
    useState<string | null>(
      typeof product?.imageUrl === 'string'
        ? product.imageUrl
        : null,
    );

  const isEditing = Boolean(product);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(
      isEditing ? updateSchema : createSchema,
    ) as any,

    mode: 'onSubmit',

    defaultValues: product
      ? {
          id: product.id ?? '',
          brandId: product.brandId ?? '',
          categoryId: product.categoryId ?? '',
          productName:
            product.productName ?? '',
          description:
            product.description ?? '',
          price: product.price ?? 0,
          priceDelivery:
            product.priceDelivery ?? 0,
          isActive:
            product.isActive ?? false,
          isFeatured:
            product.isFeatured ?? false,
          isNew: product.isNew ?? false,
          isPopular:
            product.isPopular ?? false,
          locationIds: uniq(
            product.locationIds,
          ),
          allergenIds: uniq(
            product.allergenIds,
          ),
          toppingGroupIds: uniq(
            product.toppingGroupIds,
          ),
          imageUrl: product.imageUrl,
        }
      : {
          id: '',
          brandId: '',
          categoryId: '',
          productName: '',
          description: '',
          price: 0,
          priceDelivery: 0,
          isActive: true,
          isFeatured: false,
          isNew: false,
          isPopular: false,
          locationIds: [],
          allergenIds: [],
          toppingGroupIds: [],
          imageUrl: undefined,
        },
  });

  const selectedBrandId =
    form.watch('brandId');

  const {
    brandLocations,
    brandCategories,
    brandToppingGroups,
  } = useMemo(() => {
    if (!selectedBrandId) {
      return {
        brandLocations: [],
        brandCategories: [],
        brandToppingGroups: [],
      };
    }

    const locationsForBrand =
      locations.filter(
        location =>
          location.brandId ===
          selectedBrandId,
      );

    const brandLocationIds = new Set(
      locationsForBrand
        .map(location => location.id)
        .filter(
          (id): id is string =>
            typeof id === 'string' &&
            id.length > 0,
        ),
    );

    const categoriesForBrand =
      categories.filter(category => {
        const categoryLocationIds =
          Array.isArray(
            category.locationIds,
          )
            ? category.locationIds
            : [];

        return categoryLocationIds.some(
          locationId =>
            brandLocationIds.has(
              locationId,
            ),
        );
      });

    const toppingGroupsForBrand =
      toppingGroups.filter(
        toppingGroup => {
          const toppingLocationIds =
            Array.isArray(
              toppingGroup.locationIds,
            )
              ? toppingGroup.locationIds
              : [];

          return toppingLocationIds.some(
            locationId =>
              brandLocationIds.has(
                locationId,
              ),
          );
        },
      );

    return {
      brandLocations: locationsForBrand,
      brandCategories:
        categoriesForBrand,
      brandToppingGroups:
        toppingGroupsForBrand,
    };
  }, [
    selectedBrandId,
    locations,
    categories,
    toppingGroups,
  ]);

  useEffect(() => {
    const currentCategoryId =
      form.getValues('categoryId');

    if (
      currentCategoryId &&
      !brandCategories.some(
        category =>
          category.id ===
          currentCategoryId,
      )
    ) {
      form.setValue('categoryId', '', {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [
    selectedBrandId,
    brandCategories,
    form,
  ]);

  useEffect(() => {
    if (!state) {
      return;
    }

    if (state.ok) {
      toast({
        title: 'Success!',
        description: `Product ${
          isEditing
            ? 'updated'
            : 'created'
        } successfully.`,
      });

      router.push(
        '/superadmin/products',
      );

      return;
    }

    if (state.error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          state.error.detail ||
          state.error.message,
      });
    }
  }, [
    state,
    toast,
    router,
    isEditing,
  ]);

  const title = isEditing
    ? 'Edit Product'
    : 'Create New Product';

  const description = isEditing
    ? `Editing details for ${
        product?.productName ??
        'product'
      }.`
    : 'Fill in the details for the new product.';

  const allergenIds = uniq(
    form.watch('allergenIds'),
  );

  function updateExclusiveFlag(
    activeFlag: ProductFlag,
    checked: boolean,
  ) {
    form.setValue(
      activeFlag,
      checked,
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );

    if (!checked) {
      return;
    }

    const mutuallyExclusiveFlags: ProductFlag[] =
      [
        'isFeatured',
        'isNew',
        'isPopular',
      ];

    mutuallyExclusiveFlags.forEach(
      flag => {
        if (flag !== activeFlag) {
          form.setValue(flag, false, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      },
    );
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          action={formAction}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {title}
              </h1>

              <p className="text-muted-foreground">
                {description}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                asChild
              >
                <Link href="/superadmin/products">
                  Cancel
                </Link>
              </Button>

              <SubmitButton
                isEditing={isEditing}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Core Details
                  </CardTitle>

                  <CardDescription>
                    Public-facing product
                    information.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {isEditing &&
                    product?.id && (
                      <input
                        type="hidden"
                        name="id"
                        value={product.id}
                      />
                    )}

                  <FormField
                    control={form.control}
                    name="brandId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Brand
                        </FormLabel>

                        <Select
                          onValueChange={value => {
                            field.onChange(
                              value,
                            );
                          }}
                          value={
                            field.value ?? ''
                          }
                          disabled={isEditing}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a brand" />
                            </SelectTrigger>
                          </FormControl>

                          <SelectContent>
                            {brands.map(
                              brand => (
                                <SelectItem
                                  key={
                                    brand.id
                                  }
                                  value={
                                    brand.id
                                  }
                                >
                                  {
                                    brand.name
                                  }
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>

                        {isEditing && (
                          <>
                            <input
                              type="hidden"
                              name="brandId"
                              value={
                                field.value ??
                                ''
                              }
                            />

                            <FormDescription>
                              Product&apos;s
                              brand cannot be
                              changed after
                              creation.
                            </FormDescription>
                          </>
                        )}

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="productName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Product Name
                        </FormLabel>

                        <FormControl>
                          <Input
                            placeholder="e.g., Margherita Pizza"
                            {...field}
                            value={
                              field.value ??
                              ''
                            }
                            name="productName"
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Description
                        </FormLabel>

                        <FormControl>
                          <Textarea
                            placeholder="A short, tasty description."
                            {...field}
                            value={
                              field.value ??
                              ''
                            }
                            name="description"
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({
                        field,
                      }) => (
                        <FormItem>
                          <FormLabel>
                            Category
                          </FormLabel>

                          <Select
                            onValueChange={
                              field.onChange
                            }
                            value={
                              field.value ??
                              ''
                            }
                            disabled={
                              !selectedBrandId
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>

                            <SelectContent>
                              {brandCategories.map(
                                category => (
                                  <SelectItem
                                    key={
                                      category.id
                                    }
                                    value={
                                      category.id
                                    }
                                  >
                                    {
                                      category.categoryName
                                    }
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>

                          <input
                            type="hidden"
                            name="categoryId"
                            value={
                              field.value ??
                              ''
                            }
                          />

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="price"
                      render={({
                        field,
                      }) => (
                        <FormItem>
                          <FormLabel>
                            Price (Pickup)
                          </FormLabel>

                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              name="price"
                              value={
                                field.value ??
                                ''
                              }
                              onBlur={
                                field.onBlur
                              }
                              ref={field.ref}
                              onChange={event => {
                                const value =
                                  event.target
                                    .value;

                                field.onChange(
                                  value === ''
                                    ? 0
                                    : Number(
                                        value,
                                      ),
                                );
                              }}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="priceDelivery"
                      render={({
                        field,
                      }) => (
                        <FormItem>
                          <FormLabel>
                            Price (Delivery)
                          </FormLabel>

                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              name="priceDelivery"
                              value={
                                field.value ??
                                ''
                              }
                              onBlur={
                                field.onBlur
                              }
                              ref={field.ref}
                              onChange={event => {
                                const value =
                                  event.target
                                    .value;

                                field.onChange(
                                  value === ''
                                    ? undefined
                                    : Number(
                                        value,
                                      ),
                                );
                              }}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormItem>
                    <FormLabel>
                      Product Image
                    </FormLabel>

                    <FormControl>
                      <Input
                        name="imageUrl"
                        type="file"
                        accept="image/*"
                        onChange={event => {
                          const file =
                            event.target
                              .files?.[0];

                          if (file) {
                            const reader =
                              new FileReader();

                            reader.onloadend =
                              () => {
                                setImagePreview(
                                  typeof reader.result ===
                                    'string'
                                    ? reader.result
                                    : null,
                                );
                              };

                            reader.readAsDataURL(
                              file,
                            );

                            return;
                          }

                          setImagePreview(
                            typeof product?.imageUrl ===
                              'string'
                              ? product.imageUrl
                              : null,
                          );
                        }}
                      />
                    </FormControl>

                    {imagePreview && (
                      <div className="relative mt-2 h-32 w-32">
                        <Image
                          src={safeImage(
                            imagePreview,
                          )}
                          alt="Image Preview"
                          fill
                          className="rounded-md border object-contain"
                          data-ai-hint="delicious food"
                        />
                      </div>
                    )}

                    <FormMessage />
                  </FormItem>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    Availability &amp;
                    Associations
                  </CardTitle>

                  <CardDescription>
                    Control where and how
                    this product appears.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="locationIds"
                    render={({ field }) => {
                      const selectedValues =
                        Array.isArray(
                          field.value,
                        )
                          ? field.value
                          : [];

                      return (
                        <FormItem>
                          <FormLabel>
                            Available at
                            Locations
                          </FormLabel>

                          <FormDescription>
                            If no locations
                            are selected, the
                            product will be
                            available at all
                            brand locations.
                          </FormDescription>

                          <ScrollArea className="h-40 rounded-md border">
                            <div className="p-4">
                              {brandLocations.map(
                                location => {
                                  const locationId =
                                    location.id;

                                  if (
                                    !locationId
                                  ) {
                                    return null;
                                  }

                                  const checkboxId = `loc-${locationId}`;

                                  return (
                                    <div
                                      key={
                                        locationId
                                      }
                                      className="mb-2 flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <Checkbox
                                        id={
                                          checkboxId
                                        }
                                        name="locationIds"
                                        value={
                                          locationId
                                        }
                                        checked={selectedValues.includes(
                                          locationId,
                                        )}
                                        onCheckedChange={checked => {
                                          const nextValues =
                                            checked ===
                                            true
                                              ? uniq(
                                                  [
                                                    ...selectedValues,
                                                    locationId,
                                                  ],
                                                )
                                              : selectedValues.filter(
                                                  (
                                                    value: string,
                                                  ) =>
                                                    value !==
                                                    locationId,
                                                );

                                          field.onChange(
                                            nextValues,
                                          );
                                        }}
                                      />

                                      <Label
                                        htmlFor={
                                          checkboxId
                                        }
                                        className="font-normal"
                                      >
                                        {
                                          location.name
                                        }
                                      </Label>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </ScrollArea>

                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="toppingGroupIds"
                    render={({ field }) => {
                      const selectedValues =
                        Array.isArray(
                          field.value,
                        )
                          ? field.value
                          : [];

                      return (
                        <FormItem>
                          <FormLabel>
                            Topping Groups
                          </FormLabel>

                          <ScrollArea className="h-40 rounded-md border">
                            <div className="p-4">
                              {brandToppingGroups.map(
                                toppingGroup => {
                                  const toppingGroupId =
                                    toppingGroup.id;

                                  if (
                                    !toppingGroupId
                                  ) {
                                    return null;
                                  }

                                  const checkboxId = `tg-${toppingGroupId}`;

                                  return (
                                    <div
                                      key={
                                        toppingGroupId
                                      }
                                      className="mb-2 flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <Checkbox
                                        id={
                                          checkboxId
                                        }
                                        name="toppingGroupIds"
                                        value={
                                          toppingGroupId
                                        }
                                        checked={selectedValues.includes(
                                          toppingGroupId,
                                        )}
                                        onCheckedChange={checked => {
                                          const nextValues =
                                            checked ===
                                            true
                                              ? uniq(
                                                  [
                                                    ...selectedValues,
                                                    toppingGroupId,
                                                  ],
                                                )
                                              : selectedValues.filter(
                                                  (
                                                    value: string,
                                                  ) =>
                                                    value !==
                                                    toppingGroupId,
                                                );

                                          field.onChange(
                                            nextValues,
                                          );
                                        }}
                                      />

                                      <Label
                                        htmlFor={
                                          checkboxId
                                        }
                                        className="font-normal"
                                      >
                                        {
                                          toppingGroup.groupName
                                        }
                                      </Label>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </ScrollArea>

                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="allergenIds"
                    render={() => (
                      <FormItem>
                        <FormLabel>
                          Allergens
                        </FormLabel>

                        <ScrollArea className="h-40 rounded-md border">
                          <div className="p-4">
                            {allergens.map(
                              allergen => {
                                const allergenId =
                                  allergen.id;

                                if (
                                  !allergenId
                                ) {
                                  return null;
                                }

                                const checkboxId = `alg-${allergenId}`;

                                return (
                                  <div
                                    key={
                                      allergenId
                                    }
                                    className="mb-2 flex flex-row items-start space-x-3 space-y-0"
                                  >
                                    <Checkbox
                                      id={
                                        checkboxId
                                      }
                                      name="allergenIds"
                                      value={
                                        allergenId
                                      }
                                      checked={allergenIds.includes(
                                        allergenId,
                                      )}
                                      onCheckedChange={checked => {
                                        const currentValues =
                                          form.getValues(
                                            'allergenIds',
                                          ) ??
                                          [];

                                        const nextValues =
                                          checked ===
                                          true
                                            ? uniq(
                                                [
                                                  ...currentValues,
                                                  allergenId,
                                                ],
                                              )
                                            : currentValues.filter(
                                                (
                                                  value: string,
                                                ) =>
                                                  value !==
                                                  allergenId,
                                              );

                                        form.setValue(
                                          'allergenIds',
                                          nextValues,
                                          {
                                            shouldDirty:
                                              true,
                                            shouldValidate:
                                              true,
                                          },
                                        );
                                      }}
                                    />

                                    <Label
                                      htmlFor={
                                        checkboxId
                                      }
                                      className="font-normal"
                                    >
                                      {
                                        allergen.allergenName
                                      }
                                    </Label>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </ScrollArea>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Configuration
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>
                            Active
                          </FormLabel>
                        </div>

                        <FormControl>
                          <Switch
                            name="isActive"
                            checked={
                              field.value ===
                              true
                            }
                            onCheckedChange={checked => {
                              field.onChange(
                                checked ===
                                  true,
                              );
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isFeatured"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>
                            Featured
                          </FormLabel>
                        </div>

                        <FormControl>
                          <Switch
                            name="isFeatured"
                            checked={
                              field.value ===
                              true
                            }
                            onCheckedChange={checked => {
                              updateExclusiveFlag(
                                'isFeatured',
                                checked ===
                                  true,
                              );
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isNew"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>
                            New Product
                          </FormLabel>
                        </div>

                        <FormControl>
                          <Switch
                            name="isNew"
                            checked={
                              field.value ===
                              true
                            }
                            onCheckedChange={checked => {
                              updateExclusiveFlag(
                                'isNew',
                                checked ===
                                  true,
                              );
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isPopular"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>
                            Popular Product
                          </FormLabel>
                        </div>

                        <FormControl>
                          <Switch
                            name="isPopular"
                            checked={
                              field.value ===
                              true
                            }
                            onCheckedChange={checked => {
                              updateExclusiveFlag(
                                'isPopular',
                                checked ===
                                  true,
                              );
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}