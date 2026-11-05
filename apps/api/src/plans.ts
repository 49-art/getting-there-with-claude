import { POT_MULTIPLIER } from '@gt/engine';
import type { Plan } from './env.ts';

/**
 * Host Coder subscription tiers. Entitlements are enforced server-side.
 * Billing is deliberately not connected in this build (see DECISIONS.md D-012):
 * there is no open-source card processor, and a paid processor would break the
 * "no unexpected charges" requirement. Upgrades are granted by an admin.
 */
export interface Entitlements {
  plan: Plan;
  name: string;
  /** Suggested monthly price in GBP — display only, nothing is charged. */
  priceMonthly: number;
  maxActive: number;
  maxLevel: number;
  potMultiplier: number;
  lobbyPriority: number;
  perks: string[];
}

export const PLANS: Record<Plan, Entitlements> = {
  free: {
    plan: 'free',
    name: 'Free',
    priceMonthly: 0,
    maxActive: 3,
    maxLevel: 3,
    potMultiplier: POT_MULTIPLIER.free,
    lobbyPriority: 0,
    perks: ['Decode at every level', 'Create up to 3 live challenges', 'Levels 1–3 for your own challenges'],
  },
  coder: {
    plan: 'coder',
    name: 'Coder',
    priceMonthly: 8,
    maxActive: 15,
    maxLevel: 5,
    potMultiplier: POT_MULTIPLIER.coder,
    lobbyPriority: 0,
    perks: ['15 live challenges', 'Create up to Level 5', 'Coder stats on your profile'],
  },
  host: {
    plan: 'host',
    name: 'Host',
    priceMonthly: 22,
    maxActive: 100,
    maxLevel: 6,
    potMultiplier: POT_MULTIPLIER.host,
    lobbyPriority: 1,
    perks: ['100 live challenges', 'Master level', 'Pots up to 1.5× the level cap', 'Highlighted in the lobby'],
  },
  studio: {
    plan: 'studio',
    name: 'Studio',
    priceMonthly: 49,
    maxActive: 500,
    maxLevel: 6,
    potMultiplier: POT_MULTIPLIER.studio,
    lobbyPriority: 2,
    perks: ['500 live challenges', 'Pots up to 2× the level cap', 'Top lobby placement', 'Team use'],
  },
};

export function effectivePlan(plan: Plan, planUntil: number | null, at = Date.now()): Plan {
  if (plan !== 'free' && planUntil !== null && planUntil < at) return 'free';
  return plan;
}
