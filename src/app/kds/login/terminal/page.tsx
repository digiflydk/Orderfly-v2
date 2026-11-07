import { TerminalLogin } from '@/app/terminal/login/terminal-login';

export default function KitchenTerminalLoginPage() {
  return <><a href="/kds/login" className="inline-block py-3 underline">Log ind som medarbejder</a><TerminalLogin ordersHref="/kds?terminal=1" /></>;
}
