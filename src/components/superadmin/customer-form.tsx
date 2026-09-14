'use client'

import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useEffect, useTransition, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { Customer } from '@/types'
import { createOrUpdateCustomer, getCustomerFormBrands } from '@/app/superadmin/customers/actions'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

const customerSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  phone: z.string().min(1, { message: 'Phone number is required.' }),
  status: z.boolean(),
})

type CustomerFormValues = z.infer<typeof customerSchema>

interface CustomerFormProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  customer: Customer | null
}

export function CustomerForm({ isOpen, setIsOpen, customer }: CustomerFormProps) {
  const [brands, setBrands] = useState<Array<{id:string;name:string}>>([])
  const [brandId, setBrandId] = useState('')
  const [loadingBrands, setLoadingBrands] = useState(false)
  const [formError, setFormError] = useState('')
  useEffect(() => {
    let current = true
    setFormError(''); setBrandId(''); setBrands([])
    if (isOpen && !customer) {
      setLoadingBrands(true)
      void getCustomerFormBrands().then(rows => {
        if (!current) return
        setBrands(rows)
        if (rows.length === 1) setBrandId(rows[0].id)
        if (!rows.length) setFormError('You do not have permission to create customers for a brand.')
      }).catch(() => {
        if (current) setFormError('Brands could not be loaded. Close the form and try again.')
      }).finally(() => { if (current) setLoadingBrands(false) })
    }
    return () => { current = false }
  }, [isOpen, customer])
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      status: true,
    },
  })

  useEffect(() => {
    if (customer) {
      form.reset({
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        status: customer.status === 'active',
      })
    } else {
      form.reset({
        fullName: '',
        email: '',
        phone: '',
        status: true,
      })
    }
  }, [customer, form, isOpen])

  const title = customer ? 'Edit Customer' : 'Create New Customer'
  const description = customer
    ? `Editing details for ${customer.fullName}.`
    : 'Fill in the details for the new customer.'
  const isEditing = !!customer
  const {
    formState: { isSubmitting },
  } = form

  const onSubmit = (data: CustomerFormValues) => {
    const formData = new FormData()
    if (customer?.id) formData.append('id', customer.id)
    if (!customer) formData.append('brandId', brandId)
    formData.append('fullName', data.fullName)
    formData.append('email', data.email)
    formData.append('phone', data.phone)
    formData.append('status', data.status ? 'active' : 'inactive')

    startTransition(async () => {
      setFormError('')
      try {
      const result = await createOrUpdateCustomer(null, formData)

      if (result?.error) {
        setFormError(result.message)
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.message,
        })
      } else {
        toast({
          title: 'Success!',
          description: result.message,
        })
        setIsOpen(false)
      }
      } catch {
        setFormError('The customer could not be saved. Your entries are preserved. Please try again.')
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!isPending) setIsOpen(open) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            {formError && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-sm text-red-950">{formError}</p>}
            <fieldset disabled={isPending} className="space-y-4">
            {!customer && <label className="block">Brand
              <select className="mt-1 w-full rounded-md border p-2 text-base" required disabled={loadingBrands} value={brandId} onChange={event => setBrandId(event.target.value)}>
                <option value="">{loadingBrands ? 'Loading brands…' : 'Select brand'}</option>
                {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>}
            {customer && <input type="hidden" name="id" value={customer.id} />}

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+123456789" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active Status</FormLabel>
                    <FormDescription>Inactive customers cannot place new orders.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || isSubmitting || (!customer && (loadingBrands || !brandId))}>
                {isPending || isSubmitting ? (
                  <Loader2 className="animate-spin" />
                ) : isEditing ? (
                  'Save Changes'
                ) : (
                  'Create Customer'
                )}
              </Button>
            </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
