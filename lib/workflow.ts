export const USER_ROLES = [
  'QS',
  'SENIOR_QS',
  'SALES',
  'SALES_ACCOUNTS',
  'ADMIN',
  'DEPUTY_ADMIN',
  'CLIENT',
  'VIEWER',
  'PROJECT_OPERATIONS_OFFICER',
  'PROJECT_COORDINATOR',
  'PROCUREMENT',
  'SENIOR_PROCUREMENT',
  'SECURITY',
  'ACCOUNTS',
  'CASHIER',
  'ACCOUNTING_OFFICER',
  'ACCOUNTING_AUDITOR',
  'ACCOUNTING_CLERK',
  'DRIVER',
  'PM_CLERK',
  'GENERAL_MANAGER',
  'MANAGING_DIRECTOR',
  'FOREMAN',
  'HUMAN_RESOURCE',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const QUOTE_STATUSES = [
  'DRAFT',
  'SUBMITTED_REVIEW',
  'REVIEWED',
  'SENT_TO_SALES',
  'NEGOTIATION',
  'NEGOTIATION_REVIEW',
  'FINALIZED',
  'ARCHIVED',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const NEGOTIATION_STATUSES = ['OPEN', 'AGREED', 'REJECTED', 'CLOSED'] as const;
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];

export type StatusTransitionRule = {
  from: QuoteStatus[];
  roles: UserRole[];
};

export const STATUS_TRANSITION_RULES: Partial<Record<QuoteStatus, StatusTransitionRule>> = {
  SUBMITTED_REVIEW: { from: ['DRAFT'], roles: ['QS'] },
  SENT_TO_SALES: { from: ['SUBMITTED_REVIEW'], roles: ['SENIOR_QS'] },
  NEGOTIATION: { from: ['SENT_TO_SALES'], roles: ['SALES'] },
  NEGOTIATION_REVIEW: { from: ['NEGOTIATION'], roles: ['SALES'] },
  REVIEWED: { from: ['NEGOTIATION', 'NEGOTIATION_REVIEW'], roles: ['SALES', 'SENIOR_QS'] }, // Sales for auto-accept, Senior QS for review
  FINALIZED: { from: ['NEGOTIATION'], roles: ['SENIOR_QS'] }, // Keeping this/Adjusting as needed. Actually FINALIZED usually comes after negotiation.
  // Wait, existing rule was FINALIZED: { from: ['NEGOTIATION'], roles: ['SENIOR_QS'] }
  // I should check if FINALIZED is still reachable or if REVIEWED is the target.
  // The plan says NEGOTIATION_REVIEW -> REVIEWED.
  // And NEGOTIATION -> REVIEWED (Auto accept).
  // FINALIZED might be legacy or for another flow?
  // Let's keep FINALIZED as is but add the new ones.
  // Actually, verify existing FINALIZED rule.

  ARCHIVED: { from: ['FINALIZED'], roles: ['ADMIN'] },
};

const ADMIN_ROLE: UserRole = 'ADMIN';

export function hasRole(userRole: UserRole | null | undefined, roles: UserRole[]): boolean {
  if (!userRole) return false;
  if (userRole === ADMIN_ROLE) return true;
  return roles.includes(userRole);
}

export function canTransition(role: UserRole, from: QuoteStatus, to: QuoteStatus): boolean {
  if (role === ADMIN_ROLE) return true;
  const rule = STATUS_TRANSITION_RULES[to];
  if (!rule) return false;
  return rule.from.includes(from) && rule.roles.includes(role);
}

export function nextStatusesFor(role: UserRole, current: QuoteStatus): QuoteStatus[] {
  const entries = Object.entries(STATUS_TRANSITION_RULES) as [QuoteStatus, StatusTransitionRule][];
  return entries
    .filter(([status, rule]) => rule.from.includes(current) && (role === ADMIN_ROLE || rule.roles.includes(role)))
    .map(([status]) => status);
}

export function assertRole(role: string | null | undefined): UserRole {
  if (!role) throw new Error('Unsupported user role');
  const value = String(role) as UserRole;
  if ((USER_ROLES as readonly string[]).includes(value)) return value as UserRole;
  throw new Error('Unsupported user role');
}

// Lightweight guard for server actions/pages
export function assertRoles(role: string | undefined | null, allowed: UserRole[]) {
  if (!role || !allowed.includes(role as UserRole)) throw new Error('Not allowed');
}
