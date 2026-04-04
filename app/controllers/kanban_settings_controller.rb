class KanbanSettingsController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize

  def update
    (params[:column_configs] || {}).each do |status_id, attrs|
      config = ::KanbanColumnConfig.find_or_initialize_by(
        project_id: @project.id,
        status_id:  status_id.to_i
      )
      config.wip_limit = attrs[:wip_limit].present? ? attrs[:wip_limit].to_i : nil
      config.visible   = attrs[:visible] == '1'
      config.position  = attrs[:position].to_i
      config.save!
    end
    redirect_to settings_project_path(@project, tab: 'kanban'),
                notice: l(:notice_kanban_settings_saved)
  end
end
