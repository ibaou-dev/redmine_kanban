require File.expand_path('../../../test_helper', __FILE__)

class KanbanHelperTest < ActionView::TestCase
  include KanbanHelper
  include ApplicationHelper
  include AvatarsHelper

  fixtures :projects, :users, :trackers, :issue_statuses, :issues,
           :enumerations, :issue_categories, :versions

  def setup
    @project = Project.find(1)
    @subtask_counts   = {}
    @attachment_counts = {}
    @blocked_ids      = Set.new
    User.current      = User.find_by(login: 'jsmith')
  end

  test 'kanban_card_classes includes kb-card base class' do
    issue = Issue.find(1)
    assert_includes kanban_card_classes(issue), 'kb-card'
  end

  test 'kanban_card_classes adds kb-priority class by position' do
    issue = Issue.find(1)
    pos   = issue.priority.position
    assert_includes kanban_card_classes(issue), "kb-priority-#{pos}"
  end

  test 'kanban_card_classes adds kb-closed for closed issues' do
    issue = Issue.find(1)
    issue.stubs(:closed?).returns(true)
    assert_includes kanban_card_classes(issue), 'kb-closed'
  end

  test 'kanban_card_classes adds kb-overdue for overdue issues' do
    issue = Issue.find(1)
    issue.stubs(:overdue?).returns(true)
    assert_includes kanban_card_classes(issue), 'kb-overdue'
  end

  test 'kanban_allowed_statuses_json returns comma-separated ids' do
    issue = Issue.find(1)
    result = kanban_allowed_statuses_json(issue)
    assert_match(/\A[\d,]*\z/, result)
  end

  test 'kanban_subtask_badge returns empty string when no counts' do
    issue = Issue.find(1)
    assert_equal ''.html_safe, kanban_subtask_badge(issue)
  end

  test 'kanban_subtask_badge returns done badge when all closed' do
    issue = Issue.find(1)
    @subtask_counts = { issue.id => { done: 3, total: 3 } }
    html = kanban_subtask_badge(issue)
    assert_includes html, 'kb-subtasks-done'
    assert_includes html, '3/3'
  end

  test 'kanban_subtask_badge returns partial badge' do
    issue = Issue.find(1)
    @subtask_counts = { issue.id => { done: 1, total: 4 } }
    html = kanban_subtask_badge(issue)
    assert_includes html, 'kb-subtasks-partial'
    assert_includes html, '1/4'
  end

  test 'kanban_subtask_badge returns none badge when zero done' do
    issue = Issue.find(1)
    @subtask_counts = { issue.id => { done: 0, total: 2 } }
    html = kanban_subtask_badge(issue)
    assert_includes html, 'kb-subtasks-none'
    assert_includes html, '0/2'
  end

  test 'kanban_priority_label returns empty for low priority positions' do
    issue = Issue.find(1)
    issue.priority.stubs(:position).returns(1)
    assert_equal '', kanban_priority_label(issue)
  end

  test 'kanban_priority_label returns badge for high priority' do
    issue = Issue.find(1)
    issue.priority.stubs(:position).returns(4)
    html = kanban_priority_label(issue)
    assert_includes html, 'kb-priority-badge'
  end

  test 'kanban_assignee_cell renders unassigned placeholder for nil' do
    html = kanban_assignee_cell(nil)
    assert_includes html, 'kb-unassigned'
  end

  test 'kanban_assignee_cell renders avatar for assigned user' do
    user = User.find_by(login: 'jsmith')
    html = kanban_assignee_cell(user)
    assert_includes html, 'kb-assignee-avatar'
    assert_includes html, user.name
  end
end
