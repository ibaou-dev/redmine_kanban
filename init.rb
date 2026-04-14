require 'redmine'

Redmine::Plugin.register :redmine_kanban do
  name        'Redmine Kanban'
  author      'ibaou'
  description 'Kanban board view for Redmine issues with drag-and-drop status transitions'
  version     '1.1.0'
  url         'https://github.com/ibaou-dev/redmine_kanban'
  author_url  'https://github.com/ibaou-dev'

  requires_redmine version_or_higher: '5.0'

  project_module :kanban do
    permission :view_kanban,
               { kanban: [:show] },
               read: true
    permission :manage_kanban,
               { kanban: [:update_status], kanban_settings: [:update] },
               require: :member
  end

  menu :project_menu,
       :kanban,
       { controller: 'kanban', action: 'show' },
       caption:  :label_kanban,
       after:    :gantt,
       param:    :project_id

  menu :application_menu,
       :kanban,
       { controller: 'kanban', action: 'show' },
       caption: :label_kanban,
       if: Proc.new {
         User.current.allowed_to?(:view_kanban, nil, global: true) &&
           EnabledModule.exists?(project: Project.visible, name: :kanban)
       }
end

require_relative 'lib/redmine_kanban/hooks/view_layouts_base_html_head_hook'
require_relative 'lib/redmine_kanban/patches/projects_helper_patch'

ProjectsHelper.include RedmineKanban::Patches::ProjectsHelperPatch \
  unless ProjectsHelper.include?(RedmineKanban::Patches::ProjectsHelperPatch)
