/**
 * Reviewed alias registry for benchmark-to-registry matching.
 *
 * An entry maps one or more external source identifiers (Hugging Face model
 * IDs, LiveCodeBench display names, legacy provider IDs) to exactly one
 * registry model. Aliases are only added after both sides have been inspected;
 * a guessed mapping would silently attach another model's benchmark score.
 *
 * The registry is intentionally empty for the 2026-10-24 catalog: none of the
 * 25 GPQA Diamond rows or 28 LiveCodeBench models corresponds to a registry
 * model in the verified environment. The matching service accepts an injected
 * registry, so reviewed mappings can be added without changing its logic.
 */

/** A reviewed mapping from external benchmark identifiers to one model. */
export interface ModelAlias {
  /** Provider that owns the target model, e.g. `opencode`. */
  readonly providerId: string;
  /** Target model identifier inside that provider (registry `modelID`). */
  readonly canonicalModelId: string;
  /** External identifiers that resolve to the target. */
  readonly aliases: readonly string[];
  /** Why this mapping is safe; required for review. */
  readonly reason: string;
}

/** Active reviewed aliases. Empty until a mapping is verified. */
export const k_modelAliases: readonly ModelAlias[] = [];
