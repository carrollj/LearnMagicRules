import tooltipStyleText from './styles/tooltipStyle.scss?inline';

const sidebar = document.getElementById('sidebar');
const appShell = document.getElementById('app-shell');
const sidebarContent = document.getElementById('sidebar-content');
const mainView = document.getElementById('main-view');
const modeButtons = Array.from(document.querySelectorAll('[data-mode-button]'));
const themeToggle = document.getElementById('theme-toggle');
const drawerToggle = document.getElementById('drawer-toggle');
const sidebarCollapseToggle = document.getElementById('sidebar-collapse-toggle');
const effectiveDate = document.getElementById('effective-date');
const tooltipRoot = document.getElementById('tooltip-root');

const contentCache = new Map();
const previewCache = new Map();

const app = {
  navigation: null,
  searchIndex: null,
  previews: null,
  cheatSheet: null,
  mode: 'rules',
  route: { type: 'index' },
  searchQuery: '',
  sidebarFilter: '',
  tooltips: [],
};

const MOBILE_BREAKPOINT = 900;
const TOOLTIP_VIEWPORT_PADDING = 16;
const TOOLTIP_OFFSET_PX = 8;
const TOOLTIP_HALO_PADDING_X_PX = 6;
const TOOLTIP_HALO_PADDING_Y_PX = 16;
const THEME_STORAGE_KEY = 'rules-browser-theme';
const SIDEBAR_COLLAPSE_STORAGE_KEY = 'rules-browser-sidebar-collapsed';
const CHEAT_SHEET_STORAGE_KEY = 'cheat-sheet';
const CHEAT_SHEET_MAX_RESULTS = parseInt(import.meta.env.VITE_CHEAT_SHEET_MAX_RESULTS ?? '10', 10);
const CHEAT_SHEET_SEARCH_DEBOUNCE_MS = parseInt(import.meta.env.VITE_CHEAT_SHEET_SEARCH_DEBOUNCE_MS ?? '300', 10);

let desktopSidebarCollapsed = false;
let tooltipIdCounter = 0;
let sharedTooltipStyleSheet = null;
let panelDragState = null;

function applyTooltipStyles(shadowRoot) {
  if (!sharedTooltipStyleSheet && 'adoptedStyleSheets' in Document.prototype && 'replaceSync' in CSSStyleSheet.prototype) {
    try {
      const stylesheet = new CSSStyleSheet();
      stylesheet.replaceSync(tooltipStyleText);
      sharedTooltipStyleSheet = stylesheet;
    } catch {
      sharedTooltipStyleSheet = null;
    }
  }
  if (sharedTooltipStyleSheet) {
    const canAdoptOnShadowRoot = 'adoptedStyleSheets' in ShadowRoot.prototype;
    if (canAdoptOnShadowRoot) {
      try {
        shadowRoot.adoptedStyleSheets = [sharedTooltipStyleSheet];
        return;
      } catch {
        sharedTooltipStyleSheet = null;
      }
    }
  }
  if (!tooltipStyleText) {
    return;
  }
  const fallbackStyle = document.createElement('style');
  fallbackStyle.textContent = tooltipStyleText;
  shadowRoot.prepend(fallbackStyle);
}

class RuleTooltipElement extends HTMLElement {
  constructor() {
    super();
    this.tooltipId = null;
    this.pageId = null;
    this.tooltipAnchor = null;
    this.samePage = false;
    this.paneName = 'primary';
    this.hasOpenChild = false;
    this.haloElement = null;
    this.panelElement = null;
    this.previewBodyElement = null;
    this.openButtonElement = null;
    this.closeButtonElement = null;
  }

  ensureShadowDom() {
    if (this.shadowRoot) {
      return;
    }
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <div class="tooltip-halo" data-tooltip-halo>
        <div class="tooltip-panel" role="dialog" aria-modal="false">
          <button type="button" class="tooltip-close-button" data-preview-close aria-label="Close preview" title="Close preview">x</button>
          <div data-preview-body></div>
          <div class="tooltip-actions">
            <button type="button" class="inline-icon-link" data-preview-open>Open ↗</button>
          </div>
        </div>
      </div>
    `;
    applyTooltipStyles(shadow);

    this.haloElement = shadow.querySelector('[data-tooltip-halo]');
    this.panelElement = shadow.querySelector('.tooltip-panel');
    this.previewBodyElement = shadow.querySelector('[data-preview-body]');
    this.openButtonElement = shadow.querySelector('[data-preview-open]');
    this.closeButtonElement = shadow.querySelector('[data-preview-close]');
  }

  connectedCallback() {
    this.ensureShadowDom();
    this.previewBodyElement?.addEventListener('pointerover', this.handlePreviewPointerOver);
    this.previewBodyElement?.addEventListener('click', this.handlePreviewClick);
    this.openButtonElement?.addEventListener('click', this.handleOpenButtonClick);
    this.closeButtonElement?.addEventListener('click', this.handleCloseButtonClick);
  }

  disconnectedCallback() {
    this.previewBodyElement?.removeEventListener('pointerover', this.handlePreviewPointerOver);
    this.previewBodyElement?.removeEventListener('click', this.handlePreviewClick);
    this.openButtonElement?.removeEventListener('click', this.handleOpenButtonClick);
    this.closeButtonElement?.removeEventListener('click', this.handleCloseButtonClick);
  }

  initialize(config) {
    this.ensureShadowDom();
    this.tooltipId = config.tooltipId;
    this.pageId = config.pageId;
    this.tooltipAnchor = config.anchor || null;
    this.samePage = Boolean(config.samePage);
    this.paneName = config.paneName || 'primary';
    this.hasOpenChild = false;
    this.previewBodyElement.innerHTML = config.previewHtml;
  }

  setHasOpenChild(isOpen) {
    this.hasOpenChild = Boolean(isOpen);
  }

  getPanelRect() {
    return this.panelElement?.getBoundingClientRect() || null;
  }

  handlePreviewPointerOver = event => {
    if (isMobileViewport()) {
      return;
    }
    const link = event.target.closest('.rule-link');
    if (!link) {
      return;
    }
    this.dispatchOpenRequest(link);
  };

  handlePreviewClick = event => {
    const link = event.target.closest('.rule-link');
    if (!link) {
      return;
    }
    event.preventDefault();
    this.dispatchOpenRequest(link);
  };

  handleOpenButtonClick = () => {
    this.dispatchEvent(new CustomEvent('rule-tooltip-navigate-request', {
      bubbles: true,
      composed: true,
      detail: {
        tooltipId: this.tooltipId,
        pageId: this.pageId,
        anchor: this.tooltipAnchor,
        samePage: this.samePage,
        paneName: this.paneName,
      },
    }));
  };

  handleCloseButtonClick = () => {
    this.dispatchEvent(new CustomEvent('rule-tooltip-close-request', {
      bubbles: true,
      composed: true,
      detail: { tooltipId: this.tooltipId },
    }));
  };

  dispatchOpenRequest(link) {
    const linkType = link.dataset.linkType;
    const pageId = link.dataset.pageId;
    if (!linkType || !pageId) {
      return;
    }
    const triggerRect = link.getBoundingClientRect();
    this.dispatchEvent(new CustomEvent('rule-tooltip-open-request', {
      bubbles: true,
      composed: true,
      detail: {
        parentTooltipId: this.tooltipId,
        linkType,
        pageId,
        anchor: link.dataset.anchor || null,
        paneName: this.paneName,
        triggerRect: {
          top: triggerRect.top,
          right: triggerRect.right,
          bottom: triggerRect.bottom,
          left: triggerRect.left,
          width: triggerRect.width,
          height: triggerRect.height,
        },
      },
    }));
  }
}

if (!customElements.get('rule-tooltip')) {
  customElements.define('rule-tooltip', RuleTooltipElement);
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeToggle(theme) {
  if (!themeToggle) {
    return;
  }
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  themeToggle.setAttribute('aria-label', `Set ${nextTheme} mode`);
  themeToggle.setAttribute('title', `Set ${nextTheme} mode`);
}

function applyTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  updateThemeToggle(theme);
  if (!persist) {
    return;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private mode or blocked storage).
  }
}

function initializeTheme() {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    savedTheme = null;
  }

  const initialTheme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : getSystemTheme();
  applyTheme(initialTheme, savedTheme !== null);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', event => {
    let hasSavedTheme = false;
    try {
      hasSavedTheme = Boolean(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      hasSavedTheme = false;
    }
    if (!hasSavedTheme) {
      applyTheme(event.matches ? 'dark' : 'light', false);
    }
  });
}

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function isReaderRoute(route = app.route) {
  return route.type === 'rules' || route.type === 'glossary';
}

function defaultReaderState() {
  return {
    primary: null,
    secondary: null,
    scroll: { primary: 0, secondary: 0 },
  };
}

function cloneReaderState(readerState) {
  return {
    primary: readerState?.primary ? { ...readerState.primary } : null,
    secondary: readerState?.secondary ? { ...readerState.secondary } : null,
    scroll: {
      primary: readerState?.scroll?.primary ?? 0,
      secondary: readerState?.scroll?.secondary ?? 0,
    },
  };
}

function parseHashValue(hashValue) {
  const hash = hashValue.replace(/^#/, '');
  if (!hash || hash === 'index') {
    return { type: 'index' };
  }
  if (hash === 'search') {
    return { type: 'search' };
  }

  const segments = hash.split('/');
  if (segments[0] === 'rules' && segments[1]) {
    return {
      type: 'rules',
      pageSlug: segments[1],
      pageId: `rules/${segments[1]}`,
      anchor: segments[2] || null,
    };
  }
  if (segments[0] === 'glossary' && segments[1]) {
    return {
      type: 'glossary',
      pageSlug: segments[1],
      pageId: `glossary/${segments[1]}`,
      anchor: null,
    };
  }
  return { type: 'index' };
}

function parseHash() {
  return parseHashValue(window.location.hash);
}

function routeForDestination(destination) {
  if (!destination) {
    return '#index';
  }
  if (destination.pageId.startsWith('rules/')) {
    return destination.anchor ? `#${destination.pageId}/${destination.anchor}` : `#${destination.pageId}`;
  }
  return `#${destination.pageId}`;
}

