

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { Loader2, Save, Trash2, Upload, X } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { importMenuAction, type FormState } from '@/app/admin/menu/actions';
import type { MenuImportOutput } from '@/ai/flows/menu-import';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Upload />
      )}
      Import from Image
    </Button>
  );
}

export function MenuImportClient() {
  const { toast } = useToast();
  const [menuItems, setMenuItems] = useState<MenuImportOutput>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const handleFormAction = (formData: FormData) => {
    startTransition(async () => {
      const result = await importMenuAction(null, formData);
      if (result.error) {
        toast({ variant: 'destructive', title: 'Import Failed', description: result.error });
      }
      if (result.data) {
        setMenuItems(result.data);
        toast({ title: 'Success!', description: result.message });
      }
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleItemChange = (index: number, field: 'name' | 'description' | 'price', value: string | number) => {
    const updatedItems = [...menuItems];
    const item = { ...updatedItems[index] };
    if (field === 'price' && typeof value === 'string') {
        const parsedPrice = parseFloat(value);
        item[field] = isNaN(parsedPrice) ? 0 : parsedPrice;
    } else if (typeof value === 'string') {
        (item[field] as string) = value;
    }
    updatedItems[index] = item;
    setMenuItems(updatedItems);
  };

  const deleteItem = (index: number) => {
    setMenuItems(menuItems.filter((_, i) => i !== index));
  };
  
  const handleClear = () => {
    setMenuItems([]);
    setImagePreview(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <form action={handleFormAction} className="space-y-4">
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Input id="menuImage" name="menuImage" type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} />
        </div>
        {imagePreview && (
          <div className="relative mt-4 w-full max-w-md rounded-lg border p-2">
            <Image
              src={imagePreview}
              alt="Menu preview"
              width={400}
              height={400}
              className="h-auto w-full rounded-md object-contain"
              data-ai-hint="restaurant menu"
            />
            <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 h-6 w-6 rounded-full bg-background/80 hover:bg-background"
                onClick={() => {
                    setImagePreview(null);
                    if(fileInputRef.current) fileInputRef.current.value = "";
                }}
            >
                <X className="h-4 w-4" />
                <span className="sr-only">Clear image</span>
            </Button>
          </div>
        )}
        <SubmitButton />
      </form>

      {menuItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Menu Items</CardTitle>
            <CardDescription>
              Review, edit, and save the items extracted from your menu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[25%]">Name</TableHead>
                    <TableHead className="w-[50%]">Description</TableHead>
                    <TableHead className="w-[15%] text-right">Price</TableHead>
                    <TableHead className="w-[10%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menuItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          className="bg-transparent"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          className="bg-transparent"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.price}
                          onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                          className="bg-transparent text-right"
                          step="0.01"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteItem(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="ghost" onClick={handleClear}>Clear</Button>
            <Button>
              <Save />
              Save Menu
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
