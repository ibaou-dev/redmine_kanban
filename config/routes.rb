RedmineApp::Application.routes.draw do
  get  '/projects/:project_id/kanban',
       to: 'kanban#show',
       as: 'project_kanban'

  patch '/projects/:project_id/kanban/issues/:id/update_status',
        to: 'kanban#update_status',
        as: 'project_kanban_update_status'

  get  '/kanban',
       to: 'kanban#show',
       as: 'kanban'
end
