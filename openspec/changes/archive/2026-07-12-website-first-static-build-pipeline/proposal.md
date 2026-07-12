## Why

The repository currently treats the parser pipeline as the primary product surface, even though the website is the product and parser output is supporting content. This causes confusing ownership boundaries, awkward folder layout, and a build/deploy flow that feels inverted.

## What Changes

- Reframe the repository as website-first: website source code becomes the primary application surface, and parser code becomes a supporting content-generation tool.
- Add a bundler-based web build with SCSS support while preserving a static-only deployment target for GitHub Pages.
- Change parser responsibilities so it generates content bundles only and no longer owns or copies website shell assets.
- Make generated content CI-driven and non-committed; build artifacts are produced during CI build/deploy.
- Establish a minimal public script contract of `build` and `dev` only.
- Define `dev` behavior to depend on previously generated artifacts from `build`, with clear failure messaging when artifacts are missing.

## Capabilities

### New Capabilities
- `website-build-pipeline`: Define a website-first build and deploy contract using bundling + SCSS with static-only output for GitHub Pages.

### Modified Capabilities
- `parser`: Update parser requirements so parser output is content-focused and integrated as build input, not as owner of website shell/deploy structure.

## Impact

- Affected code: website source tree, parser output paths, build scripts, and GitHub Actions workflow.
- Affected contracts: generated content location and website consumption of generated bundles.
- Dependencies: add and configure a bundler with SCSS compilation support.
- Deployment: GitHub Pages publish path changes to bundler output (`dist`) generated in CI.
