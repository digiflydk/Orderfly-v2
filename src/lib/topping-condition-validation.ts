import { z } from 'zod';
import type { Topping, ToppingGroup } from '@/types';

const identifier = z.string().min(1).max(200).refine(id => !id.includes('/'));
export const toppingConditionsSchema = z.record(identifier, z.array(identifier).min(1).max(100))
  .refine(value => Object.keys(value).length <= 50 && Object.values(value).flat().length <= 500, 'Højst 50 betingede grupper og 500 aktiverende valg.');

/** One level: triggers must belong to attached, unconditional groups. */
export function validateToppingConditions(
  conditions: Record<string, string[]>, attached: string[], groups: ToppingGroup[],
  toppings: Topping[], locationIds: string[],
): string | null {
  if (!toppingConditionsSchema.safeParse(conditions).success) return 'Vælg mindst ét aktiverende tilvalg pr. betinget gruppe.';
  const covers = (ids: string[]) => locationIds.length > 0 && locationIds.every(id => ids.includes(id));
  for (const [target, triggers] of Object.entries(conditions)) {
    const group = groups.find(g => g.id === target);
    if (!attached.includes(target) || !group || !covers(group.locationIds)) return 'Den betingede gruppe skal være tilknyttet produktet og alle dets lokationer.';
    for (const id of triggers) {
      const topping = toppings.find(t => t.id === id);
      const source = groups.find(g => g.id === topping?.groupId);
      if (!topping?.isActive || !source || !attached.includes(source.id) ||
          Object.hasOwn(conditions, source.id) || !covers(source.locationIds) || !covers(topping.locationIds)) {
        return 'Aktiverende tilvalg skal være aktive og høre til en altid synlig gruppe på produktets lokationer. Kæder og cirkler er ikke tilladt.';
      }
    }
  }
  return null;
}
