module RedmineKanban
  module Patches
    module ProjectsHelperPatch
      def self.included(base)
        base.prepend(InstanceMethods)
      end

      module InstanceMethods
        def project_settings_tabs
          tabs = super
          if @project&.module_enabled?(:kanban) &&
             User.current.allowed_to?(:manage_kanban, @project)
            tabs << {
              name:    'kanban',
              action:  :manage_kanban,
              partial: 'kanban_settings/tab',
              label:   :label_kanban
            }
          end
          tabs
        end
      end
    end
  end
end