function normalizeDestination(route) {
  if (route.type === 'rules' || route.type === 'glossary') {
    return {
      type: route.type,
      pageId: route.pageId,
      pageSlug: route.pageSlug,
      anchor: route.anchor || null,
    };
  }
  return null;
}

function setMode(mode) {
  app.mode = mode;
  for (const button of modeButtons) {
    const isActive = button.dataset.modeButton === mode;
    button.classList.toggle('mode-button--active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  }
  renderSidebar();
}

function inferModeFromDestination(destination) {
  return 'rules';
}

function markSidebarOpen(isOpen) {
  sidebar.classList.toggle('sidebar--open', isOpen);
  drawerToggle.setAttribute('aria-expanded', String(isOpen));
}

function sidebarCollapseIconMarkup(isCollapsed) {
  const actionGlyph = isCollapsed
    ? '<path d="M14 12h6"></path><path d="M17 9v6"></path>'
    : '<path d="M14 12h6"></path>';
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="2"></rect>
      <path d="M9 4v16"></path>
      ${actionGlyph}
    </svg>
  `;
}

function updateSidebarCollapseToggle(isCollapsed) {
  if (!sidebarCollapseToggle) {
    return;
  }
  sidebarCollapseToggle.setAttribute('aria-pressed', String(isCollapsed));
  const actionText = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  sidebarCollapseToggle.innerHTML = sidebarCollapseIconMarkup(isCollapsed);
  sidebarCollapseToggle.setAttribute('aria-label', actionText);
  sidebarCollapseToggle.setAttribute('title', actionText);
}

function setSidebarCollapsed(isCollapsed, persist = true) {
  desktopSidebarCollapsed = Boolean(isCollapsed);
  appShell.classList.toggle('sidebar-collapsed', desktopSidebarCollapsed);
  updateSidebarCollapseToggle(desktopSidebarCollapsed);
  if (!persist) {
    return;
  }
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, desktopSidebarCollapsed ? 'true' : 'false');
  } catch {
    // Ignore storage failures (private mode or blocked storage).
  }
}

function initializeSidebarCollapse() {
  let saved = null;
  try {
    saved = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
  } catch {
    saved = null;
  }
  const initialCollapsed = isMobileViewport() ? true : saved === 'true';
  setSidebarCollapsed(initialCollapsed, false);
}

function closeSidebarIfMobile() {
  if (isMobileViewport()) {
    markSidebarOpen(false);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function snippetForText(text, query) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return '';
  }
  if (!query) {
    return normalizedText.slice(0, 180);
  }
  const normalizedQuery = query.trim().toLowerCase();
  const lowerText = normalizedText.toLowerCase();
  const index = lowerText.indexOf(normalizedQuery);
  if (index === -1) {
    return normalizedText.slice(0, 180);
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(normalizedText.length, index + normalizedQuery.length + 90);
  let snippet = normalizedText.slice(start, end);
  if (start > 0) {
    snippet = `…${snippet}`;
  }
  if (end < normalizedText.length) {
    snippet = `${snippet}…`;
  }
  const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escapeHtml(snippet).replace(new RegExp(escapedQuery, 'ig'), match => `<mark class="search-highlight">${match}</mark>`);
}

function scoreDocument(document, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }
  const title = document.title.toLowerCase();
  const subtitle = (document.subtitle || '').toLowerCase();
  const text = document.searchText.toLowerCase();

  let score = 0;
  if (title === normalizedQuery) {
    score += 120;
  }
  if (title.startsWith(normalizedQuery)) {
    score += 70;
  }
  if (title.includes(normalizedQuery)) {
    score += 45;
  }
  if (subtitle.includes(normalizedQuery)) {
    score += 20;
  }

  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  for (const term of queryTerms) {
    if (title.includes(term)) {
      score += 18;
    }
    if (subtitle.includes(term)) {
      score += 7;
    }
    const occurrences = text.split(term).length - 1;
    score += Math.min(occurrences, 6) * 4;
  }

  return score;
}

function runSearch(query) {
  if (!app.searchIndex) {
    return { rules: [], glossary: [] };
  }
  const documents = [
    ...app.searchIndex.documents.rules,
    ...app.searchIndex.documents.glossary,
  ];
  const scoredResults = documents
    .map(document => ({ document, score: scoreDocument(document, query) }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title));

  const grouped = { rules: [], glossary: [] };
  for (const entry of scoredResults) {
    const result = {
      ...entry.document,
      snippet: snippetForText(entry.document.text, query),
    };
    const groupKey = entry.document.type === 'rule' ? 'rules' : 'glossary';
    grouped[groupKey].push(result);
  }
  return grouped;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

async function loadContent(path) {
  if (!contentCache.has(path)) {
    contentCache.set(path, fetchJson(path));
  }
  return contentCache.get(path);
}

function readerStateFromRoute(route) {
  const destination = normalizeDestination(route);
  return {
    primary: destination,
    secondary: null,
    scroll: { primary: 0, secondary: 0 },
  };
}

function currentReaderState() {
  const state = history.state?.readerState;
  if (state) {
    return cloneReaderState(state);
  }
  return readerStateFromRoute(app.route);
}

function recordPaneScroll() {
  const state = currentReaderState();
  const primaryBody = document.querySelector('.reader-pane[data-pane="primary"] .reader-pane-body');
  const secondaryBody = document.querySelector('.reader-pane[data-pane="secondary"] .reader-pane-body');
  state.scroll.primary = primaryBody?.scrollTop ?? state.scroll.primary;
  state.scroll.secondary = secondaryBody?.scrollTop ?? state.scroll.secondary;
  history.replaceState({ readerState: state, searchQuery: app.searchQuery }, '', window.location.href);
}

function pushReaderState(route, readerState) {
  history.pushState({ readerState: cloneReaderState(readerState), searchQuery: app.searchQuery }, '', route);
  app.route = parseHash();
}

function replaceReaderState(route, readerState) {
  history.replaceState({ readerState: cloneReaderState(readerState), searchQuery: app.searchQuery }, '', route);
  app.route = parseHash();
}

function createReaderPaneMarkup(pane, contentBundle, title, paneRole, options = {}) {
  const readerActions = options.actions || '';
  return `
    <article class="reader-pane reader-pane--${paneRole}" data-pane="${paneRole}">
      <header class="reader-pane-header">
        <p class="reader-pane-title">${title}</p>
        <div class="reader-pane-actions">${readerActions}</div>
      </header>
      <div class="reader-pane-body">${contentBundle.html}</div>
    </article>
  `;
}

function pageTitleForDestination(destination, bundle) {
  if (destination.type === 'glossary') {
    return bundle.term;
  }
  return `${bundle.section.number}. ${bundle.section.title}`;
}

function readerLayoutClass(readerState) {
  return readerState.secondary && !isMobileViewport() ? 'reader-layout reader-layout--split' : 'reader-layout';
}

function activeRouteForDestination(destination) {
  return routeForDestination(destination);
}

function destinationForPageId(pageId, anchor = null) {
  if (pageId.startsWith('rules/')) {
    return {
      type: 'rules',
      pageId,
      pageSlug: pageId.slice('rules/'.length),
      anchor,
    };
  }
  return {
    type: 'glossary',
    pageId,
    pageSlug: pageId.slice('glossary/'.length),
    anchor: null,
  };
}

function getContentPath(destination) {
  if (destination.type === 'rules') {
    return `./data/content/rules/${destination.pageSlug}.json`;
  }
  const group = destination.pageSlug[0] || 'other';
  return `./data/content/glossary/${group}/${destination.pageSlug}.json`;
}

async function getBundleForDestination(destination) {
  return loadContent(getContentPath(destination));
}

function distanceToRect(pointX, pointY, rect) {
  const deltaX = pointX < rect.left ? rect.left - pointX : pointX > rect.right ? pointX - rect.right : 0;
  const deltaY = pointY < rect.top ? rect.top - pointY : pointY > rect.bottom ? pointY - rect.bottom : 0;
  return Math.hypot(deltaX, deltaY);
}

function isPointInsideRect(pointX, pointY, rect) {
  return pointX >= rect.left && pointX <= rect.right && pointY >= rect.top && pointY <= rect.bottom;
}

function createTooltipId() {
  tooltipIdCounter += 1;
  return `tooltip-${tooltipIdCounter}`;
}

function updateTooltipRootVisibility() {
  tooltipRoot.hidden = app.tooltips.length === 0;
}

function getTooltipById(tooltipId) {
  return app.tooltips.find(tooltip => tooltip.id === tooltipId) || null;
}

function hasTooltipChildren(tooltipId) {
  return app.tooltips.some(tooltip => tooltip.parentId === tooltipId);
}

function getTooltipDepth(tooltip) {
  let depth = 0;
  let parentId = tooltip.parentId;
  while (parentId) {
    const parentTooltip = getTooltipById(parentId);
    if (!parentTooltip) {
      break;
    }
    depth += 1;
    parentId = parentTooltip.parentId;
  }
  return depth;
}

function getTooltipSubtreeIds(rootTooltipId) {
  const subtreeIds = new Set([rootTooltipId]);
  let added = true;
  while (added) {
    added = false;
    for (const tooltip of app.tooltips) {
      if (!subtreeIds.has(tooltip.id) && tooltip.parentId && subtreeIds.has(tooltip.parentId)) {
        subtreeIds.add(tooltip.id);
        added = true;
      }
    }
  }
  return subtreeIds;
}

function closeTooltip(tooltipId = null) {
  if (tooltipId === null) {
    app.tooltips.forEach(tooltip => tooltip.element?.remove());
    app.tooltips = [];
    updateTooltipRootVisibility();
    return;
  }

  const rootTooltip = getTooltipById(tooltipId);
  const rootParentId = rootTooltip?.parentId || null;

  const subtreeIds = getTooltipSubtreeIds(tooltipId);
  const byDepthDescending = app.tooltips
    .filter(tooltip => subtreeIds.has(tooltip.id))
    .sort((firstTooltip, secondTooltip) => getTooltipDepth(secondTooltip) - getTooltipDepth(firstTooltip));

  byDepthDescending.forEach(tooltip => {
    tooltip.element?.remove();
  });
  app.tooltips = app.tooltips.filter(tooltip => !subtreeIds.has(tooltip.id));
  if (rootParentId && !hasTooltipChildren(rootParentId)) {
    const parentTooltip = getTooltipById(rootParentId);
    parentTooltip?.element?.setHasOpenChild(false);
  }
  updateTooltipRootVisibility();
}

function closeDisconnectedTooltips() {
  const disconnectedTooltipIds = app.tooltips
    .filter(tooltip => tooltip.triggerEl && !tooltip.triggerEl.isConnected)
    .map(tooltip => tooltip.id);
  disconnectedTooltipIds.forEach(tooltipId => closeTooltip(tooltipId));
}

function expandedRect(rect, paddingX, paddingY) {
  return {
    left: rect.left - paddingX,
    right: rect.right + paddingX,
    top: rect.top - paddingY,
    bottom: rect.bottom + paddingY,
  };
}

function pointerWithinTooltipRegion(tooltip, pointX, pointY) {
  const panelRect = tooltip.element?.getPanelRect?.();
  if (!panelRect) {
    return false;
  }
  if (isPointInsideRect(pointX, pointY, expandedRect(panelRect, TOOLTIP_HALO_PADDING_X_PX, TOOLTIP_HALO_PADDING_Y_PX))) {
    return true;
  }
  const triggerRect = tooltip.triggerEl?.isConnected
    ? tooltip.triggerEl.getBoundingClientRect()
    : tooltip.triggerRect;
  if (!triggerRect) {
    return false;
  }
  return isPointInsideRect(pointX, pointY, expandedRect(triggerRect, TOOLTIP_HALO_PADDING_X_PX, TOOLTIP_HALO_PADDING_Y_PX));
}

function dismissDistantLeafTooltips(pointX, pointY) {
  const leafTooltips = app.tooltips
    .filter(tooltip => !hasTooltipChildren(tooltip.id))
    .sort((firstTooltip, secondTooltip) => getTooltipDepth(secondTooltip) - getTooltipDepth(firstTooltip));

  leafTooltips.forEach(tooltip => {
    if (!pointerWithinTooltipRegion(tooltip, pointX, pointY)) {
      closeTooltip(tooltip.id);
    }
  });
}

function positionTooltip(tooltip) {
  const tooltipPanelRect = tooltip.element?.getPanelRect?.();
  if (!tooltipPanelRect) {
    closeTooltip(tooltip.id);
    return;
  }

  const triggerRect = tooltip.triggerEl?.isConnected
    ? tooltip.triggerEl.getBoundingClientRect()
    : tooltip.triggerRect;
  if (!triggerRect) {
    closeTooltip(tooltip.id);
    return;
  }

  tooltip.element.style.left = '0px';
  tooltip.element.style.top = '0px';

  const centeredLeft = triggerRect.left + ((triggerRect.width - tooltipPanelRect.width) / 2);
  const maxLeft = window.innerWidth - tooltipPanelRect.width - TOOLTIP_VIEWPORT_PADDING;
  const left = Math.min(Math.max(centeredLeft, TOOLTIP_VIEWPORT_PADDING), Math.max(TOOLTIP_VIEWPORT_PADDING, maxLeft));

  const spaceAbove = triggerRect.top - TOOLTIP_VIEWPORT_PADDING;
  const spaceBelow = window.innerHeight - triggerRect.bottom - TOOLTIP_VIEWPORT_PADDING;
  const preferredAboveTop = triggerRect.top - tooltipPanelRect.height - TOOLTIP_OFFSET_PX;
  const preferredBelowTop = triggerRect.bottom + TOOLTIP_OFFSET_PX;

  let top;
  let placement;
  if (spaceAbove >= tooltipPanelRect.height + TOOLTIP_OFFSET_PX || spaceAbove >= spaceBelow) {
    top = Math.max(TOOLTIP_VIEWPORT_PADDING, preferredAboveTop);
    placement = 'above';
  } else {
    top = Math.min(window.innerHeight - tooltipPanelRect.height - TOOLTIP_VIEWPORT_PADDING, preferredBelowTop);
    placement = 'below';
  }

  tooltip.element.dataset.placement = placement;
  // The shadow host includes a halo inset around the panel; offset host placement
  // so the panel itself lands on the computed coordinates.
  tooltip.element.style.left = `${left - TOOLTIP_HALO_PADDING_X_PX}px`;
  tooltip.element.style.top = `${top - TOOLTIP_HALO_PADDING_Y_PX}px`;
}

function previewKeyForLinkType(linkType, pageId, anchor) {
  if (linkType === 'rule') {
    return anchor?.replace(/^rule-/, '').replaceAll('-', '.') || null;
  }
  if (linkType === 'glossary') {
    return pageId?.split('/')[1] || null;
  }
  return null;
}

function isSamePageTarget(paneState, target) {
  return paneState?.pageId === target.pageId;
}

function focusActiveSidebarLink() {
  const activeRoute = app.route.type === 'search' ? null : (window.location.hash || '#index');
  document.querySelectorAll('.sidebar-link--active, .sidebar-summary-link--active').forEach(node => {
    node.classList.remove('sidebar-link--active', 'sidebar-summary-link--active');
  });
  if (!activeRoute) {
    return;
  }
  const currentLink = sidebarContent.querySelector(`[href="${CSS.escape(activeRoute)}"]`);
  if (currentLink) {
    currentLink.classList.add(currentLink.classList.contains('sidebar-summary-link') ? 'sidebar-summary-link--active' : 'sidebar-link--active');
  }
}

function refreshSidebarTruncationTooltips() {
  const candidates = sidebarContent.querySelectorAll('summary, .sidebar-link, .sidebar-summary-link');
  candidates.forEach(node => {
    const label = node.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (!label) {
      node.removeAttribute('title');
      return;
    }
    const isTruncated = node.scrollWidth > node.clientWidth + 1;
    if (isTruncated) {
      node.setAttribute('title', label);
      return;
    }
    node.removeAttribute('title');
  });
}

function normalizedSidebarFilter() {
  return app.sidebarFilter.trim().toLowerCase();
}

function renderSidebarFilterInput() {
  return `
    <div class="sidebar-filter">
      <label class="sr-only" for="sidebar-filter-input">Filter sidebar entries</label>
      <input
        id="sidebar-filter-input"
        class="sidebar-filter-input"
        type="search"
        value="${escapeHtml(app.sidebarFilter)}"
        placeholder="Filter rules and glossary"
        autocomplete="off"
        spellcheck="false"
      >
    </div>
  `;
}

function renderIndexSidebarLink() {
  return '<a class="sidebar-link sidebar-link--section" href="#index" data-target-route="#index">Index</a>';
}

function renderGlossarySidebarGroups(filterQuery = '') {
  return app.navigation.glossary.map(group => {
    const visibleEntries = group.entries.filter(entry => {
      return !filterQuery || entry.term.toLowerCase().includes(filterQuery);
    });

    if (visibleEntries.length === 0) {
      return '';
    }

    const openAttribute = filterQuery ? ' open' : '';
    return `
      <details data-group="${group.group}"${openAttribute}>
        <summary>${group.group.toUpperCase()}</summary>
        <ul>${visibleEntries.map(entry => `<li><a class="sidebar-link" href="${entry.route}" data-target-route="${entry.route}">${entry.term}</a></li>`).join('')}</ul>
      </details>
    `;
  }).join('');
}

function renderRulesSidebar(filterQuery = '') {
  const includeIndex = !filterQuery;
  const filteredChapters = app.navigation.rules.map(chapter => {
    const visibleSections = chapter.sections.filter(section => {
      if (!filterQuery) {
        return true;
      }
      return `${section.number}. ${section.title}`.toLowerCase().includes(filterQuery);
    });

    if (visibleSections.length === 0) {
      return '';
    }

    const openAttribute = filterQuery ? ' open' : '';
    return `
      <details data-chapter="${chapter.number}"${openAttribute}>
        <summary>${chapter.number}. ${chapter.title}</summary>
        <ul class="sidebar-section-list">${visibleSections.map(section => `
          <li data-section="${section.number}">
            <a class="sidebar-link sidebar-link--section" href="${section.route}" data-target-route="${section.route}">${section.number}. ${section.title}</a>
          </li>
        `).join('')}</ul>
      </details>
    `;
  }).join('');

  const glossaryGroupsMarkup = renderGlossarySidebarGroups(filterQuery);
  const includeGlossary = glossaryGroupsMarkup.length > 0;
  const glossaryOpenAttribute = filterQuery ? ' open' : '';

  return `
    ${includeIndex ? renderIndexSidebarLink() : ''}
    ${filteredChapters}
    ${includeGlossary ? `
      <details data-chapter="glossary"${glossaryOpenAttribute}>
        <summary>Glossary</summary>
        ${glossaryGroupsMarkup}
      </details>
    ` : ''}
  `;
}

function renderGlossarySidebar() {
  return `
    ${renderIndexSidebarLink()}
    ${renderGlossarySidebarGroups()}
  `;
}

function enforceAccordionState() {
  const chapterDetails = Array.from(sidebarContent.querySelectorAll(':scope > details'));
  for (const chapterDetail of chapterDetails) {
    chapterDetail.addEventListener('toggle', () => {
      if (normalizedSidebarFilter()) {
        return;
      }
      if (!chapterDetail.open) {
        return;
      }
      for (const sibling of chapterDetails) {
        if (sibling !== chapterDetail) {
          sibling.open = false;
        }
      }
    });
  }

  const sectionDetails = Array.from(sidebarContent.querySelectorAll('details details'));
  for (const sectionDetail of sectionDetails) {
    sectionDetail.addEventListener('toggle', () => {
      if (normalizedSidebarFilter()) {
        return;
      }
      if (!sectionDetail.open) {
        return;
      }
      const parent = sectionDetail.parentElement;
      const siblings = Array.from(parent.querySelectorAll(':scope > details'));
      for (const sibling of siblings) {
        if (sibling !== sectionDetail) {
          sibling.open = false;
        }
      }
    });
  }
}

function expandActiveSidebarPath(destination) {
  if (!destination) {
    return;
  }

  if (destination.type === 'glossary') {
    const glossaryNode = sidebarContent.querySelector('[data-chapter="glossary"]');
    if (glossaryNode) {
      glossaryNode.open = true;
    }
    const activeRoute = routeForDestination(destination);
    const group = app.navigation.glossary.find(item => item.entries.some(entry => entry.route === activeRoute));
    if (!group) {
      return;
    }
    const groupNode = sidebarContent.querySelector(`[data-group="${group.group}"]`);
    if (groupNode) {
      groupNode.open = true;
    }
    return;
  }

  if (destination.type !== 'rules') {
    return;
  }
  const sectionNumber = destination.pageSlug.split('-')[0];
  const chapter = app.navigation.rules.find(item => item.sections.some(section => section.number === sectionNumber));
  if (!chapter) {
    return;
  }
  const chapterNode = sidebarContent.querySelector(`[data-chapter="${chapter.number}"]`);
  const sectionNode = sidebarContent.querySelector(`[data-section="${sectionNumber}"]`);
  if (chapterNode) {
    chapterNode.open = true;
  }
  if (sectionNode) {
    sectionNode.open = true;
  }
}

function renderSidebar() {
  if (!app.navigation) {
    sidebarContent.innerHTML = '';
    return;
  }

  const filterQuery = normalizedSidebarFilter();
  const sidebarTree = renderRulesSidebar(filterQuery);
  const hasResults = sidebarTree.replace(/\s+/g, '').length > 0;

  sidebarContent.innerHTML = `${renderSidebarFilterInput()}${hasResults ? sidebarTree : '<p class="sidebar-filter-empty">No matches.</p>'}`;

  const filterInput = document.getElementById('sidebar-filter-input');
  filterInput?.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? input.value.length;
    app.sidebarFilter = input.value;
    renderSidebar();
    const nextInput = document.getElementById('sidebar-filter-input');
    if (!nextInput) {
      return;
    }
    const nextLength = nextInput.value.length;
    nextInput.focus();
    nextInput.setSelectionRange(Math.min(selectionStart, nextLength), Math.min(selectionEnd, nextLength));
  });

  enforceAccordionState();
  expandActiveSidebarPath(currentReaderState().primary);
  focusActiveSidebarLink();
  refreshSidebarTruncationTooltips();
}

function renderIndexPage() {
  const rulesCards = app.navigation.rules.map(chapter => `
    <section class="index-card">
      <h2>${chapter.number}. ${chapter.title}</h2>
      <p>${chapter.sections.length} sections</p>
      <ul>${chapter.sections.slice(0, 8).map(section => `<li><a href="${section.route}" data-target-route="${section.route}">${section.number}. ${section.title}</a></li>`).join('')}</ul>
    </section>
  `).join('');
  const glossaryCards = app.navigation.glossary.map(group => `
    <section class="index-card">
      <h2>${group.group.toUpperCase()}</h2>
      <ul>${group.entries.slice(0, 8).map(entry => `<li><a href="${entry.route}" data-target-route="${entry.route}">${entry.term}</a></li>`).join('')}</ul>
    </section>
  `).join('');

  mainView.innerHTML = `
    <article class="index-layout">
      <header class="document-header">
        <p class="document-kicker">Index</p>
        <h1>Magic Comprehensive Rules</h1>
      </header>
      <section class="index-grid">${rulesCards}</section>
      <header class="document-header">
        <p class="document-kicker">Glossary</p>
        <h1>Browse Terms</h1>
      </header>
      <section class="index-grid">${glossaryCards}</section>
    </article>
  `;
}

function renderSearchPage(results) {
  const rulesMarkup = results.rules.length
    ? `<div class="search-result-list">${results.rules.map(result => `
        <article class="search-result">
          <button type="button" class="search-result-link" data-search-page-id="${result.pageId}" data-search-anchor="${result.anchor || ''}">${result.title}</button>
          <p class="search-result-subtitle">${result.subtitle}</p>
          <p class="search-result-snippet">${result.snippet}</p>
        </article>
      `).join('')}</div>`
    : '<div class="empty-state"><strong>No rule matches.</strong></div>';

  const glossaryMarkup = results.glossary.length
    ? `<div class="search-result-list">${results.glossary.map(result => `
        <article class="search-result">
          <button type="button" class="search-result-link" data-search-page-id="${result.pageId}" data-search-anchor="${result.anchor || ''}">${result.title}</button>
          <p class="search-result-subtitle">${result.subtitle}</p>
          <p class="search-result-snippet">${result.snippet}</p>
        </article>
      `).join('')}</div>`
    : '<div class="empty-state"><strong>No glossary matches.</strong></div>';

  mainView.innerHTML = `
    <section class="search-page">
      <header class="search-page-header">
        <div>
          <p class="document-kicker">Search</p>
          <h1 class="search-page-title">Find rules and glossary terms</h1>
        </div>
        <button type="button" class="search-page-close" id="search-page-close">Close</button>
      </header>
      <form class="search-form" id="search-form">
        <label class="sr-only" for="search-input">Search query</label>
        <input id="search-input" class="search-input" type="search" value="${escapeHtml(app.searchQuery)}" placeholder="Search by rule number, term, or text">
        <button type="submit" class="search-submit">Search</button>
      </form>
      <section class="search-results">
        <section class="search-group">
          <h2>Rules</h2>
          ${rulesMarkup}
        </section>
        <section class="search-group">
          <h2>Glossary</h2>
          ${glossaryMarkup}
        </section>
      </section>
    </section>
  `;

  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const closeButton = document.getElementById('search-page-close');

  form.addEventListener('submit', event => {
    event.preventDefault();
    app.searchQuery = input.value.trim();
    history.replaceState({ readerState: currentReaderState(), searchQuery: app.searchQuery }, '', '#search');
    renderSearchPage(runSearch(app.searchQuery));
  });

  document.querySelectorAll('[data-search-page-id]').forEach(button => {
    button.addEventListener('click', () => {
      const pageId = button.dataset.searchPageId;
      const anchor = button.dataset.searchAnchor || null;
      if (!pageId) {
        return;
      }
      navigatePrimary(destinationForPageId(pageId, anchor), 'search');
    });
  });

  closeButton.addEventListener('click', () => {
    window.history.back();
  });
}

function scrollPaneToTarget(paneName, destination, behavior = 'auto') {
  if (!destination?.anchor) {
    return;
  }
  const pane = document.querySelector(`.reader-pane[data-pane="${paneName}"]`);
  const body = pane?.querySelector('.reader-pane-body');
  const target = pane?.querySelector(`#${CSS.escape(destination.anchor)}`);
  if (body && target) {
    const bodyRect = body.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = body.scrollTop + (targetRect.top - bodyRect.top);
    body.scrollTo({ top, behavior });
  }
}

function restorePaneScroll(readerState) {
  const primaryBody = document.querySelector('.reader-pane[data-pane="primary"] .reader-pane-body');
  const secondaryBody = document.querySelector('.reader-pane[data-pane="secondary"] .reader-pane-body');
  if (primaryBody) {
    primaryBody.scrollTop = readerState.scroll.primary ?? 0;
  }
  if (secondaryBody) {
    secondaryBody.scrollTop = readerState.scroll.secondary ?? 0;
  }
}

async function renderReaderLayout(readerState, options = {}) {
  const primaryBundle = readerState.primary ? await getBundleForDestination(readerState.primary) : null;
  const secondaryBundle = readerState.secondary && !isMobileViewport() ? await getBundleForDestination(readerState.secondary) : null;

  const primaryMarkup = primaryBundle
    ? createReaderPaneMarkup('primary', primaryBundle, pageTitleForDestination(readerState.primary, primaryBundle), 'primary', {
        actions: '<button type="button" class="reader-action" data-reader-search>Search</button>',
      })
    : '<div class="empty-state"><strong>No primary content selected.</strong><p>Select a rule or glossary entry.</p></div>';

  const secondaryMarkup = secondaryBundle
    ? createReaderPaneMarkup('secondary', secondaryBundle, pageTitleForDestination(readerState.secondary, secondaryBundle), 'secondary', {
        actions: '<button type="button" class="reader-action reader-action--icon-close" data-close-secondary aria-label="Close comparison" title="Close comparison">x</button>',
      })
    : '';

  mainView.innerHTML = `
    <section class="reader-layout ${readerLayoutClass(readerState)}">
      ${primaryMarkup}
      ${secondaryMarkup}
    </section>
  `;

  const primaryBody = document.querySelector('.reader-pane[data-pane="primary"] .reader-pane-body');
  const secondaryBody = document.querySelector('.reader-pane[data-pane="secondary"] .reader-pane-body');
  primaryBody?.addEventListener('scroll', recordPaneScroll, { passive: true });
  secondaryBody?.addEventListener('scroll', recordPaneScroll, { passive: true });

  document.querySelector('[data-reader-search]')?.addEventListener('click', openSearchPage);
  document.querySelector('[data-close-secondary]')?.addEventListener('click', () => {
    const nextState = cloneReaderState(readerState);
    nextState.secondary = null;
    nextState.scroll.secondary = 0;
    replaceReaderState(routeForDestination(nextState.primary), nextState);
    void renderCurrentRoute({ useHistoryState: true });
  });

  if (options.restoreScroll) {
    restorePaneScroll(readerState);
  } else {
    scrollPaneToTarget('primary', readerState.primary);
    if (readerState.secondary) {
      scrollPaneToTarget('secondary', readerState.secondary);
    }
  }
}

// ─── Cheat Sheet Storage ────────────────────────────────────────────────────

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultCheatSheet() {
  return { id: generateId(), name: 'My Cheat Sheet', panels: [] };
}

function loadCheatSheet() {
  try {
    const raw = localStorage.getItem(CHEAT_SHEET_STORAGE_KEY);
    if (!raw) return defaultCheatSheet();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.panels)) {
      return defaultCheatSheet();
    }
    return parsed;
  } catch {
    return defaultCheatSheet();
  }
}

