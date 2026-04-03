require File.expand_path('../../test_helper', __FILE__)

class KanbanControllerTest < ActionDispatch::IntegrationTest
  fixtures :projects, :users, :roles, :members, :member_roles,
           :trackers, :projects_trackers, :enabled_modules,
           :issue_statuses, :issues, :workflows

  def setup
    @project = Project.find(1)
    unless @project.enabled_modules.where(name: 'kanban').exists?
      EnabledModule.create!(project: @project, name: 'kanban')
    end
    Role.find(1).add_permission!(:view_kanban) rescue nil
    Role.find(1).add_permission!(:manage_kanban) rescue nil
  end

  test 'show redirects to login when not authenticated' do
    get project_kanban_path(@project)
    assert_response :redirect
  end

  test 'show renders board for authorized user' do
    log_user('jsmith', 'jsmith')
    get project_kanban_path(@project)
    assert_response :success
    assert_select '#kb-board-container'
    assert_select '.kb-column'
  end

  test 'show renders filter panel' do
    log_user('jsmith', 'jsmith')
    get project_kanban_path(@project)
    assert_response :success
    assert_select '#filters'
  end

  test 'update_status rejects unauthenticated request' do
    issue = Issue.find(1)
    patch project_kanban_update_status_path(@project, issue),
          params: { status_id: 2 },
          headers: { 'Accept' => 'application/json' }
    assert_response :redirect
  end

  test 'update_status rejects invalid transition' do
    log_user('jsmith', 'jsmith')
    issue = Issue.find(1)
    patch project_kanban_update_status_path(@project, issue),
          params: { status_id: 9999 }.to_json,
          headers: { 'Content-Type' => 'application/json', 'Accept' => 'application/json',
                     'X-CSRF-Token' => 'test' }
    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert_not json['success']
    assert json['allowed_status_ids']
  end

  test 'card_detail returns issue partial' do
    log_user('jsmith', 'jsmith')
    issue = Issue.find(1)
    get project_kanban_card_detail_path(@project, issue),
        headers: { 'Accept' => 'text/html' }
    assert_response :success
    assert_select '.kb-detail-issue'
  end
end
