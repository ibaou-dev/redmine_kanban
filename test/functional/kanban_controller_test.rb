require File.expand_path('../../test_helper', __FILE__)

class KanbanControllerTest < Redmine::IntegrationTest
  fixtures :projects, :users, :roles, :members, :member_roles,
           :trackers, :projects_trackers, :enabled_modules,
           :issue_statuses, :issues, :workflows

  def setup
    @project = Project.find(1)
    EnabledModule.find_or_create_by!(project_id: @project.id, name: 'kanban')
    @role = Role.find(1)
    @role.add_permission!(:view_kanban)   unless @role.permissions.include?(:view_kanban)
    @role.add_permission!(:manage_kanban) unless @role.permissions.include?(:manage_kanban)
  end

  # ─── show ─────────────────────────────────────────────────────

  test 'show redirects or denies when not authenticated' do
    get project_kanban_path(@project)
    assert_includes [302, 403], response.status
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

  test 'show renders board controls' do
    log_user('jsmith', 'jsmith')
    get project_kanban_path(@project)
    assert_response :success
    assert_select '#kb-search'
    assert_select '.kb-zoom-btn'
    assert_select '#kb_group_by'
  end

  test 'show renders swimlanes when kb_group_by is set' do
    log_user('jsmith', 'jsmith')
    get project_kanban_path(@project), params: { kb_group_by: 'tracker', set_filter: '1' }
    assert_response :success
    assert_select '.kb-swimlane'
  end

  test 'show shows truncation warning when issue count exceeds 500' do
    log_user('jsmith', 'jsmith')
    IssueQuery.any_instance.stubs(:issue_count).returns(501)
    get project_kanban_path(@project)
    assert_response :success
    assert_select '.kb-truncation-warning'
  end

  test 'show global kanban accessible to admin' do
    log_user('admin', 'admin')
    get kanban_path
    assert_response :success
    assert_select '#kb-board-container'
  end

  # ─── update_status ─────────────────────────────────────────────

  test 'update_status rejects unauthenticated request' do
    issue = Issue.find(1)
    patch project_kanban_update_status_path(@project, issue),
          params: { status_id: 2 },
          headers: { 'Accept' => 'application/json' }
    assert_includes [302, 403], response.status
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

  test 'update_status succeeds for valid transition' do
    log_user('jsmith', 'jsmith')
    issue = Issue.find(1)
    allowed = issue.new_statuses_allowed_to(User.find_by(login: 'jsmith'))
    skip 'No allowed transitions in fixtures' if allowed.empty?
    new_status = allowed.first
    patch project_kanban_update_status_path(@project, issue),
          params: { status_id: new_status.id }.to_json,
          headers: { 'Content-Type' => 'application/json', 'Accept' => 'application/json',
                     'X-CSRF-Token' => 'test' }
    assert_response :success
    json = JSON.parse(response.body)
    assert json['success']
    assert_equal new_status.id, json['status_id']
    assert_includes [true, false], json['is_closed']
    assert json['message'].present?
  end

  test 'update_status returns 404 for missing issue' do
    log_user('jsmith', 'jsmith')
    patch project_kanban_update_status_path(@project, 999999),
          params: { status_id: 1 }.to_json,
          headers: { 'Content-Type' => 'application/json', 'Accept' => 'application/json',
                     'X-CSRF-Token' => 'test' }
    assert_response :not_found
    json = JSON.parse(response.body)
    assert_not json['success']
  end
end
