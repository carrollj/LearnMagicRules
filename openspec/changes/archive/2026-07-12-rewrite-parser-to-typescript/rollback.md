# Rollback Procedure

If the TypeScript parser cutover introduces critical regressions, revert to the prior Python pipeline in one rollback commit.

## Trigger Conditions

- Broken routes/anchors in generated site content.
- Missing required output files under `rules-site/data`.
- CI generation/deploy failures caused by TypeScript parser changes.

## One-Step Rollback

1. Restore `.github/workflows/deploy-pages.yml` to the Python build step (`python ./parse_comprehensive_rules.py`).
2. Revert TypeScript parser entrypoint usage in build scripts if needed.
3. Re-run workflow to regenerate and deploy from Python outputs.

## Verification After Rollback

- Confirm workflow build and deploy jobs pass.
- Confirm `rules-site/data/navigation.json`, `search-index.json`, and `tooltip-previews.json` are present.
- Confirm site navigation and tooltip previews function for representative rules and glossary entries.
