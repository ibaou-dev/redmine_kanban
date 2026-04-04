class KanbanController < ApplicationController
  before_action :find_optional_project

  helper :queries
  include QueriesHelper
  helper :issues
  include IssuesHelper

  def show
    retrieve_query(IssueQuery)

    if @query.valid?
      @total_count = @query.issue_count
      @issues = @query.issues(
        include: [:status, :tracker, :priority, :assigned_to, :project, :author,
                  :fixed_version, :category],
        limit:   500
      )
      @truncated        = @total_count > 500
      @statuses         = available_statuses
      @wip_limits       = load_wip_limits
      @subtask_counts   = build_subtask_counts(@issues)
      @attachment_counts = build_attachment_counts(@issues)
      @blocked_ids      = build_blocked_ids(@issues)

      @kb_group_by = params[:kb_group_by].presence
      @kb_group_by = session[:kanban_group_by] if @kb_group_by.nil?
      @kb_group_by = nil if @kb_group_by.blank?
      session[:kanban_group_by] = @kb_group_by

      if @kb_group_by.present?
        @swimlanes = build_swimlanes(@issues, @statuses, @kb_group_by)
        @status_counts = @issues.group_by(&:status_id).transform_values(&:size)
      else
        @columns = build_columns(@issues, @statuses)
      end
    end

    respond_to do |format|
      format.html { render layout: !request.xhr? }
    end
  end

  def update_status
    @issue = Issue.find(params[:id])

    unless User.current.allowed_to?(:manage_kanban, @issue.project)
      render json: { success: false, error: l(:error_kanban_unauthorized) },
             status: :forbidden
      return
    end

    new_status_id = params[:status_id].to_i
    allowed_statuses = @issue.new_statuses_allowed_to(User.current)

    unless allowed_statuses.any? { |s| s.id == new_status_id }
      render json: {
        success:            false,
        error:              l(:error_kanban_transition_not_allowed),
        allowed_status_ids: allowed_statuses.map(&:id)
      }, status: :unprocessable_entity
      return
    end

    @issue.init_journal(User.current)
    @issue.safe_attributes = { 'status_id' => new_status_id.to_s }

    if @issue.save
      render json: {
        success:   true,
        issue_id:  @issue.id,
        status_id: @issue.status_id,
        is_closed: @issue.status.is_closed?,
        message:   l(:notice_kanban_status_updated)
      }
    else
      render json: {
        success: false,
        error:   l(:error_kanban_save_failed, errors: @issue.errors.full_messages.join(', '))
      }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotFound
    render json: { success: false, error: l(:error_kanban_issue_not_found) },
           status: :not_found
  end

  private

  def available_statuses
    base = if @project
      tracker_ids = @project.trackers.pluck(:id)
      IssueStatus.joins(:workflows)
                 .where(workflows: { tracker_id: tracker_ids, type: 'WorkflowTransition' })
                 .distinct
                 .sorted
                 .presence || IssueStatus.sorted
    else
      IssueStatus.sorted
    end

    if @project && ::KanbanColumnConfig.table_exists?
      configs = ::KanbanColumnConfig.where(project: @project).to_a
      if configs.any?
        visible_ids = configs.select(&:visible).map(&:status_id).to_set
        pos_map     = configs.each_with_object({}) { |c, h| h[c.status_id] = c.position }
        base = base.select { |s| visible_ids.include?(s.id) }
                   .sort_by { |s| pos_map[s.id] || 9999 }
      end
    end

    base
  end

  def load_wip_limits
    return {} unless @project && ::KanbanColumnConfig.table_exists?
    ::KanbanColumnConfig.where(project: @project)
                      .each_with_object({}) { |c, h| h[c.status_id] = c.wip_limit if c.wip_limit }
  end

  def build_attachment_counts(issues)
    return {} if issues.empty?
    Attachment.where(container_type: 'Issue', container_id: issues.map(&:id))
              .group(:container_id)
              .count
  end

  def build_blocked_ids(issues)
    return Set.new if issues.empty?
    IssueRelation
      .where(relation_type: IssueRelation::TYPE_BLOCKS, issue_to_id: issues.map(&:id))
      .joins("INNER JOIN issues blocker ON blocker.id = issue_relations.issue_from_id")
      .joins("INNER JOIN issue_statuses bs ON bs.id = blocker.status_id")
      .where("bs.is_closed = ?", false)
      .pluck(:issue_to_id)
      .to_set
  end

  def build_swimlanes(issues, statuses, group_by)
    attr = SWIMLANE_ATTRS[group_by]
    return [] unless attr

    grouped = issues.group_by { |i| i.public_send(attr) }
    sorted  = grouped.sort_by { |k, _| swimlane_sort_key(k) }

    sorted.map do |value, group_issues|
      {
        label:   value ? value.name : l(:label_none),
        key:     value ? "#{value.class.name.underscore}_#{value.id}" : 'none',
        count:   group_issues.size,
        columns: build_columns(group_issues, statuses)
      }
    end
  end

  SWIMLANE_ATTRS = {
    'assigned_to'   => 'assigned_to',
    'tracker'       => 'tracker',
    'priority'      => 'priority',
    'fixed_version' => 'fixed_version',
    'category'      => 'category'
  }.freeze

  def swimlane_sort_key(value)
    return [1, ''] if value.nil?
    case value
    when IssuePriority then [0, value.position]
    else [0, value.name.to_s.downcase]
    end
  end

  def build_subtask_counts(issues)
    parent_ids = issues.reject(&:leaf?).map(&:id)
    return {} if parent_ids.empty?

    Issue.where(parent_id: parent_ids)
         .joins(:status)
         .group(:parent_id)
         .pluck(
           :parent_id,
           Arel.sql('COUNT(*)'),
           Arel.sql("SUM(CASE WHEN #{IssueStatus.table_name}.is_closed = #{Issue.connection.quoted_true} THEN 1 ELSE 0 END)")
         )
         .each_with_object({}) { |(pid, total, done), h| h[pid] = { total: total, done: done.to_i } }
  end

  def build_columns(issues, statuses)
    grouped = issues.group_by(&:status_id)
    statuses.map do |status|
      {
        status:    status,
        issues:    grouped[status.id] || [],
        count:     (grouped[status.id] || []).size,
        closed:    status.is_closed?
      }
    end
  end
end
