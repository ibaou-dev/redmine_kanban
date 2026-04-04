class CreateKanbanColumnConfigs < ActiveRecord::Migration[7.0]
  def change
    create_table :kanban_column_configs do |t|
      t.integer :project_id, null: false
      t.integer :status_id,  null: false
      t.integer :wip_limit            # null = no limit
      t.boolean :visible,   null: false, default: true
      t.integer :position,  null: false, default: 0
    end

    add_index :kanban_column_configs, [:project_id, :status_id], unique: true
    add_index :kanban_column_configs, :project_id
  end
end
