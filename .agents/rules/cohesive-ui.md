---
trigger: always_on
---

## Living UI/UX system: consistency across TutIn

### Core principle
- Treat `docs\UI_UX_SYSTEM.md` as the persistent source of truth for the app's UI/UX direction.
- The design system must evolve with the product. It is neither a frozen specification nor a collection of disposable suggestions.
- Build on established decisions instead of reinventing the interface in every task or conversation.
- Preserve consistency without preventing intentional improvements. Evolve the system when there is a good reason, not merely because another approach is possible.

### Before every UI/UX task
1. Read `docs\UI_UX_SYSTEM.md` before proposing or implementing UI changes.
2. Inspect the relevant screens, existing shared components, styles, design tokens, and nearby features.
3. Understand the app's current visual language, interaction patterns, information hierarchy, and product goals before making design decisions.
4. Reuse existing components, conventions, and patterns whenever they satisfy the requirements.
5. Check whether the requested change conflicts with an established design decision. Resolve the conflict deliberately rather than silently introducing inconsistency.
6. Keep the task focused. Do not redesign unrelated screens or introduce a new visual direction without a reason.

### Learn from the application
- Study the actual implementation, not just the written guidelines.
- Use existing screens and components to understand spacing, typography, color relationships, density, hierarchy, layout, interactions, and responsive behavior.
- Identify patterns shared by successful screens. Prefer those patterns over inventing new ones.
- Distinguish intentional design decisions from accidental inconsistencies, unfinished UI, bugs, and legacy code.
- Do not treat every existing implementation as correct simply because it exists.
- When useful tools are available, inspect the rendered UI at relevant viewport sizes rather than judging the implementation from code alone.

### Preserve and reuse the design system
- Prefer existing design tokens over arbitrary colors, spacing values, typography, radii, shadows, and other visual properties.
- Prefer existing components and established composition patterns over duplicate implementations.
- Before creating a new component or pattern, check whether an existing one can be reused or reasonably extended.
- Keep shared behavior and styling consistent across screens unless the difference has a clear functional or contextual purpose.
- Do not introduce new fonts, color palettes, icon styles, interaction conventions, or component variants merely for novelty.
- Avoid both overgeneralization and duplication. Abstract a pattern when reuse and consistency justify it, not simply because two elements look vaguely similar.

### Evolve the system intentionally
- Treat every UI/UX task as an opportunity to evaluate and improve the system, not as permission to change it.
- When a task establishes, improves, or changes a reusable design principle, update `docs\UI_UX_SYSTEM.md` to reflect the new decision.
- If a change intentionally departs from an existing rule, evaluate whether the rule should evolve. Do not automatically change the system to justify an implementation that may be inconsistent or incorrect.
- Do not create permanent rules from guesses, one-off exceptions, temporary experiments, or accidental implementation details.
- Distinguish established conventions from emerging patterns that still need validation.
- When there is genuine uncertainty, prefer existing conventions and make the smallest reasonable decision. Ask for input only when the uncertainty materially affects product direction or user experience.

### Maintain the documentation
- Revisit `docs\UI_UX_SYSTEM.md` after every UI/UX task, including visual refinements and interaction changes.
- Update the relevant section when a decision, reusable pattern, token, component, or convention has changed or become clearer.
- Keep the guide concise, actionable, and representative of the current intended product direction.
- Edit the relevant section rather than repeatedly appending duplicate or conflicting rules.
- Record meaningful changes and their rationale in a concise decision history when useful.
- Do not add documentation for every temporary adjustment, implementation detail, or isolated exception. If a task does not change the system, leave the guidelines unchanged rather than inventing new rules.
- Keep the documentation aligned with the actual implementation. If code and documentation disagree, determine whether the code is outdated, the documentation is outdated, or a deliberate change has occurred. Resolve the discrepancy instead of allowing it to persist.

### After every UI/UX task
1. Check the finished result against the current UI/UX system and relevant existing screens.
2. Verify that the requested change works and that affected states and viewport sizes remain appropriate.
3. Check for unintended visual drift, duplicate patterns, inconsistent tokens, and unnecessary UI elements.
4. Reconcile `docs\UI_UX_SYSTEM.md` with any intentional system changes.
5. Confirm that the work is complete, identify relevant verification performed, and mention meaningful design-system updates or unresolved issues.

### Decision hierarchy
When making UI/UX decisions, prioritize:
1. Explicit requirements and decisions from the user in the current task.
2. The established product direction documented in `docs\UI_UX_SYSTEM.md`.
3. Existing, consistent implementation patterns that are not contradicted by the above.
4. New design proposals, only when the existing system does not adequately solve the problem.

If a new request intentionally changes the established direction, follow the request and update the system accordingly.

### Definition of success
Every new screen or UI change should feel like a deliberate part of the same product. The app should become more coherent and mature over time, while the implementation stays focused, the guidelines remain trustworthy, and previously established decisions do not need to be rediscovered in every conversation.