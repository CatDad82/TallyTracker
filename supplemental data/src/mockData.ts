/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeEntry, AppAssociation, MondayBoardAssociation, AppSettings } from "./types";

export const INITIAL_PROJECTS = ["Client A", "Client B", "Admin Operations", "Internal Team", "Learning"];
export const INITIAL_CATEGORIES = ["Deep Focus", "Meetings", "General Admin", "Email Review", "Market Research", "Rest Break"];

export const DEFAULT_SETTINGS: AppSettings = {
  pingSound: true,
  idleDetect: true,
  idleThresholdMin: 5,
  eodEnabled: true,
  eodTime: "17:00",
  mondayApiToken: "eyJhY2NvdW50SWQiOjEyMzQ1LCJ1c2VySWQiOiI5ODc2NSIsImlhdCI6MTY4NjY2MDAwMCwiZXhwIjoxNjg2OTYwMDAwfQ",
};

export const INITIAL_ASSOCIATIONS: AppAssociation[] = [
  {
    appName: "Word",
    project: "Client A",
    category: "Deep Focus",
    taskHint: "Drafting campaign proposal",
    autoTrack: true,
  },
  {
    appName: "Excel",
    project: "Client B",
    category: "Market Research",
    taskHint: "Analyzing budget excel sheets",
    autoTrack: true,
  },
  {
    appName: "Slack",
    project: "Internal Team",
    category: "Meetings",
    taskHint: "Morning team check-in",
    autoTrack: true,
  },
  {
    appName: "Google Chrome",
    project: "Client A",
    category: "Market Research",
    taskHint: "Browsing project templates",
    autoTrack: true,
  },
  {
    appName: "Microsoft Outlook",
    project: "Admin Operations",
    category: "Email Review",
    taskHint: "Daily email review",
    autoTrack: true,
  },
];

export const INITIAL_MONDAY_BOARDS: MondayBoardAssociation[] = [
  {
    boardId: "8172901",
    boardName: "Client A Weekly Campaign Planning",
    project: "Client A",
    category: "Deep Focus",
    autoTrack: true,
  },
  {
    boardId: "9283120",
    boardName: "Client B Brand Strategy Review",
    project: "Client B",
    category: "Market Research",
    autoTrack: true,
  },
  {
    boardId: "1102911",
    boardName: "Internal Office Operations",
    project: "Admin Operations",
    category: "General Admin",
    autoTrack: true,
  },
];

// Generate sample records spanning today and yesterday
const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

export const INITIAL_ENTRIES: TimeEntry[] = [
  // Yesterday's activities
  {
    id: "mock-1",
    project: "Client A",
    category: "Deep Focus",
    task: "Reviewed Campaign Proposal & Drafted Marketing Assets",
    notes: "Polished the initial proposal deck and updated visual templates for the client team.",
    startTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 9, 15, 0).toISOString(),
    endTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 11, 45, 0).toISOString(),
    durationSeconds: 9000, // 2h 30m
    appName: "Word",
  },
  {
    id: "mock-2",
    project: "Admin Operations",
    category: "Meetings",
    task: "Weekly Department Planning Session",
    notes: "Discussed team capacity, upcoming deliverables, and client onboarding milestones.",
    startTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 13, 0, 0).toISOString(),
    endTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 14, 0, 0).toISOString(),
    durationSeconds: 3600, // 1h
    appName: "Slack",
  },
  {
    id: "mock-3",
    project: "Client B",
    category: "Market Research",
    task: "Reviewed Competitor Brand Strategy & Market Positioning",
    notes: "Prepared key summary recommendations and shared a competitive review deck.",
    startTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 14, 30, 0).toISOString(),
    endTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 16, 15, 0).toISOString(),
    durationSeconds: 6300, // 1h 45m
    appName: "Google Chrome",
    urlContext: "https://monday.com/boards/9283120/pulses/44222",
    mondayBoardId: "9283120",
    mondayItemId: "44222",
    mondayTaskName: "Audit Competitor Social Media Performance",
    mondayBoardName: "Client B Brand Strategy Review",
    mondayStatus: "In Progress",
    mondayAssignee: "Jane Doe",
    mondayDueDate: "2026-06-25",
  },
  {
    id: "mock-4",
    project: "Internal Team",
    category: "Email Review",
    task: "Organized pending client emails & follow-ups",
    notes: "Cleared outstanding inbox items and sent out weekly progress updates.",
    startTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 16, 30, 0).toISOString(),
    endTime: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 17, 10, 0).toISOString(),
    durationSeconds: 2400, // 40m
    appName: "Microsoft Outlook",
  },
  // Today's activities
  {
    id: "mock-5",
    project: "Client A",
    category: "Deep Focus",
    task: "Drafted Monday.com Board Integrations & Automation Plan",
    notes: "Verified system integration rules and logged client task tracking templates to align with client expectations.",
    startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).toISOString(),
    endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 20, 0).toISOString(),
    durationSeconds: 8400, // 2h 20m
    appName: "Google Chrome",
    urlContext: "https://monday.com/boards/8172901/pulses/75532",
    mondayBoardId: "8172901",
    mondayItemId: "75532",
    mondayTaskName: "Set Up Client Feedback Integration",
    mondayBoardName: "Client A Weekly Campaign Planning",
    mondayStatus: "Done",
    mondayAssignee: "John Smith",
    mondayDueDate: "2026-06-20",
  },
  {
    id: "mock-6",
    project: "Rest Break",
    category: "Rest Break",
    task: "Coffee Break & Stretching routine",
    notes: "Quick movement break away from desk to stay refreshed.",
    startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 25, 0).toISOString(),
    endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 45, 0).toISOString(),
    durationSeconds: 1200, // 20m
  },
  {
    id: "mock-7",
    project: "Client B",
    category: "Deep Focus",
    task: "Designed Presentation Slides & Report Layouts",
    notes: "Created slide presentation themes and structured the layout for quarterly campaign reporting.",
    startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0, 0).toISOString(),
    endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 30, 0).toISOString(),
    durationSeconds: 9000, // 2h 30m
    appName: "PowerPoint",
  },
];
