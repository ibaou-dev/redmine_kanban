# Changelog

All notable changes to `redmine_kanban` are documented here.

---

## [0.2.0] — Feature expansion

### Added

- **Swimlanes (Group-By)** — horizontal lanes grouping cards by assignee, tracker,
  priority, version, category, or any other `IssueQuery`-supported attribute.
  A "Group by" dropdown above the board persists the selection in `session[:kanban_group_by]`.
  Each swimlane row is independently collapsible; collapse state is persisted in `localStorage`.
- **Project Settings tab** — "Kanban" tab in Project Settings lets managers
  configure per-status WIP limits, column visibility, and column order.
  Backed by a new `kanban_column_configs` table (`project_id`, `status_id`,
  `wip_limit`, `visible`, `position`). Controller: `KanbanSettingsController`.
  Patch: `RedmineKanban::Patches::ProjectsHelperPatch` (same `prepend` pattern
  as `redmine_git_mirror`).
- **Card density zoom** — Compact / Normal / Detailed toggle in the board
  controls. CSS classes `kb-zoom-compact`, `kb-zoom-normal`, `kb-zoom-detailed`
  on `#kb-board-container` show/hide card sections via `.kb-detail-only` /
  `.kb-normal-up` selectors. Preference stored in `localStorage`.
- **% Done progress bar** — thin bar at card bottom showing `issue.done_ratio`.
  Visible in Normal and Detailed zoom levels.
- **Description snippet** — first ~100 chars of the issue description shown in
  Detailed zoom level only.
- **Attachment count badge** — displayed in Detailed zoom level. Computed via
  a single `GROUP BY container_id` query — no N+1.
- **Version/target badge** — `issue.fixed_version` label displayed in Detailed
  zoom level.
- **Quick search** — client-side text filter above the board; filters cards by
  subject/ID/assignee on every keypress. Column counts update in real time.
- **Loading spinner** — card shows an inline SVG spinner during the AJAX status
  update request. Removed on success or error.
