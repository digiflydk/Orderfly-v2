'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
export function LogoutButton() {
  const [pending,setPending]=useState(false),[failed,setFailed]=useState(false);
  return <div className="flex items-center justify-end gap-3 px-4 py-2">
    {failed&&<p role="alert">Kunne ikke logge ud. Prøv igen.</p>}
    <Button variant="outline" disabled={pending} onClick={async()=>{
      setPending(true);setFailed(false);
      try {const response=await fetch('/api/admin/session',{method:'DELETE'});if(!response.ok)throw new Error();window.location.assign('/admin-login');}
      catch{setFailed(true);setPending(false);}
    }}>{pending?'Logger ud…':'Log ud'}</Button>
  </div>;
}
