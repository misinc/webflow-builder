# Codex Notes

- When rebuilding the Webflow Designer extension, always run exactly:
  1. `npm run build`
  2. `webflow extension bundle`
- `npm run build:extension` alone is not enough for a final uploadable `bundle.zip`.
- After rebuilding the extension, provide Webflow version text that is 500 characters or fewer.
- If only backend/cloud code changed, state clearly whether `bundle.zip` was not regenerated.
