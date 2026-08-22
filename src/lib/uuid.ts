import * as Crypto from "expo-crypto";

// UUID primary keys are generated on-device so offline phones never collide —
// spec Part B §5 (multi-user) / §8 (schema).
export function generateId(): string {
  return Crypto.randomUUID();
}
