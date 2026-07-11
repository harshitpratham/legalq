import type {
  AuditEventType,
  MessageAuthorType,
  MessageDirection,
  TicketCategory,
  TicketStatus,
  Urgency,
} from "@prisma/client";

export const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review / Needs Info" },
  { value: "COMPLETE", label: "Complete" },
];

export const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "AGREEMENT", label: "Agreement" },
  { value: "DATA_PROTECTION", label: "Data Protection" },
  { value: "OTHER", label: "Other" },
];

export const URGENCY_LEVELS: { value: Urgency; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  CREATED: "Created",
  STATUS_CHANGED: "Status changed",
  COMMENT_ADDED: "Comment added",
  EMAIL_SENT: "Email sent",
  EMAIL_RECEIVED: "Email received",
  REMINDER_SENT: "Reminder sent",
  CATEGORY_CHANGED: "Category changed",
  ASSIGNEE_CHANGED: "Assignee changed",
  DUE_DATE_CHANGED: "Due date changed",
  SUMMARY_REFRESHED: "AI summary refreshed",
  USER_CREATED: "User created",
  USER_UPDATED: "User updated",
  USER_DEACTIVATED: "User deactivated",
};

export type TransitionPayload = {
  status: TicketStatus;
  comment?: string;
  notifyStakeholder?: boolean;
};

export { AuditEventType, MessageAuthorType, MessageDirection, TicketCategory, TicketStatus, Urgency };
