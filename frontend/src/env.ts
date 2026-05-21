import { z } from "zod";

/**
 * Build-time validation of the Vite-injected environment.
 *
 * This is the **frontend half** of the config-and-secrets layering
 * described in the README:
 *
 *   - Vite inlines anything matching `VITE_*` (and a few built-in
 *     fields like MODE / DEV / PROD) into the bundle at build time.
 *   - Anything not prefixed with `VITE_` is intentionally NOT
 *     accessible from the client. Secrets stay on the backend.
 *
 * Parsing through a zod schema means a missing or mistyped VITE_*
 * value blows up the build with a clear error, rather than landing
 * in production as `undefined` and surfacing as a silent NaN somewhere.
 *
 * To add a new VITE_-prefixed setting:
 *   1. Document it in `.env.example` (frontend section).
 *   2. Add a `VITE_FOO: z.string()` (or whatever shape) here.
 *   3. Import `env.FOO` from this module — never read
 *      `import.meta.env.VITE_FOO` directly elsewhere.
 */
const schema = z.object({
  MODE: z.enum(["development", "test", "production"]),
  DEV: z.boolean(),
  PROD: z.boolean(),
  // No VITE_*-prefixed knobs today; the API is reached via the same
  // origin as the SPA (nginx proxies /api/* in compose, Vite proxies
  // in dev). Add them above if/when the deployment needs a runtime
  // override.
});

const parsed = schema.safeParse(import.meta.env);
if (!parsed.success) {
  // Throw at module-load time so the dev server (or production
  // bundle) fails loudly instead of carrying around an undefined
  // value that breaks downstream.
  throw new Error(
    "Frontend env validation failed: " + JSON.stringify(parsed.error.format()),
  );
}

export const env = parsed.data;
