# UI component reuse

A design token is a named value for a color, spacing, typography, or another shared visual property.
Use this reference for UI work, before the mockup or implementation.

1. Read the profile's UI reuse references. Inspect the relevant component API, design tokens, and one current usage.
   If references are missing or stale, search the affected UI area and nearby screens. Do not scan the whole catalog.
2. If the task has a plan, use that plan for the reuse record.
   Record a short reuse decision: component and token source paths, chosen variant, relevant states, and checks.
   A trivial UI text change needs no new plan or mockup; put any relevant reuse note in its PR.
   State when no suitable shared component exists. For a bug, keep the bug route; this adds no design approval gate.
3. Use existing components, variants, and tokens before adding new ones. Confirm their APIs in source, not only in a catalog.
   Keep task-specific or data-driven values local when no shared design value fits.
   Add a shared variant or component only when the task needs it. Preserve existing consumers and default behavior.
   Avoid a new wrapper for one use, a speculative library, a new UI dependency, or an unrelated migration.
4. Cover the states the task affects, such as loading, disabled, error, and empty.
   Preserve accessibility, keyboard or touch behavior, themes, and text scaling where the project supports them.
   Use the profile's checks and the required test tier. Record any check that could not run; a mockup is not test evidence.

When a shared API or design token changes, check its affected consumers and update its existing examples or reference in the same PR.
If no reference exists, document a new shared API beside the component using the project's conventions.
Do not require a catalog tool or a full design system for a local change.
