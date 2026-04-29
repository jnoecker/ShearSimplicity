export const Role = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  STYLIST: "STYLIST",
  RECEPTIONIST: "RECEPTIONIST",
  ASSISTANT: "ASSISTANT",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AppointmentStatus = {
  SCHEDULED: "SCHEDULED",
  CONFIRMED: "CONFIRMED",
  CHECKED_IN: "CHECKED_IN",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;
export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const PaymentStatus = {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  CANCELLED: "CANCELLED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const MessageDirection = {
  OUTBOUND: "OUTBOUND",
  INBOUND: "INBOUND",
} as const;
export type MessageDirection =
  (typeof MessageDirection)[keyof typeof MessageDirection];

export const MessageStatus = {
  QUEUED: "QUEUED",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  RECEIVED: "RECEIVED",
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const OutboxStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DEAD_LETTER: "DEAD_LETTER",
} as const;
export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];

export const ActorType = {
  USER: "USER",
  SYSTEM: "SYSTEM",
  CLIENT: "CLIENT",
  WEBHOOK: "WEBHOOK",
  AI_AGENT: "AI_AGENT",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const AggregateType = {
  APPOINTMENT: "APPOINTMENT",
  CLIENT: "CLIENT",
  PAYMENT: "PAYMENT",
  MESSAGE: "MESSAGE",
  STAFF_MEMBER: "STAFF_MEMBER",
  SERVICE: "SERVICE",
  SALON: "SALON",
} as const;
export type AggregateType = (typeof AggregateType)[keyof typeof AggregateType];

export const EventType = {
  APPOINTMENT_CREATED: "appointment.created",
  APPOINTMENT_RESCHEDULED: "appointment.rescheduled",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  APPOINTMENT_CHECKED_IN: "appointment.checked_in",
  APPOINTMENT_STARTED: "appointment.started",
  APPOINTMENT_COMPLETED: "appointment.completed",
  APPOINTMENT_NO_SHOWED: "appointment.no_showed",

  PAYMENT_CREATED: "payment.created",
  PAYMENT_SUCCEEDED: "payment.succeeded",
  PAYMENT_REFUNDED: "payment.refunded",

  MESSAGE_SMS_SENT: "message.sms_sent",
  MESSAGE_SMS_RECEIVED: "message.sms_received",

  CLIENT_CREATED: "client.created",
  CLIENT_UPDATED: "client.updated",

  STAFF_CREATED: "staff.created",
  STAFF_UPDATED: "staff.updated",
  WORKING_HOURS_UPDATED: "staff.working_hours_updated",

  SERVICE_CATEGORY_CREATED: "service_category.created",
  SERVICE_CATEGORY_UPDATED: "service_category.updated",
  SERVICE_CREATED: "service.created",
  SERVICE_UPDATED: "service.updated",

  SALON_UPDATED: "salon.updated",

  AI_DURATION_ESTIMATE_GENERATED: "ai.duration_estimate_generated",
  AI_RECOMMENDATION_SHOWN: "ai.recommendation_shown",
  AI_RECOMMENDATION_ACCEPTED: "ai.recommendation_accepted",
  AI_RECOMMENDATION_REJECTED: "ai.recommendation_rejected",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const PredictionConfidence = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;
export type PredictionConfidence =
  (typeof PredictionConfidence)[keyof typeof PredictionConfidence];
