/*
 * Type-level assertion helpers for the `__types__` suite. IsEqual uses
 * conditional-type invariance; the bidirectional-extends form false-positives
 * on `any` and on unflattened intersections.
 */

// Only `true` is accepted.
export type Assert<T extends true> = T;

// Strict identity via conditional-type invariance. Separates `any` from
// concrete types and unflattened intersections from their flattened form.
export type IsEqual<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;

// One-way assignability (non-distributive by usage convention).
export type Extends<Left, Right> = Left extends Right ? true : false;
