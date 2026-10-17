'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

// One series per chart in the admin primary colour: no new colours, and each
// series is named by its chart title, never by colour alone. Values are also
// available as a table for screen readers and print.
const color = 'hsl(var(--primary))';
const short = (day: string) => `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;

function DailyBars({ title, data, dataKey, label }: { title: string; data: Array<Record<string, number | string>>; dataKey: string; label: string }) {
  const config = { [dataKey]: { label, color } } satisfies ChartConfig;
  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <ChartContainer config={config} className="aspect-auto h-48 w-full" aria-label={title} role="img">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={short} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent labelFormatter={value => String(value)} />} />
          <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

export function OverviewCharts({ daily, channels }: { daily: Array<{ day: string; stamps: number; redemptions: number }>; channels: { dine_in: number; takeaway: number } }) {
  const channelData = [{ channel: 'Dine-in', stamps: channels.dine_in }, { channel: 'Takeaway', stamps: channels.takeaway }];
  const channelConfig = { stamps: { label: 'Stempler', color } } satisfies ChartConfig;
  return (
    <section aria-labelledby="overview-charts" className="space-y-4 rounded-lg border bg-white p-4">
      <h2 id="overview-charts" className="font-semibold">Udvikling</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <DailyBars title="Stempler pr. dag" data={daily} dataKey="stamps" label="Stempler" />
        <DailyBars title="Indløsninger pr. dag" data={daily} dataKey="redemptions" label="Indløsninger" />
      </div>
      <figure className="min-w-0 space-y-2">
        <figcaption className="text-sm font-medium">Stempler fordelt på kanal</figcaption>
        <ChartContainer config={channelConfig} className="aspect-auto h-28 w-full" aria-label="Stempler fordelt på kanal" role="img">
          <BarChart data={channelData} layout="vertical" margin={{ left: 0, right: 16 }}>
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis type="category" dataKey="channel" tickLine={false} axisLine={false} width={72} />
            <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="stamps" fill="var(--color-stamps)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} label={{ position: 'right', className: 'fill-foreground text-xs' }} />
          </BarChart>
        </ChartContainer>
      </figure>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Vis tallene som tabel</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th className="p-2">Dag</th><th className="p-2">Stempler</th><th className="p-2">Indløsninger</th></tr></thead>
          <tbody>{daily.map(d => <tr key={d.day}><td className="p-2">{d.day}</td><td className="p-2">{d.stamps}</td><td className="p-2">{d.redemptions}</td></tr>)}</tbody>
        </table>
        <p className="mt-2">Dine-in: {channels.dine_in} · Takeaway: {channels.takeaway}</p>
      </details>
    </section>
  );
}