function saveCheatSheet() {
  try {
    localStorage.setItem(CHEAT_SHEET_STORAGE_KEY, JSON.stringify(app.cheatSheet));
  } catch {
    // Ignore storage failures.
  }
}

// ─── Cheat Sheet Mutations ───────────────────────────────────────────────────

function addPanel() {
  const panel = { id: generateId(), title: 'New Panel', items: [] };
  app.cheatSheet.panels.push(panel);
  saveCheatSheet();
  renderCheatSheet();
}

function removePanel(panelId) {
  app.cheatSheet.panels = app.cheatSheet.panels.filter(p => p.id !== panelId);
  saveCheatSheet();
  renderCheatSheet();
}

function reorderPanels(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const panels = app.cheatSheet.panels;
  const [moved] = panels.splice(fromIndex, 1);
  panels.splice(toIndex, 0, moved);
  saveCheatSheet();
  renderCheatSheet();
}

function renamePanel(panelId, newTitle) {
  const panel = app.cheatSheet.panels.find(p => p.id === panelId);
  if (!panel || panel.title === newTitle) return;
  panel.title = newTitle;
  saveCheatSheet();
}

function addItem(panelId, item) {
  const panel = app.cheatSheet.panels.find(p => p.id === panelId);
  if (!panel) return;
  panel.items.push(item);
  saveCheatSheet();
  renderCheatSheet();
}

