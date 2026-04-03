module KanbanHelper
  def kanban_card_classes(issue)
    classes = ['kb-card']
    classes << "kb-priority-#{issue.priority.position}" if issue.priority
    classes << "kb-tracker-#{issue.tracker.name.parameterize}" if issue.tracker
    classes << 'kb-closed' if issue.closed?
    classes << 'kb-overdue' if issue.overdue?
    classes.join(' ')
  end

  def kanban_allowed_statuses_json(issue)
    allowed = issue.new_statuses_allowed_to(User.current)
    allowed.map(&:id).join(',')
  end

  def kanban_priority_label(issue)
    return '' unless issue.priority && issue.priority.position >= 3
    content_tag(:span, issue.priority.name,
      class: "kb-priority-badge kb-priority-#{issue.priority.name.parameterize}",
      title: issue.priority.name)
  end

  def kanban_assignee_cell(user)
    if user
      content_tag(:span, avatar(user, size: '24'),
        class: 'kb-assignee-avatar',
        title: user.name)
    else
      content_tag(:span, '?',
        class: 'kb-assignee-avatar kb-unassigned',
        title: l(:label_nobody))
    end
  end

  def kanban_update_status_url(project, issue)
    if project
      project_kanban_update_status_path(project, issue)
    else
      "/kanban/issues/#{issue.id}/update_status"
    end
  end
end
