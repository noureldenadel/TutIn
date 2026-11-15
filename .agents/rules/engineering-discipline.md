---
trigger: always_on
---

## Engineering discipline: solve the actual problem

### Core principle
- Solve the actual problem, not a larger problem you imagined.
- Prefer the simplest solution that fully satisfies the requirements.
- Simple does not mean incomplete, fragile, or inflexible. Preserve correctness, maintainability, accessibility, and necessary edge cases.
- Complexity must earn its place. Every abstraction, dependency, component, configuration option, and layer of indirection must solve a real problem.

### Scope control
- Identify the requested outcome before choosing an implementation.
- Stay within the requested scope. Don't redesign, refactor, rename, or restructure unrelated parts of the project.
- Don't turn a small change into a system-wide improvement project.
- Don't add features, settings, customization options, or fallback mechanisms that weren't requested and aren't necessary.
- If a broader change is genuinely required, explain why before expanding the scope.
- Preserve existing behavior unless changing it is part of the task.

### Avoid overengineering
- Prefer straightforward code over clever code.
- Don't introduce abstractions, factories, custom hooks, utility layers, design patterns, or generic frameworks without a concrete need.
- Don't create a reusable solution for a hypothetical future requirement.
- Don't introduce new dependencies when existing project capabilities are sufficient.
- Don't add state management, caching, validation layers, error handling, or configuration for scenarios the application doesn't need.
- Don't duplicate existing functionality. Reuse established project patterns where appropriate.
- Don't compress code excessively or sacrifice readability in the name of fewer lines.

### Avoid underengineering
- Don't remove necessary validation, error handling, accessibility, type safety, or edge-case handling just to make the implementation shorter.
- Don't use `any`, suppress TypeScript errors, disable lint rules, or bypass checks to force a passing result.
- Don't use hardcoded values where the existing requirements genuinely call for dynamic behavior.
- Don't ignore loading, empty, error, and success states when they are relevant to the feature.
- Don't replace a robust existing implementation with a simpler but less reliable workaround.
- Don't claim something works without verifying it to a reasonable degree.

### Investigate before implementing
- Inspect the relevant files, existing components, dependencies, and project conventions before making changes.
- Trace the existing behavior and identify the actual cause of a bug before patching it.
- Prefer fixing the root cause over adding a workaround.
- Don't assume a feature needs a new architecture when the current one can support it.
- Ask questions only when a missing requirement materially affects the implementation. Otherwise, make a reasonable assumption and proceed.
- Never invent project structure, APIs, dependencies, or existing functionality.

### Implementation discipline
- Make the smallest coherent set of changes that fully solves the problem.
- Keep changes focused, consistent with the existing architecture, and easy to review.
- Don't refactor unrelated code while implementing a feature or fixing a bug.
- Don't add comments that merely repeat what the code does. Explain intent or non-obvious decisions when useful.
- Don't add speculative defensive code for impossible or irrelevant scenarios.
- Don't leave dead code, unused imports, temporary debugging output, or unnecessary files behind.

### Verification and completion
- Verify the actual outcome, not merely whether the code was written.
- Run the most relevant available checks, such as TypeScript, linting, tests, or a production build, according to the scope of the change.
- Fix errors introduced by the implementation. Don't conceal failures or weaken checks to make them pass.
- If a check fails for an unrelated pre-existing reason, distinguish it from regressions caused by the change.
- Don't claim to have tested, verified, or completed anything that you haven't actually checked.
- Report important limitations or unresolved issues honestly.

### Decision rule
Before adding complexity, ask:
1. Is it required by the current requirements?
2. Does it prevent a realistic failure or solve a demonstrated problem?
3. Can the existing architecture handle it without another abstraction or dependency?
4. Will the added complexity provide enough value to justify its maintenance cost?

If the complexity isn't justified, don't add it.

### Completion standard
Deliver the simplest complete, correct, maintainable solution for the requested scope. Be thorough in reasoning, selective in implementation, and honest about verification. Optimize for solving the problem, not maximizing code volume or minimizing effort.