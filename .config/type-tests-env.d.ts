/*
 * The type-test project runs with `"types": []` on purpose, so the public API
 * is checked without any ambient Node or DOM declarations. Source files still
 * reach for the literal `process.env.NODE_ENV` that bundlers replace when they
 * strip the debug paths, so declare just that much here.
 *
 * Excluded from the main tsconfig, where `@types/node` already declares it.
 */
declare const process: {env: Record<string, string | undefined>};
