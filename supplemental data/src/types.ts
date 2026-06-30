/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TimeEntry {
  id: string;
  project: string;
  category: string;
  task: string;
  notes: string;
  startTime: string; // ISO string
  endTime?: string;  // ISO string
  durationSeconds: number;
  appName?: string;
  urlContext?: string;
  mondayBoardId?: string;
  mondayItemId?: string;
  mondayTaskName?: string;
  mondayBoardName?: string;
  mondayStatus?: string;
  mondayAssignee?: string;
  mondayDueDate?: string;
}

export interface AppAssociation {
  appName: string;
  project: string;
  category: string;
  taskHint: string;
  autoTrack: boolean;
}

export interface MondayBoardAssociation {
  boardId: string;
  boardName: string;
  project: string;
  category: string;
  autoTrack: boolean;
}

export interface AppSettings {
  pingSound: boolean;
  idleDetect: boolean;
  idleThresholdMin: number;
  eodEnabled: boolean;
  eodTime: string; // "17:00" etc
  mondayApiToken: string;
}
