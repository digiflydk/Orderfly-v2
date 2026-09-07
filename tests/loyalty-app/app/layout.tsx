import '../../../src/app/globals.css';
import {Toaster} from '@/components/ui/toaster';
export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}<Toaster/></body></html>;}
