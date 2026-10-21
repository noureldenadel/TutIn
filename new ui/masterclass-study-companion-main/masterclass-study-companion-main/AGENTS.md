<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture

- Keep the reusable TutIn navigation rail and workspace chrome in `src/components/app-shell.tsx`; the home route only supplies page metadata and mounts it, keeping the shell ready for future route extraction.
- Use the shared 16/12/8/6/4px radius hierarchy across workspace, cards, controls, inner controls, and tags; reserve circles for avatars, status indicators, check controls, and media play controls so the product reads as a precise desktop tool.
