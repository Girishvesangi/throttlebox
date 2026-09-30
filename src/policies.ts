export type Policy =
  | { id: string; algorithm: 'fixed_window'; limit: number; windowMs: number }
  | { id: string; algorithm: 'sliding_window'; limit: number; windowMs: number }
  | { id: string; algorithm: 'token_bucket'; capacity: number; refillPerSecond: number }
  | { id: string; algorithm: 'leaky_bucket'; capacity: number; leakPerSecond: number };

export const policies: Record<string, Policy> = {
  'login-attempts': { id: 'login-attempts', algorithm: 'fixed_window', limit: 5, windowMs: 60_000 },
  'api-burst': { id: 'api-burst', algorithm: 'token_bucket', capacity: 20, refillPerSecond: 2 },
  'signup': { id: 'signup', algorithm: 'sliding_window', limit: 5, windowMs: 3_600_000 },
  'expensive-report': { id: 'expensive-report', algorithm: 'leaky_bucket', capacity: 3, leakPerSecond: 0.2 },
};

export function getPolicy(id: string): Policy | undefined {
  return policies[id];
}
