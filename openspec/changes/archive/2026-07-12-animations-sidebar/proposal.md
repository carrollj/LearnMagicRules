## Why

The sidebar currently changes state by snapping between expanded and collapsed layouts, which makes the navigation feel abrupt. Adding motion to the expand/collapse interaction will make the rules browser feel more polished and make the layout shift easier to follow.

## What Changes

- Animate the sidebar width and related layout properties when the sidebar expands or collapses.
- Add subtle entrance and exit motion for sidebar content so the panel does not disappear or reappear abruptly.
- Preserve the existing collapse state behavior, including desktop persistence and the mobile default-collapsed behavior.
- Respect reduced-motion preferences so the experience stays accessible.

## Capabilities

### New Capabilities
- `sidebar-collapse-animations`: Motion and transition behavior for expanding and collapsing the navigation sidebar.

### Modified Capabilities

## Impact

- `rules-site/assets/app.css`: add the sidebar transition and animation rules.
- `rules-site/assets/app.js`: only if a small state hook is needed to coordinate animation timing with the existing collapse toggle.
- Generated output from `parse_comprehensive_rules.py` if the site assets are regenerated from source templates.