function removeItem(panelId, itemIndex) {
  const panel = app.cheatSheet.panels.find(p => p.id === panelId);
  if (!panel) return;
  panel.items.splice(itemIndex, 1);
  saveCheatSheet();
  renderCheatSheet();
}

function setItemDisplayMode(panelId, itemIndex, displayMode) {
  const panel = app.cheatSheet.panels.find(p => p.id === panelId);
  if (!panel || !panel.items[itemIndex]) return;
  panel.items[itemIndex].displayMode = displayMode;
  saveCheatSheet();
  renderCheatSheet();
}

// ─── Cheat Sheet Export / Import ────────────────────────────────────────────

function exportCheatSheet() {
  const json = JSON.stringify(app.cheatSheet, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${app.cheatSheet.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importCheatSheet() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.panels)) {
        throw new Error('Invalid cheat sheet format');
      }
      app.cheatSheet = parsed;
      saveCheatSheet();
      renderCheatSheet();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Could not import cheat sheet: ${err.message}`);
    }
  });
  input.click();
}

// ─── Cheat Sheet Item Helpers ────────────────────────────────────────────────

function previewKeyForItem(item) {
  if (item.type === 'rule') {
    return item.anchor?.replace(/^rule-/, '').replaceAll('-', '.') || null;
  }
  if (item.type === 'glossary') {
    return item.pageId?.split('/')[1] || null;
  }
  return null;
}

function getPreviewForItem(item) {
  if (!app.previews) return null;
  const key = previewKeyForItem(item);
  if (!key) return null;
  return item.type === 'rule'
    ? (app.previews.rules?.[key] || null)
    : (app.previews.glossary?.[key] || null);
}

function itemNavRoute(item) {
  if (item.anchor) return `#${item.pageId}/${item.anchor}`;
  return `#${item.pageId}`;
}

