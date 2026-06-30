export interface TimeEntry {
  id: number;
  project: string;
  category?: string;
  task: string;
  notes?: string;
  start_time: string; // ISO String
  end_time?: string;   // ISO String
  duration_seconds?: number;
  app_name?: string;
  url_context?: string;
  monday_board_id?: string;
  monday_item_id?: string;
  task_name?: string;
  board_name?: string;
  status?: string;
  assignee?: string;
  due_date?: string;
  ns_project?: string;
  ns_task?: string;
  ns_service_item?: string;
}

export interface AppAssociation {
  app_name: string; // Lowercase app name or domain
  project: string;
  category?: string;
  task_hint?: string;
  auto_track: number; // 0 or 1 (boolean representation in SQL)
  ns_project?: string;
  ns_task?: string;
  ns_service_item?: string;
}

export interface MondayBoard {
  board_id: string;
  board_name?: string;
  project: string;
  category?: string;
  auto_track: number; // 0 or 1
}

export interface SystemSettings {
  MONDAY_API_TOKEN?: string;
  REVIEW_BOARD_ID?: string;
  REVIEW_HOUR?: string;
  REVIEW_PERIOD?: string;
}
