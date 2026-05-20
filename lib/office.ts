import type { UserRole } from '@/lib/workflow';

export const OFFICE_OPTIONS = ['Office A'] as const;
export type OfficeOption = (typeof OFFICE_OPTIONS)[number];
export const DEFAULT_OFFICE: OfficeOption = 'Office A';

const OFFICE_GATED_ROLES: ReadonlySet<UserRole> = new Set(['QS', 'SENIOR_QS', 'SALES', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_TEAM']);

export function isOfficeOption(office: string | null | undefined): office is OfficeOption {
  return OFFICE_OPTIONS.includes(office as OfficeOption);
}

export function normalizeOffice(office: string | null | undefined): OfficeOption {
  return DEFAULT_OFFICE;
}

export function rolesRequireOffice(role: UserRole): boolean {
  return OFFICE_GATED_ROLES.has(role);
}

export function resolveOfficeForRole(role: UserRole | null, office: string | null | undefined): string | null {
  if (!role) return office ?? null;
  if (!rolesRequireOffice(role)) return office ?? null;
  if (!office) {
    throw new Error('Your office is not configured. Please contact an administrator.');
  }
  return office;
}

export function ensureQuoteOffice(
  quoteOffice: string | null,
  role: UserRole,
  userOffice: string | null | undefined,
): string | null {
  const resolved = resolveOfficeForRole(role, userOffice);
  if (!rolesRequireOffice(role)) {
    return quoteOffice ?? resolved;
  }
  if (quoteOffice && resolved && quoteOffice !== resolved) {
    throw new Error('This quote belongs to a different office');
  }
  return quoteOffice ?? resolved;
}

export function officesDiffer(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a !== b;
}

export { OFFICE_GATED_ROLES };
