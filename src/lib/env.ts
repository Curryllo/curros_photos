import "server-only";
import { z } from "zod";

// .env files often contain `KEY=` for unset values — treat "" as absent.
const optionalString = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.string().min(1).optional(),
);

const EnvSchema = z.object({
  IG_ACCESS_TOKEN: optionalString,
  IG_APP_SECRET: optionalString,
  CRON_SECRET: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().min(8).optional(),
  ),
  TOKEN_ENCRYPTION_KEY: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse({
    IG_ACCESS_TOKEN: process.env.IG_ACCESS_TOKEN,
    IG_APP_SECRET: process.env.IG_APP_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: clear the memoized env so stubbed process.env takes effect. */
export function resetEnvCache(): void {
  cached = null;
}
