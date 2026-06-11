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

export type TransitionPayload = {
  status: TicketStatus;
  comment?: string;
  notifyStakeholder?: boolean;
};

export { AuditEventType, MessageAuthorType, MessageDirection, TicketCategory, TicketStatus, Urgency };
