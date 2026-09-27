'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer } from '@/types';
import { CustomerForm } from '@/components/superadmin/customer-form';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { deleteCustomer } from '../actions';

export function CustomerRecordActions({customer}:{customer:Pick<Customer,'id'|'fullName'|'email'|'phone'|'status'>}) {
  const [editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false);
  const router=useRouter(),{toast}=useToast();
  async function remove() {
    if (!window.confirm('Vil du slette denne merchant-kundepost permanent?')) return;
    setDeleting(true);
    try {
      const result=await deleteCustomer(customer.id);
      toast({title:result.error?'Kunden kunne ikke slettes':'Kundeposten er slettet',description:result.message,variant:result.error?'destructive':'default'});
      if (!result.error) router.push('/superadmin/customers');
    } finally {setDeleting(false);}
  }
  return <><div className="flex gap-2"><Button variant="outline" onClick={()=>setEditing(true)}>Rediger merchantpost</Button><Button variant="destructive" disabled={deleting} onClick={remove}>Slet merchantpost</Button></div><CustomerForm isOpen={editing} setIsOpen={open=>{setEditing(open);if(!open)router.refresh();}} customer={customer}/></>;
}
