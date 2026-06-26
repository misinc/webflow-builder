ALTER TABLE section_workflow_states
  ADD COLUMN placed_root_node_id TEXT;

ALTER TABLE section_workflow_states
  ADD COLUMN node_id_map_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE section_workflow_states
  ADD COLUMN skeleton_placed_at TEXT;

ALTER TABLE section_workflow_states
  ADD COLUMN skeleton_approved_at TEXT;

ALTER TABLE section_workflow_states
  ADD COLUMN styled_at TEXT;