function renderRuleCardBody(preview) {
  const ruleKey = preview.anchor?.replace(/^rule-/, '').replaceAll('-', '.');
  if (!ruleKey || !preview.subruleCount) return preview.html;
  const subruleKeys = Array.from({ length: preview.subruleCount }, (_, i) =>
    `${ruleKey}${String.fromCharCode(97 + i)}`
  );
  const subrulesHtml = subruleKeys
    .map(k => app.previews?.rules?.[k]?.html ?? '')
    .join('');
  return preview.html + subrulesHtml;
}

// ─── Cheat Sheet Item Rendering ─────────────────────────────────────────────

function renderCheatSheetItemHtml(panel, item, index) {
  const preview = getPreviewForItem(item);
  const isCard = item.displayMode === 'card';
  const hasSubrules = item.type === 'rule' && preview && preview.subruleCount > 0;
  const canToggle = hasSubrules || item.type === 'glossary';
  const navRoute = itemNavRoute(item);

  let contentHtml;
  if (isCard && item.type === 'rule' && preview) {
    contentHtml = renderRuleCardBody(preview);
  } else if (isCard && item.type === 'glossary') {
    contentHtml = `<div class="item-card-loading" data-loading-panel-id="${escapeHtml(panel.id)}" data-loading-item-index="${index}">Loading…</div>`;
  } else {
    contentHtml = preview
      ? preview.html
      : `<p class="item-missing">Content not available.</p>`;
  }

  const toggleBtn = canToggle
    ? `<button type="button" class="item-btn item-toggle-btn" data-action="toggle-item-mode" data-panel-id="${escapeHtml(panel.id)}" data-item-index="${index}" aria-label="${isCard ? 'Collapse' : 'Expand'}" title="${isCard ? 'Collapse' : 'Expand'}">${isCard ? '⊟' : '⊞'}</button>`
    : '';

  return `
    <div class="cheat-sheet-item${isCard ? ' cheat-sheet-item--card' : ''}" data-panel-id="${escapeHtml(panel.id)}" data-item-index="${index}">
      <div class="item-actions">
        ${toggleBtn}
        <a href="${escapeHtml(navRoute)}" class="item-btn item-nav-btn" data-target-route="${escapeHtml(navRoute)}" aria-label="Open in reader" title="Open in reader">↗</a>
        <button type="button" class="item-btn item-remove-btn" data-action="remove-item" data-panel-id="${escapeHtml(panel.id)}" data-item-index="${index}" aria-label="Remove" title="Remove">×</button>
      </div>
      <div class="item-content">
        ${contentHtml}
      </div>
    </div>
  `;
}

