'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
export function LogoutButton({inSidebar=false,inline=false,loginHref='/admin-login'}: {inSidebar?: boolean;inline?: boolean;loginHref?: string}={}) {
  const [pending,setPending]=useState(false),[failed,setFailed]=useState(false);
  return <div className={inSidebar ? 'w-full' : inline ? 'contents' : 'flex items-center justify-end gap-3 px-4 py-2'}>
    {failed&&<p role="alert">Kunne ikke logge ud. Prøv igen.</p>}
    <Button variant="outline" className={inSidebar ? 'w-full border-white/70 bg-transparent text-white hover:bg-white/10 hover:text-white' : inline ? 'min-h-12 rounded-xl px-4 font-medium' : undefined} disabled={pending} onClick={async()=>{
      setPending(true);setFailed(false);
      try {const response=await fetch('/api/admin/session',{method:'DELETE'});if(!response.ok)throw new Error();window.location.assign(loginHref);}
      catch{setFailed(true);setPending(false);}
    }}>{pending?'Logger ud…':'Log ud'}</Button>
  </div>;
}
