import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">It works ✅</h1>
      <p className="text-sm text-gray-600">Baseline kører med components.</p>

      <div className="flex gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
      </div>
    </main>
  );
}
