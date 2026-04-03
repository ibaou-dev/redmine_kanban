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

  def kanban_subtask_badge(issue)
    counts = @subtask_counts&.dig(issue.id)
    return ''.html_safe unless counts

    done  = counts[:done]
    total = counts[:total]
    css   = if done == total then 'kb-subtasks-done'
            elsif done == 0  then 'kb-subtasks-none'
            else                  'kb-subtasks-partial'
            end
    label = done == total ? "&#10003; #{done}/#{total}" : "#{done}/#{total}"
    content_tag(:span, label.html_safe,
      class: "kb-subtask-badge #{css}",
      title: "#{done} of #{total} subtasks closed")
  end
end