function renderCheatSheetPanelHtml(panel) {
  const itemsHtml = panel.items.map((item, i) => renderCheatSheetItemHtml(panel, item, i)).join('');
  return `
    <article class="cheat-sheet-panel" data-panel-id="${escapeHtml(panel.id)}">
      <header class="cheat-sheet-panel-header" data-panel-id="${escapeHtml(panel.id)}">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <input
          type="text"
          class="panel-title-input"
          value="${escapeHtml(panel.title)}"
          data-panel-id="${escapeHtml(panel.id)}"
          aria-label="Panel title"
          spellcheck="false"
        >
        <button type="button" class="panel-btn panel-remove-btn" data-action="remove-panel" data-panel-id="${escapeHtml(panel.id)}" aria-label="Remove panel" title="Remove panel">×</button>
      </header>
      <div class="cheat-sheet-panel-body">
        ${itemsHtml || '<p class="panel-empty">Search below to add items.</p>'}
      </div>
      <footer class="cheat-sheet-panel-footer">
        <div class="panel-search-wrapper" data-panel-id="${escapeHtml(panel.id)}">
          <input
            type="search"
            class="panel-search-input"
            placeholder="Search to add…"
            autocomplete="off"
            spellcheck="false"
            data-panel-id="${escapeHtml(panel.id)}"
          >
          <ul class="panel-search-results" role="listbox" aria-label="Search results" hidden></ul>
        </div>
      </footer>
    </article>
  `;
}

function renderCheatSheet() {
  if (!app.cheatSheet) return;
  const { panels } = app.cheatSheet;
  const panelsHtml = panels.map(panel => renderCheatSheetPanelHtml(panel)).join('');

  mainView.innerHTML = `
    <section class="cheat-sheet-view">
      <div class="cheat-sheet-grid" id="cheat-sheet-grid">
        ${panelsHtml}
      </div>
      <button type="button" class="cheat-sheet-add-panel" data-action="add-panel" aria-label="Add panel" title="Add panel">+</button>
    </section>
  `;

  // Wire up panel title inputs
  mainView.querySelectorAll('.panel-title-input').forEach(input => {
    input.addEventListener('blur', () => {
      renamePanel(input.dataset.panelId, input.value.trim() || 'New Panel');
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
    });
  });

  // Wire up panel search inputs
  mainView.querySelectorAll('.panel-search-input').forEach(wirePanelSearchInput);

  // Load async glossary card content
  void loadGlossaryCardContent();
}

async function loadGlossaryCardContent() {
  const loadingEls = Array.from(mainView.querySelectorAll('.item-card-loading'));
  for (const el of loadingEls) {
    const panelId = el.dataset.loadingPanelId;
    const itemIndex = parseInt(el.dataset.loadingItemIndex, 10);
    const panel = app.cheatSheet?.panels.find(p => p.id === panelId);
    const item = panel?.items[itemIndex];
    if (!item || item.type !== 'glossary') continue;
    try {
      const destination = destinationForPageId(item.pageId, null);
      const bundle = await getBundleForDestination(destination);
      if (mainView.contains(el)) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = bundle.html;
        el.replaceWith(wrapper.firstElementChild ?? wrapper);
      }
    } catch {
      if (mainView.contains(el)) {
        el.textContent = 'Failed to load content.';
        el.classList.remove('item-card-loading');
      }
    }
  }
}

// ─── Panel Search ────────────────────────────────────────────────────────────

function buildPreviewSearchEntries() {
  if (!app.previews) return [];
  return [
    ...Object.values(app.previews.rules),
    ...Object.values(app.previews.glossary),
  ];
}

function runPanelSearchImmediate(query, seen) {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const entries = buildPreviewSearchEntries();
  const results = [];

  // Tier 1: exact title match (strip trailing dot for comparison)
  for (const entry of entries) {
    if (results.length >= CHEAT_SHEET_MAX_RESULTS) break;
    const rawTitle = entry.title || entry.term || '';
    const normalizedTitle = rawTitle.toLowerCase().replace(/\.$/, '');
    if (normalizedTitle === normalizedQuery) {
      const key = `${entry.pageId}|${entry.anchor ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          type: entry.type,
          pageId: entry.pageId,
          anchor: entry.anchor || null,
          title: rawTitle.replace(/\.$/, ''),
          subtitle: entry.type === 'rule' ? 'Rule' : 'Glossary',
        });
      }
    }
  }

  // Tier 2: title starts-with (3+ chars)
  if (normalizedQuery.length >= 3) {
    for (const entry of entries) {
      if (results.length >= CHEAT_SHEET_MAX_RESULTS) break;
      const rawTitle = entry.title || entry.term || '';
      const normalizedTitle = rawTitle.toLowerCase().replace(/\.$/, '');
      if (normalizedTitle.startsWith(normalizedQuery)) {
        const key = `${entry.pageId}|${entry.anchor ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            type: entry.type,
            pageId: entry.pageId,
            anchor: entry.anchor || null,
            title: rawTitle.replace(/\.$/, ''),
            subtitle: entry.type === 'rule' ? 'Rule' : 'Glossary',
          });
        }
      }
    }
  }

  return results;
}

function runPanelSearchScored(query, seen) {
  if (!app.searchIndex) return [];
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const documents = [
    ...app.searchIndex.documents.rules,
    ...app.searchIndex.documents.glossary,
  ];

  return documents
    .filter(doc => {
      const key = `${doc.pageId}|${doc.anchor ?? ''}`;
      return !seen.has(key);
    })
    .map(doc => ({ doc, score: scoreDocument(doc, normalizedQuery) }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, CHEAT_SHEET_MAX_RESULTS)
    .map(e => ({
      type: e.doc.type === 'rule' ? 'rule' : 'glossary',
      pageId: e.doc.pageId,
      anchor: e.doc.anchor || null,
      title: e.doc.title,
      subtitle: e.doc.subtitle || (e.doc.type === 'rule' ? 'Rule' : 'Glossary'),
    }));
}

function renderPanelSearchResults(resultsEl, results) {
  if (!results.length) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }
  resultsEl.hidden = false;
  resultsEl.innerHTML = results.map(result => `
    <li class="panel-search-result" role="option"
        data-result-type="${escapeHtml(result.type)}"
        data-result-pageid="${escapeHtml(result.pageId)}"
        data-result-anchor="${escapeHtml(result.anchor || '')}">
      <span class="result-title">${escapeHtml(result.title)}</span>
      <span class="result-subtitle">${escapeHtml(result.subtitle)}</span>
    </li>
  `).join('');
}

function wirePanelSearchInput(input) {
  const panelId = input.dataset.panelId;
  let debounceTimer = null;
  let seen = new Set();
  let currentResults = [];

  const getResultsEl = () => {
    if (!mainView.contains(input)) return null;
    return input.closest('.panel-search-wrapper')?.querySelector('.panel-search-results') || null;
  };

  const dismissResults = () => {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    input.value = '';
    seen = new Set();
    currentResults = [];
    const resultsEl = getResultsEl();
    if (resultsEl) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }
  };

  input.addEventListener('input', () => {
    const query = input.value;
    const resultsEl = getResultsEl();
    if (!resultsEl) return;

    seen = new Set();
    currentResults = [];

    if (!query.trim()) {
      clearTimeout(debounceTimer);
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      return;
    }

    // Tiers 1 + 2: immediate
    currentResults = runPanelSearchImmediate(query, seen);
    renderPanelSearchResults(resultsEl, currentResults);

    // Tier 3: debounced
    clearTimeout(debounceTimer);
    const capturedSeen = new Set(seen);
    debounceTimer = setTimeout(() => {
      const scored = runPanelSearchScored(query, capturedSeen);
      if (scored.length > 0 && mainView.contains(input)) {
        currentResults = [...currentResults, ...scored].slice(0, CHEAT_SHEET_MAX_RESULTS);
        const freshResultsEl = getResultsEl();
        if (freshResultsEl) renderPanelSearchResults(freshResultsEl, currentResults);
      }
    }, CHEAT_SHEET_SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismissResults();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      const resultsEl = getResultsEl();
      if (resultsEl && !resultsEl.contains(document.activeElement)) {
        dismissResults();
      }
    }, 200);
  });

  // Result clicks via delegation on the results list
  const resultsEl = getResultsEl();
  if (resultsEl) {
    resultsEl.addEventListener('mousedown', e => {
      const resultEl = e.target.closest('.panel-search-result');
      if (!resultEl) return;
      e.preventDefault(); // prevent blur on input before click
      const item = {
        type: resultEl.dataset.resultType,
        pageId: resultEl.dataset.resultPageid,
        anchor: resultEl.dataset.resultAnchor || null,
        label: null,
        displayMode: 'link',
      };
      addItem(panelId, item);
    });
  }
}

