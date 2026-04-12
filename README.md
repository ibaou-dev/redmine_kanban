# redmine_kanban

A Kanban board view for Redmine. Issues appear as draggable cards organised by status; drag-and-drop transitions are validated against Redmine's workflow rules before being applied.

## Features

- **Full filter panel** — reuses Redmine's native `IssueQuery` engine (same filters as the Issues list and Gantt view, including saved queries)
- **Drag-and-drop status transitions** — SortableJS powers smooth card movement; allowed transitions are pre-validated client-side from workflow data on each card, then enforced server-side
- **Global board** — cross-project view at `/kanban` for users with global permissions
- **Swimlane grouping** — group cards by assignee, priority, or tracker
- **WIP limit badges** — per-column card count badge turns red when the configured limit is exceeded
- **Priority colour coding** — left border colour and badge reflect issue priority
- **Subtask progress badge** — parent issues show a `done/total` badge computed in a single grouped SQL query (no N+1)
- **Assignee avatar** — 22 px avatar (or initials placeholder) with full-name tooltip
- **Due-date display** — shown on card footer; turns red when overdue
- **Keyboard navigation** — arrow keys move focus between cards and columns; Enter/Space opens the issue
- **Toast notifications** — no `alert()` or `confirm()` used anywhere
- **No extra gems** — SortableJS 1.15.3 is vendored; zero Ruby gem dependencies

## Requirements

- Redmine 5.0 or higher
- jQuery 3.x (bundled with Redmine)
- A modern browser (Chrome/Edge 90+, Firefox 88+, Safari 14+)

Works with any Redmine theme. Integrates with the [Prism theme](https://github.com/ibaou-dev/redmine-theme-prism) for enhanced styling.

## Installation

```bash
cd /path/to/redmine
git clone https://github.com/ibaou-dev/redmine_kanban.git plugins/redmine_kanban
bundle install
bundle exec rake redmine:plugins:migrate NAME=redmine_kanban RAILS_ENV=production
# restart Redmine
touch tmp/restart.txt
```

## Enabling the Plugin

1. Go to **Administration > Projects > \<your project\> > Settings > Modules** and enable **Kanban**
2. Assign permissions under **Administration > Roles and Permissions**:
   - **View kanban** — read-only access (participates in public-project visibility rules)
   - **Manage kanban** — allows drag-and-drop status changes (requires project membership)
3. A **Kanban** tab appears in the project menu after Gantt

The global view at `/kanban` is available to users with the `view_kanban` permission granted globally.

## URL Structure

```
GET   /projects/:project_id/kanban                           # project board
GET   /kanban                                                # global board
PATCH /projects/:project_id/kanban/issues/:id/update_status # AJAX endpoint
```

The `update_status` endpoint accepts and returns JSON:

```json
// Request
{ "status_id": 3 }

// Success
{ "success": true, "issue_id": 42, "status_id": 3, "is_closed": false }

// Error
{ "success": false, "error": "...", "allowed_status_ids": [1, 2, 3] }
```

## License

GPL-2.0 — see [LICENSE](LICENSE)
