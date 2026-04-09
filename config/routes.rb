RedmineApp::Application.routes.draw do
  get  '/projects/:project_id/kanban',
       to: 'kanban#show',
       as: 'project_kanban'

  patch '/projects/:project_id/kanban/issues/:id/update_status',
        to: 'kanban#update_status',
        as: 'project_kanban_update_status'

  patch '/projects/:project_id/kanban/settings',
        to: 'kanban_settings#update',
        as: 'project_kanban_settings'

  get  '/kanban',
       to: 'kanban#show',
       as: 'kanban'

  patch '/kanban/issues/:id/update_status',
        to: 'kanban#update_status',
        as: 'kanban_update_status'
end