// ─── Panel Drag-to-Reorder ───────────────────────────────────────────────────

function startPanelDrag(panelId, pointerId, startX, startY) {
  const panelIndex = app.cheatSheet.panels.findIndex(p => p.id === panelId);
  if (panelIndex === -1) return;

  const panelEl = mainView.querySelector(`.cheat-sheet-panel[data-panel-id="${CSS.escape(panelId)}"]`);
  const headerEl = panelEl?.querySelector('.cheat-sheet-panel-header');
  if (!panelEl || !headerEl) return;

  const rect = panelEl.getBoundingClientRect();

  // Floating clone
  const panel = app.cheatSheet.panels[panelIndex];
  const cloneEl = document.createElement('div');
  cloneEl.className = 'panel-drag-clone';
  cloneEl.style.width = `${rect.width}px`;
  cloneEl.style.left = `${rect.left + window.scrollX}px`;
  cloneEl.style.top = `${rect.top + window.scrollY}px`;
  cloneEl.innerHTML = `<span class="drag-handle" aria-hidden="true">⠿</span><span>${escapeHtml(panel.title)}</span>`;
  document.body.appendChild(cloneEl);

  // Single drop indicator line (no grid disruption)
  const indicatorEl = document.createElement('div');
  indicatorEl.className = 'panel-drop-indicator';
  document.body.appendChild(indicatorEl);

  panelEl.classList.add('panel-dragging');

  try {
    headerEl.setPointerCapture(pointerId);
  } catch {
    // Pointer capture may fail in some environments.
  }

  panelDragState = { panelId, panelIndex, dropIndex: panelIndex, startX, startY, pointerId, cloneEl, indicatorEl };
  document.addEventListener('keydown', onDragKeyDown);
  positionDropIndicator(panelIndex);
}

function calculateDropIndex(cursorX) {
  if (!panelDragState) return 0;
  const gridEl = mainView.querySelector('.cheat-sheet-grid');
  if (!gridEl) return panelDragState.panelIndex;

  const panels = Array.from(gridEl.querySelectorAll('.cheat-sheet-panel:not(.panel-dragging)'));
  for (let i = 0; i < panels.length; i++) {
    const rect = panels[i].getBoundingClientRect();
    if (cursorX < rect.left + rect.width / 2) {
      return i;
    }
  }
  return panels.length;
}

function positionDropIndicator(dropIndex) {
  const { indicatorEl } = panelDragState;
  const gridEl = mainView.querySelector('.cheat-sheet-grid');
  if (!gridEl) return;

  const panels = Array.from(gridEl.querySelectorAll('.cheat-sheet-panel:not(.panel-dragging)'));
  const gridRect = gridEl.getBoundingClientRect();

  let x;
  if (panels.length === 0) {
    x = gridRect.left;
  } else if (dropIndex <= 0) {
    x = panels[0].getBoundingClientRect().left;
  } else if (dropIndex >= panels.length) {
    x = panels[panels.length - 1].getBoundingClientRect().right;
  } else {
    const prevRight = panels[dropIndex - 1].getBoundingClientRect().right;
    const nextLeft = panels[dropIndex].getBoundingClientRect().left;
    x = (prevRight + nextLeft) / 2;
  }

  indicatorEl.style.left = `${x}px`;
  indicatorEl.style.top = `${gridRect.top}px`;
  indicatorEl.style.height = `${gridRect.height}px`;
}

function updatePanelDrag(clientX, clientY) {
  if (!panelDragState) return;
  const { cloneEl, startX, startY } = panelDragState;
  cloneEl.style.transform = `translate(${clientX - startX}px, ${clientY - startY}px)`;

  const dropIndex = calculateDropIndex(clientX);
  panelDragState.dropIndex = dropIndex;
  positionDropIndicator(dropIndex);
}

function finishPanelDrag(cancelled) {
  if (!panelDragState) return;
  const { panelIndex, dropIndex, cloneEl, indicatorEl } = panelDragState;

  cloneEl.remove();
  indicatorEl.remove();
  document.removeEventListener('keydown', onDragKeyDown);
  mainView.querySelector('.panel-dragging')?.classList.remove('panel-dragging');

  const savedState = panelDragState;
  panelDragState = null;

  if (!cancelled && dropIndex !== panelIndex) {
    reorderPanels(savedState.panelIndex, savedState.dropIndex);
  }
}

function onDragKeyDown(e) {
  if (e.key === 'Escape') finishPanelDrag(true);
}

// ─── Mode / Route helpers ────────────────────────────────────────────────────

function updateModeForRoute(route) {
  const destination = normalizeDestination(route);
  if (destination) {
    setMode(inferModeFromDestination(destination));
  }
}

async function renderCurrentRoute(options = {}) {
  app.route = parseHash();
  updateModeForRoute(app.route);
  closeTooltip();
  closeSidebarIfMobile();

  if (app.route.type === 'index') {
    renderCheatSheet();
    focusActiveSidebarLink();
    return;
  }

  if (app.route.type === 'search') {
    renderSearchPage(runSearch(app.searchQuery));
    return;
  }

  const readerState = options.useHistoryState ? currentReaderState() : readerStateFromRoute(app.route);
  if (!options.useHistoryState) {
    replaceReaderState(routeForDestination(readerState.primary), readerState);
  }
  await renderReaderLayout(readerState, { restoreScroll: options.restoreScroll === true });
  renderSidebar();
  focusActiveSidebarLink();
}

function navigatePrimary(destination, source = 'sidebar') {
  recordPaneScroll();
  const current = currentReaderState();
  const nextState = {
    primary: destination,
    secondary: source === 'link' && current.primary?.pageId === destination.pageId ? current.secondary : null,
    scroll: { primary: 0, secondary: 0 },
  };
  if (source === 'search') {
    nextState.secondary = null;
  }
  pushReaderState(routeForDestination(destination), nextState);
  void renderCurrentRoute({ useHistoryState: true });
}

function openSearchPage() {
  recordPaneScroll();
  history.pushState({ readerState: currentReaderState(), searchQuery: app.searchQuery }, '', '#search');
  app.route = parseHash();
  void renderCurrentRoute({ useHistoryState: true });
}

function getPreviewForTarget(linkType, pageId, anchor) {
  const previewKey = previewKeyForLinkType(linkType, pageId, anchor);
  if (!previewKey || !app.previews) {
    return null;
  }
  const collection = linkType === 'rule' ? app.previews.rules : app.previews.glossary;
  return collection?.[previewKey] || null;
}

function openTooltipForTarget({ linkType, pageId, anchor = null, paneName = 'primary', parentTooltipId = null, triggerEl = null, triggerRect = null }) {
  const preview = getPreviewForTarget(linkType, pageId, anchor);
  if (!preview) {
    return;
  }

  const existingTooltip = app.tooltips.find(tooltip => (
    tooltip.parentId === parentTooltipId
    && tooltip.pageId === pageId
    && tooltip.anchor === anchor
    && tooltip.triggerEl === triggerEl
  ));
  if (existingTooltip) {
    positionTooltip(existingTooltip);
    return;
  }

  if (parentTooltipId) {
    const childTooltipIds = app.tooltips.filter(tooltip => tooltip.parentId === parentTooltipId).map(tooltip => tooltip.id);
    childTooltipIds.forEach(tooltipId => closeTooltip(tooltipId));
    const parentTooltip = getTooltipById(parentTooltipId);
    parentTooltip?.element?.setHasOpenChild(false);
  } else {
    closeTooltip();
  }

  const state = currentReaderState();
  const paneDestination = paneName === 'secondary' ? state.secondary : state.primary;
  const samePage = paneDestination?.pageId === pageId;

  const tooltipElement = document.createElement('rule-tooltip');
  const tooltip = {
    id: createTooltipId(),
    parentId: parentTooltipId,
    paneName,
    triggerEl,
    triggerRect,
    pageId,
    anchor,
    samePage,
    element: tooltipElement,
  };
  tooltipElement.className = 'tooltip-item';
  tooltipElement.dataset.tooltipId = tooltip.id;
  if (tooltip.parentId) {
    tooltipElement.dataset.parentTooltipId = tooltip.parentId;
  }
  tooltipElement.initialize({
    tooltipId: tooltip.id,
    pageId,
    anchor,
    samePage,
    paneName,
    previewHtml: preview.html,
  });

  app.tooltips.push(tooltip);
  tooltipRoot.appendChild(tooltipElement);
  if (parentTooltipId) {
    const parentTooltip = getTooltipById(parentTooltipId);
    parentTooltip?.element?.setHasOpenChild(true);
  }
  updateTooltipRootVisibility();
  positionTooltip(tooltip);
}

function openPreview(link) {
  const pane = link.closest('.reader-pane');
  const paneName = pane?.dataset.pane || 'primary';
  openTooltipForTarget({
    linkType: link.dataset.linkType,
    pageId: link.dataset.pageId,
    anchor: link.dataset.anchor || null,
    paneName,
    triggerEl: link,
  });
}

