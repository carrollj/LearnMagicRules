## Context

The rules browser already tracks sidebar collapse state in JavaScript and applies a `sidebar-collapsed` class to the app shell. Today the sidebar width and content visibility change immediately, so the interaction feels abrupt even though the state logic is already in place.

This change is limited to the generated site UI and its shared CSS. It does not change navigation data, rules parsing, or the underlying sidebar state model.

## Goals / Non-Goals

**Goals:**
- Animate the sidebar expanding and collapsing so the layout change reads as motion instead of a snap.
- Animate sidebar content out and back in without breaking the existing collapse state behavior.
- Preserve desktop persistence and the current mobile default-collapsed behavior.
- Respect reduced-motion preferences.

**Non-Goals:**
- Redesign the sidebar layout or navigation structure.
- Change how sidebar state is saved or restored.
- Introduce a new animation library or runtime dependency.

## Decisions

1. Use CSS transitions on the existing sidebar width and related layout properties.
   - This keeps the change lightweight and preserves the current JavaScript state model.
   - Width and padding changes are enough to make the shell feel animated without adding coordination logic in JS.
   - Alternative considered: animate the sidebar with transforms only. Rejected because the main workspace should respond to the sidebar width change instead of overlapping it.

2. Replace the collapsed sidebar content hard-hide with transition-friendly visibility.
   - The current implementation uses `display: none` for collapsed content, which prevents any exit animation.
   - The design should use opacity and transform transitions, with visibility or pointer-event gating as needed so the content can animate out before becoming inert.
   - Alternative considered: keep `display: none` and add a wrapper animation via JS timing. Rejected because it adds brittle timing logic to code that is otherwise purely state-driven.

3. Keep the animation behavior in CSS instead of adding new JS state hooks.
   - The existing collapse toggle already provides the right state boundary.
   - CSS can handle the motion directly on class changes, which minimizes implementation risk and avoids coupling animation timing to script execution.
   - Alternative considered: add a short-lived "animating" class from JS. Rejected unless CSS-only coordination proves insufficient.

4. Honor reduced-motion preferences with a media query override.
   - This avoids forcing motion on users who have requested less animation.
   - The reduced-motion path should preserve the same visible state changes without pronounced movement.

## Risks / Trade-offs

- [Layout reflow cost] Animating width and related layout properties can cause reflow on a large viewport. → Keep the transition short and limit animated properties to the sidebar shell.
- [Content flicker during collapse] If opacity and visibility timing are misaligned, the sidebar contents may briefly flash. → Use a single coordinated transition set and verify both collapse directions.
- [Mobile drawer interaction] The mobile sidebar is already position-fixed and uses a different open/close model. → Scope the motion rules so they do not interfere with the drawer behavior.

## Migration Plan

1. Update the shared CSS for the sidebar shell and content transitions.
2. Verify collapse and expand motion on desktop and the existing mobile drawer path.
3. Confirm reduced-motion behavior removes or minimizes the transitions.
4. If the CSS-only approach produces timing issues, add a narrow JS state hook as a fallback and keep the interaction contract unchanged.

## Open Questions

- Should the collapsed sidebar content fully fade out, or should some controls remain visible in a compact rail state?
- Do we need a slightly different motion curve for desktop versus mobile drawer interactions, or is one transition sufficient?