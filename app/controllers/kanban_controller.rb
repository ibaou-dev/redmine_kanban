class KanbanController < ApplicationController
  before_action :find_optional_project
  before_action :authorize,        only: [:show], if: -> { @project.present? }
  before_action :authorize_global, only: [:show], if: -> { @project.nil? }

  helper :queries
  include QueriesHelper
  helper :issues
  include IssuesHelper

  def show
    retrieve_query(IssueQuery)

    if @query.valid?
      @issues = @query.issues(
        include: [:status, :tracker, :priority, :assigned_to, :project, :author],
        limit:   500
      )
      @statuses     = available_statuses
      @columns      = build_columns(@issues, @statuses)
      @wip_limits   = {}
      @subtask_counts = build_subtask_counts(@issues)
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
    if @project
      tracker_ids = @project.trackers.pluck(:id)
      IssueStatus.joins(:workflows)
                 .where(workflows: { tracker_id: tracker_ids, type: 'WorkflowTransition' })
                 .distinct
                 .sorted
                 .presence || IssueStatus.sorted
    else
      IssueStatus.sorted
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