function handleSamePageScroll(paneName, destination) {
  const state = currentReaderState();
  const paneDestination = paneName === 'secondary' ? state.secondary : state.primary;
  if (!paneDestination) {
    return;
  }
  paneDestination.anchor = destination.anchor;
  replaceReaderState(routeForDestination(state.primary), state);
  scrollPaneToTarget(paneName, destination, 'smooth');
}

function handleReaderLinkNavigation({ paneName, pageId, anchor, samePage }) {
  const state = currentReaderState();
  const destination = destinationForPageId(pageId, anchor);

  if (samePage) {
    handleSamePageScroll(paneName, destination);
    return;
  }

  recordPaneScroll();

  if (paneName === 'secondary') {
    const promotedPrimary = state.secondary;
    const nextState = {
      primary: promotedPrimary ? { ...promotedPrimary } : state.primary,
      secondary: destination,
      scroll: { primary: state.scroll.secondary ?? 0, secondary: 0 },
    };
    nextState.primary.anchor = promotedPrimary?.anchor ?? nextState.primary.anchor;
    pushReaderState(routeForDestination(nextState.primary), nextState);
    void renderCurrentRoute({ useHistoryState: true });
    return;
  }

  const nextState = {
    primary: state.primary,
    secondary: destination,
    scroll: { primary: state.scroll.primary ?? 0, secondary: 0 },
  };
  pushReaderState(routeForDestination(state.primary), nextState);
  void renderCurrentRoute({ useHistoryState: true });
}

function onDocumentClick(event) {
  // Cheat sheet actions
  if (event.target.closest('[data-action="add-panel"]')) {
    addPanel();
    return;
  }
  const removePanelBtn = event.target.closest('[data-action="remove-panel"]');
  if (removePanelBtn) {
    removePanel(removePanelBtn.dataset.panelId);
    return;
  }
  const toggleItemBtn = event.target.closest('[data-action="toggle-item-mode"]');
  if (toggleItemBtn) {
    const panelId = toggleItemBtn.dataset.panelId;
    const itemIndex = parseInt(toggleItemBtn.dataset.itemIndex, 10);
    const panel = app.cheatSheet?.panels.find(p => p.id === panelId);
    const item = panel?.items[itemIndex];
    if (item) {
      setItemDisplayMode(panelId, itemIndex, item.displayMode === 'card' ? 'link' : 'card');
    }
    return;
  }
  const removeItemBtn = event.target.closest('[data-action="remove-item"]');
  if (removeItemBtn) {
    removeItem(removeItemBtn.dataset.panelId, parseInt(removeItemBtn.dataset.itemIndex, 10));
    return;
  }
  if (event.target.closest('[data-action="export-cheat-sheet"]')) {
    exportCheatSheet();
    return;
  }
  if (event.target.closest('[data-action="import-cheat-sheet"]')) {
    importCheatSheet();
    return;
  }

  const sidebarLink = event.target.closest('[data-target-route]');
  if (sidebarLink) {
    event.preventDefault();
    const route = sidebarLink.getAttribute('href');
    if (!route) {
      return;
    }
    const nextRoute = parseHashValue(route);
    const nextReaderState = isReaderRoute(nextRoute) ? readerStateFromRoute(nextRoute) : defaultReaderState();
    history.pushState({ readerState: nextReaderState, searchQuery: app.searchQuery }, '', route);
    app.route = nextRoute;
    void renderCurrentRoute({ useHistoryState: true });
    return;
  }

  const contentLink = event.target.closest('.rule-link');
  if (!contentLink) {
    if (!tooltipRoot.contains(event.target)) {
      closeTooltip();
    }
    return;
  }

  const pane = contentLink.closest('.reader-pane');
  if (!pane) {
    return;
  }

  const paneName = pane.dataset.pane || 'primary';
  const pageId = contentLink.dataset.pageId;
  const anchor = contentLink.dataset.anchor || null;
  const state = currentReaderState();
  const paneDestination = paneName === 'secondary' ? state.secondary : state.primary;
  const samePage = paneDestination?.pageId === pageId;

  if (isMobileViewport()) {
    event.preventDefault();
    openPreview(contentLink);
    return;
  }

  event.preventDefault();
  handleReaderLinkNavigation({ paneName, pageId, anchor, samePage });
}

function onDocumentPointerOver(event) {
  if (isMobileViewport()) {
    return;
  }
  const link = event.target.closest('.rule-link');
  if (!link || !link.closest('.reader-pane')) {
    return;
  }
  openPreview(link);
}

function onDocumentPointerMove(event) {
  if (panelDragState && panelDragState.pointerId === event.pointerId) {
    updatePanelDrag(event.clientX, event.clientY);
  }
  if (isMobileViewport() || app.tooltips.length === 0) {
    return;
  }
  dismissDistantLeafTooltips(event.clientX, event.clientY);
}

function onTooltipOpenRequest(event) {
  const detail = event.detail || {};
  if (!detail.linkType || !detail.pageId) {
    return;
  }
  openTooltipForTarget({
    linkType: detail.linkType,
    pageId: detail.pageId,
    anchor: detail.anchor || null,
    paneName: detail.paneName || 'primary',
    parentTooltipId: detail.parentTooltipId || null,
    triggerRect: detail.triggerRect || null,
  });
}

function onTooltipCloseRequest(event) {
  const tooltipId = event.detail?.tooltipId;
  if (!tooltipId) {
    return;
  }
  closeTooltip(tooltipId);
}

function onTooltipNavigateRequest(event) {
  const detail = event.detail || {};
  if (!detail.pageId) {
    return;
  }
  closeTooltip();
  handleReaderLinkNavigation({
    paneName: detail.paneName || 'primary',
    pageId: detail.pageId,
    anchor: detail.anchor || null,
    samePage: Boolean(detail.samePage),
  });
}

function onDocumentFocusIn(event) {
  const link = event.target.closest('.rule-link');
  if (!link || !link.closest('.reader-pane')) {
    return;
  }
  if (isMobileViewport()) {
    return;
  }
  openPreview(link);
}

function onDocumentPointerDown(event) {
  const header = event.target.closest('.cheat-sheet-panel-header');
  if (!header) return;
  if (event.target.closest('button, input')) return;
  const panelId = header.dataset.panelId;
  if (!panelId) return;
  event.preventDefault();
  startPanelDrag(panelId, event.pointerId, event.clientX, event.clientY);
}

function onDocumentPointerUp(event) {
  if (!panelDragState || panelDragState.pointerId !== event.pointerId) return;
  finishPanelDrag(false);
}

function onPopState(event) {
  app.searchQuery = event.state?.searchQuery ?? app.searchQuery;
  void renderCurrentRoute({ useHistoryState: true, restoreScroll: true });
}

function syncEffectiveDate() {
  effectiveDate.textContent = `Effective ${app.navigation.effectiveDate}`;
}

function onResize() {
  if (!isMobileViewport()) {
    markSidebarOpen(false);
  }
  setSidebarCollapsed(isMobileViewport() ? true : desktopSidebarCollapsed, false);
  refreshSidebarTruncationTooltips();
  closeDisconnectedTooltips();
  app.tooltips.forEach(tooltip => positionTooltip(tooltip));
  void renderCurrentRoute({ useHistoryState: true, restoreScroll: true });
}

async function start() {
  const [navigation, searchIndex, previews] = await Promise.all([
    fetchJson('./data/navigation.json'),
    fetchJson('./data/search-index.json'),
    fetchJson('./data/tooltip-previews.json'),
  ]);

  app.navigation = navigation;
  app.searchIndex = searchIndex;
  app.previews = previews;
  app.cheatSheet = loadCheatSheet();
  initializeSidebarCollapse();
  syncEffectiveDate();
  renderSidebar();

  const initialRoute = parseHash();
  app.route = initialRoute;
  const initialState = history.state?.readerState ?? (isReaderRoute(initialRoute) ? readerStateFromRoute(initialRoute) : defaultReaderState());
  history.replaceState({ readerState: initialState, searchQuery: app.searchQuery }, '', window.location.href || '#index');
  await renderCurrentRoute({ useHistoryState: true });
}

modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.modeButton)));
themeToggle?.addEventListener('click', () => {
  const currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});
drawerToggle.addEventListener('click', () => markSidebarOpen(!sidebar.classList.contains('sidebar--open')));
sidebarCollapseToggle?.addEventListener('click', () => setSidebarCollapsed(!desktopSidebarCollapsed));
window.addEventListener('popstate', onPopState);
window.addEventListener('resize', onResize);
document.addEventListener('click', onDocumentClick);
document.addEventListener('pointerdown', onDocumentPointerDown);
document.addEventListener('pointerover', onDocumentPointerOver);
document.addEventListener('pointermove', onDocumentPointerMove);
document.addEventListener('pointerup', onDocumentPointerUp);
document.addEventListener('focusin', onDocumentFocusIn);
document.addEventListener('rule-tooltip-open-request', onTooltipOpenRequest);
document.addEventListener('rule-tooltip-close-request', onTooltipCloseRequest);
document.addEventListener('rule-tooltip-navigate-request', onTooltipNavigateRequest);

initializeTheme();
void start();