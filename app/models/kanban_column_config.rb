class KanbanColumnConfig < ActiveRecord::Base
  belongs_to :project
  belongs_to :status, class_name: 'IssueStatus', foreign_key: 'status_id'

  validates :project_id, :status_id, presence: true
  validates :status_id, uniqueness: { scope: :project_id }
  validates :wip_limit, numericality: { only_integer: true, greater_than: 0, allow_nil: true }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
end
