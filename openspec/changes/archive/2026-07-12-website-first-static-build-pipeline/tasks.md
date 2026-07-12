## 1. Website-First Structure

- [x] 1.1 Define and create the canonical website source directory structure for bundled frontend development
- [x] 1.2 Move existing site shell assets into the website source tree and remove parser assumptions about template ownership
- [x] 1.3 Add/adjust ignore rules so generated content/build artifacts are not committed

## 2. Parser Output Contract Changes

- [x] 2.1 Refactor parser output paths to emit content bundles into a build workspace input for the web build
- [x] 2.2 Remove parser behavior that copies or generates website shell assets
- [x] 2.3 Preserve existing data contract fields and route/anchor compatibility for website consumers

## 3. Bundler and SCSS Pipeline

- [x] 3.1 Introduce bundler configuration with SCSS compilation support for the website source tree
- [x] 3.2 Configure bundler output to produce a static deploy artifact directory
- [x] 3.3 Wire generated parser content bundles into the website build output at the expected runtime paths

## 4. Script Contract and Developer Workflow

- [x] 4.1 Reduce public scripts to `build` and `dev`
- [x] 4.2 Implement `build` to run full parse followed by production web bundle generation
- [x] 4.3 Implement `dev` precondition checks that fail fast with clear guidance when build artifacts are missing

## 5. CI/CD and Verification

- [x] 5.1 Update GitHub Actions workflow to run `build` and deploy static output from the bundler artifact directory
- [x] 5.2 Update or add tests/checks for parser output contract, deterministic generation, and dev/build path assumptions
- [x] 5.3 Validate hash routing, static asset loading, and generated data loading in the deployed GitHub Pages artifact