- **Truncation warning** — flash banner when the query returns >500 issues:
  "Showing 500 of N issues. Use filters to narrow results."
  (mirrors Redmine's Gantt `@gantt.truncated` pattern).
- **Full subject tooltip** — `title="<subject>"` on the subject link so truncated
  subjects are readable on hover.
- **Blocked issue indicator** — lock icon overlay on cards blocked by an open
  issue. Computed via a single SQL JOIN query (`IssueRelation::TYPE_BLOCKS`).
  Drag to a closed-status column is prevented client-side with an error toast.
  Server-side check also prevents closing via `update_status`.
- **Keyboard status transitions** — `Ctrl+→` / `Ctrl+←` on a focused card moves
  it to the next/previous allowed status column. Calls `performUpdate` with the
  same validation path as drag-and-drop.

### Changed

- **Controller authorisation simplified** — removed the redundant double
  `before_action :authorize` after `find_optional_project` (which already calls
  `authorize_global`). Now mirrors `GanttsController` exactly: one
  `before_action :find_optional_project`.
- **`available_statuses`** now respects `KanbanColumnConfig` visibility and
  ordering when records exist for the current project; falls back to all workflow
  statuses when no config is present.
- **WIP limit comparison** — swimlane mode passes both a local count (per-lane)
  and a `global_count` (across all lanes) to the column partial; the WIP limit
  badge compares against the global total to avoid false "exceeded" warnings.
- **Version bumped** to `0.2.0`.

### Fixed

- **Test environment host authorisation** — Rails `HostAuthorization` middleware
  blocked `www.example.com` (the default Rails integration-test host), causing
  all integration tests to return 403. Added `config.hosts << "www.example.com"`
  in `additional_environment.rb` under `Rails.env.test?`.
- **Integration test class** changed from `ActionDispatch::IntegrationTest` to
  `Redmine::IntegrationTest` to get `log_user` and other Redmine test helpers.
- **Helper test** includes `AvatarsHelper` so `kanban_assignee_cell` tests work.

### Design Decisions

**`KanbanColumnConfig` as a separate model, not a plugin setting**
Redmine's `Setting` store is key/value — it handles a single setting per plugin
per key. Per-project, per-status configuration (WIP limits, visibility, order)
requires a proper join table. A dedicated model keeps the DB schema clean and
the queries simple.

**Swimlane collapse state in `localStorage`**
Collapse state is stored client-side rather than in `User.current.pref` to
avoid a server round-trip on every toggle and to keep the plugin stateless on
the server side for swimlane UI state.

**WIP limits count globally, not per-swimlane**
When swimlanes are active, each swimlane shows a column for every status. A
"WIP limit exceeded" check that counts only the cards within the current
swimlane would create false negatives (each swimlane looks fine in isolation
even though the aggregate across all lanes exceeds the limit). The global count
is therefore used for comparison while the local count is shown in the badge.

**Blocked detection via a single SQL JOIN, not `issue.blocked?` per card**
Calling `issue.blocked?` for each of 500 cards would result in 500 queries.
Instead, a single `JOIN` on `issue_relations` where `relation_type = 'blocks'`
and the blocking issue is open gives the full set of blocked IDs in one query.

---

## [0.1.0] — Initial release + post-testing stabilisation

### Added

- **Kanban board view** — issues rendered as cards grouped by status, with the
  full Redmine IssueQuery filter panel (same engine as Issues list / Gantt).
  Accessible at `/projects/:id/kanban` and `/kanban` (global cross-project view).
- **Project menu entry** — *Kanban* tab inserted after *Gantt* in the project
  navigation.
- **Permissions** — `view_kanban` (read-only, participates in public-project
  rules) and `manage_kanban` (drag-and-drop, requires membership).
- **Drag-and-drop status transitions** via SortableJS 1.15.3 (vendored,
  zero gem dependencies). Allowed target columns are highlighted in green;
  disallowed ones are dimmed.
- **Client-side + server-side workflow validation** — each card embeds
  `data-allowed-statuses` from `new_statuses_allowed_to(User.current)` at
  render time. The JS pre-validates before the AJAX call; the controller
  re-validates unconditionally with the same method.
- **WIP limit badges** — per-column count badge; turns red when the WIP limit
  is exceeded. The `@wip_limits` hash is wired through to columns, ready for a
  settings UI.
- **Priority colour coding** — 4 px left border on each card reflects issue
  priority position (1 = muted grey → 5 = urgent red). Priority badge shown for
  positions ≥ 3 (high and above).
- **Subtask progress badge** — parent issues display a colour-coded `done/total`
  badge (✓ green = all done, blue = partial, grey = none done). Counts are
  computed in a single `GROUP BY parent_id` SQL query — no N+1.
- **Live subtask badge refresh** — dragging a subtask to/from a closed-status
  column increments/decrements the parent card's badge in the DOM without any
  extra AJAX request. Uses `data-parent-id` on the card and parses the current
  badge text with a `/(\d+)\/(\d+)/` regex.
- **Assignee avatar** — 22 px avatar via Redmine's `avatar` helper; `?`
  placeholder with tooltip for unassigned issues.
- **Due-date display** — shown in card footer; turns red when `issue.overdue?`.
- **Closed-column dimming** — cards in closed-status columns are rendered at
  reduced opacity via `kb-closed` CSS class. Class is toggled dynamically
  after each drag based on `is_closed` in the AJAX response.
- **Empty-column placeholder** — "No issues in this column" message; hidden as
  soon as a card exists, restored when the last card is dragged out.
  Managed by `refreshColumnCounts()` which runs after every drag event.
- **Right-click context menu** — standard Redmine actions menu (Edit, Copy,
  Delete, watchers, …) on each card. Enabled by calling `<%= context_menu %>`
  in the view (which injects `context_menu.js` + stylesheet into `<head>`) and
  wrapping the board in `<form data-cm-url="<%= issues_context_menu_path %>">`.
  Each card carries `.hascontextmenu` and a hidden `<input name="ids[]">`.
- **Three-dot (⋮) button** — visible on card hover/focus; uses Redmine's native
  `.js-contextmenu` class so no custom JS handler is required.
- **Keyboard navigation** — ↑/↓ (or j/k) move focus within a column; ←/→ jump
  between columns; Enter/Space navigate to the issue page.
- **Toast notifications** — success and error feedback for every status change.
  `alert()` and `confirm()` are never used.
- **ibaou-modern theme integration** — all colours and spacing reference
  `--em-*` CSS custom properties with hard-coded fallbacks for vanilla Redmine.
- **`CHANGELOG.md`** (this file) and **`README.rdoc`**.

---

### Design Decisions

**GanttsController as the blueprint**
The controller mirrors `GanttsController` exactly: `find_optional_project` →
conditional `authorize` / `authorize_global` → `retrieve_query(IssueQuery)` →
`@query.issues(include: [...])`. This gives the Kanban view the full filter
panel, saved queries, and cross-project support for free.

**IssueQuery reuse, no subclass**
A custom `KanbanQuery` subclass was considered but rejected. The standard
`IssueQuery` already handles all filters, columns, sorting, and saved queries.
Using it directly means the filter UI (rendered via the shared
`queries/_filters` partial) is identical to the Issues list — no duplication.

**SortableJS vendored, no npm/webpack**
Redmine's asset pipeline does not use a Node build step. SortableJS 1.15.3
(40 KB minified) is checked in as `assets/javascripts/vendor/sortable.min.js`
to keep the plugin self-contained.

**context_menu.js is not globally bundled**
Redmine only includes `context_menu.js` when a view calls `<%= context_menu %>`.
It is not part of `application-legacy.js`. Without this call, `contextMenuInit()`
never runs and neither right-click nor the ⋮ button works.

**`.hascontextmenu` must be on each card, not on the form**
Redmine's `contextMenuAddSelection(tr)` calls
`tr.find('input[type=checkbox]').prop('checked', true)`. If `.hascontextmenu`
is on the outer `<form>`, `tr` is the form and `.find` checks every checkbox on
the board. Moving `.hascontextmenu` to each `.kb-card` div ensures only the
clicked card's checkbox is selected.

**ibaou-modern theme overrides for card selection**
Redmine's `context_menu.css` applies `.context-menu-selection { background: var(--em-accent) !important; color: #f8f8f8 !important; }` — a solid blue fill with white text designed for table rows. This looks bad on cards. The plugin overrides it with a 2 px `box-shadow` ring on a white background (matching the `:focus` ring already on cards) and explicitly overrides `:hover` too (the theme has a separate `:hover` rule with the same `!important` solid blue).

**No drawer / slide-out panel**
An initial implementation included a slide-out detail panel. It was removed
because it displayed a subset of the information already visible on the card
and the click target was too small. Clicking the card title or `#id` now
navigates directly to the standard issue page.

**No "Move to" dropdown**
A per-card "Move to" dropdown was included in the initial build. Removed as
redundant — drag-and-drop already handles status transitions and the dropdown
cluttered the card UI.

**Subtask badge updated client-side, not via re-fetch**
Refreshing the parent card's badge after a subtask drag does not require an
AJAX call. The `wasClosed` state of the source column is captured before the
drag, compared with `is_closed` from the response, and the badge's
`done/total` text is parsed and updated in-place. This keeps the board
interactive with zero extra network traffic.

---

### Fixed (post-initial testing)

- **Empty column placeholder persisting** — `.kb-empty-placeholder` stayed
  visible after a card was dropped into an empty column. Fixed by toggling
  `placeholder.style.display` inside `refreshColumnCounts()`, which runs after
  every drag event.
- **Card staying grayed after moving from closed to open column** — `kb-closed`
  was set server-side at render time and never updated. Fixed by toggling the
  class from `is_closed` in the AJAX JSON response. Also moved the CSS opacity
  rule from `.kb-column-closed` (which dimmed everything including the header)
  to `.kb-column-closed .kb-card`.
- **Broken tooltip on `#id` link** — ERB interpolation was outside the `<%= %>`
  tag: `title="... ##{issue.id}"` rendered literally as `##{issue.id}`. Fixed
  with `title="<%= "#{l(:label_issue)} ##{issue.id}" %>"`.
- **Context menu not opening** — two separate root causes:
  1. `context_menu.js` was never loaded on the Kanban page (not in the global
     bundle — requires `<%= context_menu %>` in the view).
  2. `.hascontextmenu` was on the `<form>` element instead of each card, causing
     `contextMenuAddSelection` to select all cards simultaneously.
- **Card selection highlight too heavy** — the theme's `.context-menu-selection`
  rule applies full solid blue (accent colour) with white text using
  `!important`. Overridden with a 2 px box-shadow ring on a white background.
  A second override is needed for `:hover` — the theme has a separate
  `.context-menu-selection:hover` rule with the same solid blue.
- **Drawer removed** — initial slide-out detail panel provided too little
  information (most already visible on the card). Replaced with direct
  navigation to the issue page.
- **"Move to" dropdown removed** — redundant with drag-and-drop; cluttered
  the card footer.
- **`initContextMenu()` call left in `init()` after the function was removed** —
  caused a `ReferenceError` in the browser console. Removed the stale call.
