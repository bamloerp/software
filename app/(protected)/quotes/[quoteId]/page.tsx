import clsx from 'clsx';

import Link from 'next/link';

import { revalidatePath } from 'next/cache';

import LoadingButton from '@/components/LoadingButton';
import DownloadPdfButton from '@/components/DownloadPdfButton';

import Money from '@/components/Money';

import { finalizeQuote, transitionQuoteStatus } from '@/app/(protected)/actions';

import {
  closeNegotiation,
  assignProjectManager,
  createProjectTask,
  updateProjectTask,
  endorseQuote,
  endorseQuoteToProject,
  generateQuotePdf,
} from '@/app/(protected)/quotes/[quoteId]/actions';

import DeleteLineButton from '@/components/DeleteLineButton';
import AddLineForm from '@/components/AddLineForm';
import DeleteSectionButton from '@/components/DeleteSectionButton';
import LabourNoteEditor from '@/components/LabourNoteEditor';

import {
  DocumentTextIcon,
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  TagIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PaperAirplaneIcon,
  ArchiveBoxIcon,
  ArrowRightCircleIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { PhoneIcon, HomeIcon, EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';

import { prisma } from '@/lib/db';

import { getCurrentUser } from '@/lib/auth';

import { fromMinor } from '@/helpers/money';

import { QuoteStatus, QUOTE_STATUSES, USER_ROLES, UserRole, nextStatusesFor } from '@/lib/workflow';

import { parseQuoteSnapshot, type QuoteSnapshot } from '@/lib/quoteSnapshot';

import type { QuoteLine, QuoteNegotiation, QuoteNegotiationItem } from '@prisma/client';

import { NegotiationActionPair } from '@/components/NegotiationActionPair';

import LineRateEditor from '@/components/LineRateEditor';
import { ensureQuoteOffice } from '@/lib/office';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash.server';
import { getErrorMessage } from '@/lib/errors';
import SubmitButton from '@/components/SubmitButton';
import QSEditButton from '@/components/QSEditButton';
import QuoteHeader from '@/components/QuoteHeader';
import SalesEndorsementForm from './SalesEndorsementForm';
import NegotiationsList from './NegotiationsList';
import QuoteNotes from '@/components/QuoteNotes';
import { updateQuoteNotes } from './actions';
import {
  compareConstructionSummaryCategories,
  getConstructionSummaryCategory,
  type ConstructionSummaryCategory,
} from '@/lib/constructionSummary';

const USER_ROLE_SET = new Set<UserRole>(USER_ROLES as unknown as UserRole[]);

const QUOTE_STATUS_SET = new Set<QuoteStatus>(QUOTE_STATUSES as unknown as QuoteStatus[]);

const STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',

  SUBMITTED_REVIEW: 'Submitted for Review',

  REVIEWED: 'Reviewed',

  SENT_TO_SALES: 'Sent to Sales',

  NEGOTIATION: 'Negotiation',

  FINALIZED: 'Finalized',

  ARCHIVED: 'Archived',
};

const STATUS_BADGE_CLASSES: Record<QuoteStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',

  SUBMITTED_REVIEW: 'bg-blue-100 text-blue-700',

  REVIEWED: 'bg-emerald-100 text-emerald-700',

  SENT_TO_SALES: 'bg-amber-100 text-amber-700',

  NEGOTIATION: 'bg-purple-100 text-purple-700',

  FINALIZED: 'bg-green-100 text-green-700',

  ARCHIVED: 'bg-gray-200 text-gray-600',
};

const STATUS_BUTTON_LABELS: Partial<Record<QuoteStatus, string>> = {
  SUBMITTED_REVIEW: 'Submit for Review',

  REVIEWED: 'Mark Reviewed',

  SENT_TO_SALES: 'Send to Sales',

  NEGOTIATION: 'Move to Negotiation',

  ARCHIVED: 'Archive',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',

  IN_PROGRESS: 'In Progress',

  DONE: 'Completed',
};

export const NEGOTIATION_BADGE_CLASSES: Record<LineNegotiationInfo['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',

  OK: 'bg-blue-100 text-blue-700',

  ACCEPTED: 'bg-emerald-100 text-emerald-700',

  REJECTED: 'bg-red-100 text-red-700',

  REVIEWED: 'bg-indigo-100 text-indigo-700',

  FINAL: 'bg-indigo-100 text-indigo-700',
};

function coerceUserRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;

  return USER_ROLE_SET.has(role as UserRole) ? (role as UserRole) : null;
}

function normalizeStatus(status: string): QuoteStatus {
  if (QUOTE_STATUS_SET.has(status as QuoteStatus)) {
    return status as QuoteStatus;
  }

  throw new Error(`Unknown quote status: ${status}`);
}

type LineNegotiationInfo = {
  status: 'PENDING' | 'OK' | 'ACCEPTED' | 'REJECTED' | 'REVIEWED' | 'FINAL';

  proposedTotal: number;

  proposedRate: number;

  itemId: string;

  reviewerName: string | null;

  reviewedAt: Date | null;

  negotiationStatus: string;
};

type LineRow = {
  id: string;

  description: string;

  unit: string | null;

  qty: number;

  rate: number;

  amount: number;

  source: string | null;

  addedVersion: number | null;

  negotiation: LineNegotiationInfo | null;

  cycle: number;

  isCurrentCycle: boolean;

  itemType: string | null;

  labourNote: string | null;
};

type LineGroup = {
  key: string;

  section: string;

  /** Display label (e.g. "FOUNDATIONS" or "LABOUR - FOUNDATIONS") */
  label: string;

  summaryCategory: ConstructionSummaryCategory;

  /** true when this group holds labour items */
  isLabour: boolean;

  rows: LineRow[];

  subtotal: number;
};

type QuoteTotals = {
  subtotal: number;
  discount: number;
  net: number;
  tax: number;
  grandTotal: number;
};

type VersionDiff = {
  totalDelta: number | null;
  lineChanges: Array<{ lineId: string; description: string; previous?: number; current: number }>;
  removed: Array<{ lineId: string; description: string; amount: number }>;
};

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function deriveRateFromTotal(total: number, quantity: number, vatRate: number): number {
  if (!(quantity > 0) || !Number.isFinite(total)) {
    return 0;
  }
  // const netTotal = total / (1 + vatRate);
  // Stored total is already NET.
  const netTotal = total;
  return Number((netTotal / quantity).toFixed(2));
}

function deriveRateFromMinor(
  totalMinor: bigint | number,
  quantity: number,
  vatRate: number
): number {
  return deriveRateFromTotal(fromMinor(totalMinor), quantity, vatRate);
}

function formatDecisionLabel(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPercentRate(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }

  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toFixed(Number.isInteger(rounded) ? 0 : 2)}%`;
}

function vatPercentFromBps(vatBps: bigint | number | null | undefined): number {
  const raw = Number(vatBps ?? 0);
  const effectiveBps = raw > 0 && raw < 100 ? raw * 100 : raw;
  return effectiveBps / 100;
}

// ... (start of buildLineGroups)
function buildLineGroups(
  lines: QuoteLine[],

  negotiationByLine: Map<string, LineNegotiationInfo | null>,

  versionNumberById: Map<string, number>,

  activeCycle: number
): LineGroup[] {
  // Two maps: one for material rows, one for labour rows, keyed by section
  const matGroups = new Map<string, LineGroup>();
  const labGroups = new Map<string, LineGroup>();

  lines.forEach((line) => {
    const meta = parseJson<Record<string, unknown>>(line.metaJson);

    const section =
      line.section ||
      (typeof meta?.section === 'string' && meta.section.trim().length > 0
        ? meta.section
        : 'Items');

    const unitFromMeta = typeof meta?.unit === 'string' ? meta.unit : null;

    const negotiation = negotiationByLine.get(line.id) ?? null;

    let rate = fromMinor(line.unitPriceMinor);
    let amount = fromMinor(line.lineTotalMinor);

    if (negotiation && negotiation.status === 'PENDING') {
      rate = negotiation.proposedRate;
      amount = negotiation.proposedTotal;
    }

    const cycle = typeof line.cycle === 'number' ? line.cycle : 0;
    const isCurrentCycle = cycle === activeCycle;
    const isLabour = line.itemType === 'LABOUR';
    const summaryCategory = getConstructionSummaryCategory({
      section,
      description: line.description,
      itemType: line.itemType,
    });
    const targetMap = isLabour ? labGroups : matGroups;
    const groupKey = `${section}:${summaryCategory.key}`;

    if (!targetMap.has(groupKey)) {
      targetMap.set(groupKey, {
        key: groupKey,
        section,
        label: isLabour ? `LABOUR - ${summaryCategory.detailLabel}` : summaryCategory.detailLabel,
        summaryCategory,
        isLabour,
        rows: [],
        subtotal: 0,
      });
    }

    const group = targetMap.get(groupKey)!;

    const labourNote = typeof meta?.labourNote === 'string' ? meta.labourNote : null;

    group.rows.push({
      id: line.id,
      description: line.description,
      itemType: line.itemType,
      unit: line.unit ?? unitFromMeta,
      qty: Number(line.quantity),
      rate,
      amount,
      source: line.source ?? null,
      addedVersion: line.addedInVersionId
        ? (versionNumberById.get(line.addedInVersionId) ?? null)
        : null,
      negotiation,
      cycle,
      isCurrentCycle,
      labourNote,
    });

    group.subtotal += amount;
  });

  // Section-specific row ordering (lower = appears first).
  // SUPERSTRUCTURE TO RING BEAM must always have Brickwork above Door Frame Fittings.
  const sectionRowPriority = (section: string, description: string): number => {
    const desc = (description || '').toLowerCase();
    if (section === 'SUPERSTRUCTURE TO RING BEAM') {
      if (desc.startsWith('brickwork')) return 0;
      if (desc.includes('door frame')) return 1;
    }
    return 100;
  };

  // Sort rows within groups: PENDING items first, then section-specific priority
  const sortRows = (group: LineGroup) => {
    group.rows.sort((a, b) => {
      const aPending = a.negotiation?.status === 'PENDING';
      const bPending = b.negotiation?.status === 'PENDING';
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      const aPri = sectionRowPriority(group.section, a.description);
      const bPri = sectionRowPriority(group.section, b.description);
      if (aPri !== bPri) return aPri - bPri;
      return 0;
    });
  };
  matGroups.forEach(sortRows);
  labGroups.forEach(sortRows);

  const sectionSort = (a: LineGroup, b: LineGroup) => {
    const categoryOrder = compareConstructionSummaryCategories(a.summaryCategory, b.summaryCategory);
    if (categoryOrder !== 0) return categoryOrder;
    const aHasPending = a.rows.some((r) => r.negotiation?.status === 'PENDING');
    const bHasPending = b.rows.some((r) => r.negotiation?.status === 'PENDING');
    if (aHasPending && !bHasPending) return -1;
    if (!aHasPending && bHasPending) return 1;
    if (a.label !== b.label) return a.label.localeCompare(b.label);
    return 0;
  };

  const sortedMat = Array.from(matGroups.values()).sort(sectionSort);
  const sortedLab = Array.from(labGroups.values()).sort(sectionSort);

  // Materials first, then labour groups at the bottom
  return [...sortedMat, ...sortedLab];
}

function computeLineTotals(lines: QuoteLine[]): QuoteTotals {
  const subtotalMinor = lines.reduce((acc, line) => acc + BigInt(line.lineSubtotalMinor), 0n);

  const discountMinor = lines.reduce((acc, line) => acc + BigInt(line.lineDiscountMinor), 0n);

  const taxMinor = lines.reduce((acc, line) => acc + BigInt(line.lineTaxMinor), 0n);

  const totalMinor = lines.reduce((acc, line) => acc + BigInt(line.lineTotalMinor), 0n);

  const netMinor = subtotalMinor - discountMinor;

  return {
    subtotal: fromMinor(subtotalMinor),

    discount: fromMinor(discountMinor),

    net: fromMinor(netMinor),

    tax: fromMinor(taxMinor),

    grandTotal: fromMinor(totalMinor),
  };
}

function buildVersionDiff(current: QuoteSnapshot, previous?: QuoteSnapshot): VersionDiff {
  const changes: VersionDiff['lineChanges'] = [];

  const removed: VersionDiff['removed'] = [];

  const previousMap = new Map(previous?.lines.map((line) => [line.lineId, line]) ?? []);

  current.lines.forEach((line) => {
    const prev = previousMap.get(line.lineId);

    if (!prev) {
      changes.push({ lineId: line.lineId, description: line.description, current: line.lineTotal });

      return;
    }

    if (Math.round(line.lineTotalMinor) !== Math.round(prev.lineTotalMinor)) {
      changes.push({
        lineId: line.lineId,

        description: line.description,

        previous: prev.lineTotal,

        current: line.lineTotal,
      });
    }
  });

  if (previous) {
    previous.lines.forEach((prevLine) => {
      if (!current.lines.some((line) => line.lineId === prevLine.lineId)) {
        removed.push({
          lineId: prevLine.lineId,

          description: prevLine.description,

          amount: prevLine.lineTotal,
        });
      }
    });
  }

  const totalDelta = previous ? current.totals.grandTotal - previous.totals.grandTotal : null;

  return { totalDelta, lineChanges: changes, removed };
}

type QuotePageParams = {
  params: Promise<{ quoteId: string }>;
};

export default async function QuoteDetailPage({ params }: QuotePageParams) {
  const { quoteId } = await params;

  const [quote, currentUser, project] = await Promise.all([
    prisma.quote.findUnique({
      where: { id: quoteId },

      include: {
        customer: true,
        project: true,
        lines: {
          orderBy: { createdAt: 'asc' },
        },

        versions: { orderBy: { createdAt: 'desc' } },

        negotiations: {
          include: {
            proposedVersion: true,

            originalVersion: true,

            createdBy: { select: { id: true, name: true, email: true, role: true } },

            items: {
              include: {
                quoteLine: true,

                reviewedBy: { select: { id: true, name: true, email: true } },
              },

              orderBy: { createdAt: 'asc' },
            },
          },

          orderBy: { createdAt: 'desc' },
        },

        projectManager: {
          select: {
            id: true,
            name: true,
            email: true,
            office: true,
            role: true,
            createdAt: true,
            passwordHash: true,
          },
        },

        projectTasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true, office: true } },

            createdBy: { select: { id: true, name: true, email: true, office: true } },
          },

          orderBy: { createdAt: 'asc' },
        },
      },
    }),

    getCurrentUser(),

    // fetch project associated with this quote so `project` is typed correctly
    prisma.project.findFirst({ where: { quoteId } }),
  ]);

  if (!quote) {
    return <div className="p-6">Quote not found</div>;
  }

  if (!currentUser) {
    return <div className="p-6">Authentication required</div>;
  }

  const role = coerceUserRole(currentUser.role);

  if (!role) {
    return <div className="p-6">Unsupported user role</div>;
  }

  const currentUserId = currentUser.id ?? null;

  let officeContext: string | null = null;

  try {
    officeContext = ensureQuoteOffice(quote.office ?? null, role, currentUser.office ?? null);
  } catch (error) {
    console.error('[quote-access]', error);

    return <div className="p-6">You do not have access to this quote.</div>;
  }

  const officeFilter = officeContext ? { office: officeContext } : {};

  const managerCandidates =
    role === 'SALES' || role === 'ADMIN'
      ? await prisma.user.findMany({
          where: { role: 'PROJECT_OPERATIONS_OFFICER', ...officeFilter },
          orderBy: { name: 'asc' },
        })
      : [];

  const teamCandidates =
    role === 'PROJECT_OPERATIONS_OFFICER' || role === 'ADMIN'
      ? await prisma.user.findMany({
          where: { role: 'PROJECT_TEAM', ...officeFilter },
          orderBy: { name: 'asc' },
        })
      : [];

  const managerOptions = quote.projectManager
    ? managerCandidates.some((candidate) => candidate.id === quote.projectManager?.id)
      ? managerCandidates
      : [...managerCandidates, quote.projectManager]
    : managerCandidates;

  const teamOptions = (() => {
    const base = [...teamCandidates];

    if (quote.projectManager && !base.some((member) => member.id === quote.projectManager?.id)) {
      base.push(quote.projectManager);
    }

    return base;
  })();

  const projectTasks = quote.projectTasks ?? [];

  const endorseProjectAction = async (formData: FormData) => {
    'use server';

    const commenceOn = String(formData.get('commenceOn') ?? '');
    const deposit = Number(formData.get('deposit') ?? 0);
    const installment = Number(formData.get('installment') ?? 0);
    const installmentDueDate = String(formData.get('installmentDueDate') ?? '');

    const result = await endorseQuoteToProject(quote.id, {
      commenceOn,
      deposit,
      installment,
      installmentDueDate,
    });

    if (!result?.ok) {
      setFlashMessage({
        type: 'error',
        message: result?.error ?? 'Unable to endorse and create project.',
      });
      return redirect(`/quotes/${quote.id}`);
    }

    setFlashMessage({ type: 'success', message: 'Project endorsed and created.' });
    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath('/dashboard');
    return redirect(`/dashboard`);
  };

  const assignProjectManagerAction = async (formData: FormData) => {
    'use server';

    const managerId = formData.get('managerId');
    if (typeof managerId !== 'string' || !managerId) {
      setFlashMessage({ type: 'error', message: 'Manager ID is required.' });
      return redirect(`/quotes/${quote.id}`);
    }

    const result = await assignProjectManager(quote.id, managerId);

    if (!result?.ok) {
      setFlashMessage({
        type: 'error',
        message: (result as any)?.error ?? 'Unable to assign manager.',
      });
    } else {
      setFlashMessage({ type: 'success', message: 'Manager assigned successfully.' });
    }

    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath('/quotes');
    return redirect(`/quotes/${quote.id}`);
  };

  const closeNegotiationAction = async (negotiationId: string) => {
    'use server';

    const result = await closeNegotiation(negotiationId);
    if (!result?.ok) {
      setFlashMessage({
        type: 'error',
        message: (result as any)?.error ?? 'Unable to close negotiation.',
      });
    } else {
      setFlashMessage({ type: 'success', message: 'Negotiation closed.' });
    }
    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath('/quotes');
    redirect(`/quotes/${quote.id}`);
  };

  const createProjectTaskAction = async (formData: FormData) => {
    'use server';

    const title = formData.get('title');
    const description = formData.get('description');
    const assigneeId = formData.get('assigneeId');

    if (typeof title !== 'string' || title.trim().length === 0) {
      setFlashMessage({ type: 'error', message: 'Task title is required.' });
      redirect(`/quotes/${quote.id}`);
    }

    const result = await createProjectTask(quote.id, {
      title: title.trim(),
      description:
        typeof description === 'string' && description.trim().length > 0
          ? description.trim()
          : null,
      assigneeId: typeof assigneeId === 'string' && assigneeId.length > 0 ? assigneeId : null,
    });

    if (!result?.ok) {
      setFlashMessage({ type: 'error', message: result?.error ?? 'Unable to create task.' });
    } else {
      setFlashMessage({ type: 'success', message: 'Task created successfully.' });
    }

    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath('/quotes');
    redirect(`/quotes/${quote.id}`);
  };

  const updateProjectTaskAction = async (formData: FormData) => {
    'use server';

    const taskId = formData.get('taskId');
    const statusValue = formData.get('status');
    const assigneeId = formData.get('assigneeId');

    if (typeof taskId !== 'string' || taskId.length === 0) {
      setFlashMessage({ type: 'error', message: 'Task id missing.' });
      redirect(`/quotes/${quote.id}`);
    }

    const payload: { status?: string; assigneeId?: string | null } = {};

    if (typeof statusValue === 'string' && statusValue.length > 0) {
      payload.status = statusValue;
    }

    if (typeof assigneeId === 'string') {
      payload.assigneeId = assigneeId.length > 0 ? assigneeId : null;
    }

    if (!payload.status && !('assigneeId' in payload)) {
      setFlashMessage({ type: 'info', message: 'No task changes submitted.' });
      redirect(`/quotes/${quote.id}`);
    }

    const result = await updateProjectTask(taskId, payload);

    if (!result?.ok) {
      setFlashMessage({ type: 'error', message: result?.error ?? 'Unable to update task.' });
    } else {
      setFlashMessage({ type: 'success', message: 'Task updated successfully.' });
    }

    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath('/quotes');
    redirect(`/quotes/${quote.id}`);
  };
  const status = normalizeStatus(quote.status);
  const isAdmin = role === 'ADMIN';
  const isSales = role === 'SALES';

  // Redirect SALES users to client view if in NEGOTIATION
  if (isSales && status === 'NEGOTIATION') {
    redirect(`/client/quotes/${quote.id}`);
  }
  const canSalesEndorse = (isSales || role === 'SALES_ACCOUNTS') && status === 'REVIEWED';

  const isReviewer = role === 'SENIOR_QS' || isAdmin;
  const isProjectManagerUser = role === 'PROJECT_OPERATIONS_OFFICER';
  const isAssignedProjectManager = Boolean(
    isProjectManagerUser && currentUserId && quote.projectManagerId === currentUserId
  );
  const canAssignProjectManager = isAdmin;
  const canManageTasks = isAdmin || isAssignedProjectManager;
  const canViewVersionsAndNegotiations =
    isAdmin || role === 'MANAGING_DIRECTOR' || role === 'SALES';

  const allowEdit =
    role === 'QS'
      ? status === 'DRAFT'
      : role === 'SENIOR_QS'
        ? status === 'SUBMITTED_REVIEW' || status === 'NEGOTIATION_REVIEW'
        : false;

  const latestNegotiation = quote.negotiations[0] ?? null;

  const vatRate = quote.vatBps / 10000;

  const negotiationByLine = new Map<string, LineNegotiationInfo | null>();

  if (latestNegotiation) {
    latestNegotiation.items.forEach((item) => {
      const quantity = Number(item.quoteLine?.quantity ?? 0);

      const proposedTotal = fromMinor(item.proposedTotalMinor);

      const proposedRate = deriveRateFromTotal(proposedTotal, quantity, vatRate);

      const statusRaw = item.status === 'REVIEWED' ? 'FINAL' : item.status;

      const status = statusRaw as LineNegotiationInfo['status'];

      negotiationByLine.set(item.quoteLineId, {
        status,

        proposedTotal,

        proposedRate,

        itemId: item.id,

        reviewerName: item.reviewedBy?.name ?? item.reviewedBy?.email ?? null,

        reviewedAt: item.reviewedAt,

        negotiationStatus: latestNegotiation.status,
      });
    });
  }

  const allItemsResolved =
    !!latestNegotiation &&
    latestNegotiation.items.every(
      (item) => item.status === 'OK' || item.status === 'ACCEPTED' || item.status === 'REVIEWED'
    );

  const versionNumberById = new Map(quote.versions.map((version) => [version.id, version.version]));

  const activeCycle =
    typeof (quote as any).activeCycle === 'number'
      ? (quote as any).activeCycle
      : quote.lines.length
        ? Math.max(...quote.lines.map((l) => (typeof l.cycle === 'number' ? l.cycle : 0)))
        : 0;

  const lineCycleById = new Map(quote.lines.map((line) => [line.id, line.cycle ?? 0]));

  const groups = buildLineGroups(quote.lines, negotiationByLine, versionNumberById, activeCycle);

  const metaTotals = parseJson<{ totals?: QuoteTotals }>(quote.metaJson ?? null)?.totals;

  const computedTotals = computeLineTotals(quote.lines);

  const totals: QuoteTotals = metaTotals
    ? {
        subtotal: metaTotals.subtotal ?? computedTotals.subtotal,

        discount: metaTotals.discount ?? computedTotals.discount,

        net: metaTotals.net ?? computedTotals.net,

        tax: metaTotals.tax ?? computedTotals.tax,

        grandTotal: metaTotals.grandTotal ?? computedTotals.grandTotal,
      }
    : computedTotals;

  const vatPercent = vatPercentFromBps(quote.vatBps);

  const versions = quote.versions.map((version) => ({
    ...version,

    snapshot: parseQuoteSnapshot(version.snapshotJson),
  }));

  const versionDiffs = versions.map((version, index) =>
    buildVersionDiff(version.snapshot, versions[index + 1]?.snapshot)
  );

  const negotiationSnapshots = quote.negotiations.map((negotiation) => ({
    negotiation,

    proposedSnapshot: parseQuoteSnapshot(negotiation.proposedVersion.snapshotJson),

    originalSnapshot: negotiation.originalVersion
      ? parseQuoteSnapshot(negotiation.originalVersion.snapshotJson)
      : null,
  }));

  const transitionTargets = role ? nextStatusesFor(role, status) : [];

  const actionableTargets = transitionTargets.filter((target) => STATUS_BUTTON_LABELS[target]);
  const visibleTargets = actionableTargets;
  const canFinalize = transitionTargets.includes('FINALIZED');
  const canEndorseProject = role === 'SALES' || role === 'ADMIN' || role === 'SALES_ACCOUNTS';
  const showEndorseForm = canEndorseProject && status === 'REVIEWED';
  const canEndorse =
    (role === 'SALES' || role === 'ADMIN' || role === 'SALES_ACCOUNTS') &&
    !quote.project &&
    status === 'REVIEWED';
  const projectDefaults = {
    commenceOn: project?.commenceOn ? project.commenceOn.toISOString().slice(0, 10) : '',
    deposit: project ? fromMinor(project.depositMinor ?? 0) : 0,
    installment: project ? fromMinor(project.installmentMinor ?? 0) : 0,
    //dueDay: project?.installmentDueOn ?? '',
    installmentDueOn: project?.installmentDueOn
      ? project.installmentDueOn.toISOString().slice(0, 10)
      : '',
  } as const;

  const transitionAction = async (formData: FormData) => {
    'use server';

    const target = formData.get('target') as QuoteStatus;
    try {
      await transitionQuoteStatus(quote.id, target);
    } catch (error) {
      setFlashMessage({ type: 'error', message: getErrorMessage(error) });
    }
    // 2) Success path: set flash + choose destination, then RETURN redirect
    setFlashMessage({
      type: 'success',
      message: `Quote moved to ${STATUS_LABELS[target] ?? target}`,
    });

    // 3) Senior QS "Send to Sales" -> Redirect to /dashboard
    if (target === 'SENT_TO_SALES' && role === 'SENIOR_QS') {
      revalidatePath('/dashboard');
      return redirect('/dashboard');
    }

    // If Sales/Admin moves to negotiation, go to client view
    if (target === 'NEGOTIATION' && (role === 'SALES' || role === 'ADMIN')) {
      console.log('Redirecting to client quote view');
      revalidatePath(`/client/quotes/${quote.id}`);
      revalidatePath(`/quotes/${quote.id}`);
      return redirect(`/client/quotes/${quote.id}`);
    }

    // Otherwise, stay on internal quote page
    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath('/quotes');
    return redirect(`/quotes/${quote.id}`);
  };

  const finalizeAction = async () => {
    'use server';
    await finalizeQuote(quote.id);
    setFlashMessage({ type: 'success', message: 'Quote finalized.' });
    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath('/quotes');
    redirect(`/quotes/${quote.id}`);
  };
  const endorseAction = async (formData: FormData) => {
    'use server';
    const commence = String(formData.get('commenceOn') || '');
    const deposit = Number(formData.get('deposit') || 0);
    const installment = Number(formData.get('installment') || 0);
    // const dueDay = Number(formData.get('dueDay') || 1);
    const dueDate = String(formData.get('installmentDueOn'));
    const result = await endorseQuoteToProject(quote.id, {
      commenceOn: commence,
      deposit,
      installment,
      installmentDueDate: dueDate,
    });

    if (!result.ok) {
      setFlashMessage({ type: 'error', message: result.error });
      return;
    }
    setFlashMessage({ type: 'success', message: 'Quote endorsed successfully.' });
    const project = await prisma.project.findUnique({
      where: { quoteId: quote.id },
      select: { id: true },
    });
    if (project?.id) {
      revalidatePath(`/projects/${project.id}`);
      return redirect(`/projects/${project.id}/payments`);
    }
    revalidatePath(`/quotes/${quote.id}`);
  };
  console.log('jkjdfjfdhjdfhjdfhjfhjernamz ns');
  console.log(quote?.project);

  const materialTotal = groups.filter((g) => !g.isLabour).reduce((s, g) => s + g.subtotal, 0);
  const labourTotal = groups.filter((g) => g.isLabour).reduce((s, g) => s + g.subtotal, 0);
  const firstLabourIdx = groups.findIndex((g) => g.isLabour);

  return (
    <div className="space-y-6">
      <QuoteHeader quote={quote} title={isSales ? 'Sales Endorsement' : undefined} />

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            P&amp;Gs
          </div>
          <div className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
            {formatPercentRate(Number(quote.pgRate ?? 0))}
          </div>
        </div>
        <div
          className={clsx(
            'rounded-xl border p-4 shadow-sm',
            vatPercent > 0
              ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
          )}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            VAT
          </div>
          <div
            className={clsx(
              'mt-1 text-xl font-bold',
              vatPercent > 0 ? 'text-gray-900 dark:text-white' : 'text-amber-700 dark:text-amber-200'
            )}
          >
            {vatPercent > 0 ? formatPercentRate(vatPercent) : 'Missing'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Contingency
          </div>
          <div className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
            {formatPercentRate(Number(quote.contingencyRate ?? 0))}
          </div>
        </div>
      </section>

      {/* Summary section hidden as per request */}
      {/* <section className="rounded border bg-white p-4 shadow-sm dark:bg-gray-800 dark:border-gray-700">
        ...
      </section> */}
      {/* {isSales && (
        ...
      )} */}

      {canSalesEndorse && (
        <div className="space-y-4 py-6">
          <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-800 flex items-center justify-center gap-3">
            <ClipboardDocumentCheckIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-blue-900 dark:text-blue-100 uppercase tracking-wider text-sm">
              Sales Endorsement
            </h3>
          </div>

          <section className="rounded-xl border border-gray-200 bg-white p-8 shadow-lg dark:bg-gray-800 dark:border-gray-700">
            {project && (
              <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900/50 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white">Project ID:</span>{' '}
                  {project.id}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white">Commences:</span>{' '}
                  {project.commenceOn ? new Date(project.commenceOn).toLocaleDateString() : 'TBD'}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white">Deposit:</span>{' '}
                  <Money value={projectDefaults.deposit} />
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white">Installment:</span>{' '}
                  <Money value={projectDefaults.installment} />
                </div>
                {projectDefaults.installmentDueOn && (
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">Due Date:</span>{' '}
                    {project.installmentDueOn
                      ? new Date(project.installmentDueOn).toLocaleDateString()
                      : 'TBD'}
                  </div>
                )}
              </div>
            )}

            {canEndorse && (
              <SalesEndorsementForm
                action={endorseProjectAction}
                defaults={projectDefaults}
                grandTotal={totals.grandTotal}
              />
            )}
          </section>
        </div>
      )}

      {role !== 'SALES' && role !== 'QS' && role !== 'SENIOR_QS' && (
        <section className="rounded border bg-white p-4 shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="flex flex-col gap-6 lg:flex-row lg:justify-between">
            <div className="lg:max-w-md">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Project Assignment
              </h2>

              <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                <div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    Project manager:
                  </span>{' '}
                  {quote.projectManager ? (
                    <span>
                      {quote.projectManager.name ??
                        quote.projectManager.email ??
                        quote.projectManager.id}
                    </span>
                  ) : (
                    <span className="italic text-gray-500 dark:text-gray-400">Not assigned</span>
                  )}
                </div>

                {quote.projectManagerAssignedAt && (
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Assigned on:
                    </span>{' '}
                    {new Date(quote.projectManagerAssignedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {canAssignProjectManager && managerOptions.length > 0 && (
                <form
                  action={assignProjectManagerAction}
                  className="mt-4 flex flex-col gap-3 max-w-sm"
                >
                  <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-200">
                    <span>Select project manager</span>

                    <select
                      name="managerId"
                      defaultValue={quote.projectManagerId ?? ''}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      required
                    >
                      <option value="" disabled>
                        Select manager
                      </option>

                      {managerOptions.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.name ?? manager.email ?? manager.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <SubmitButton
                    className="self-start bg-indigo-600 text-white hover:bg-indigo-700"
                    loadingText="Assigning..."
                  >
                    {quote.projectManagerId ? 'Reassign Manager' : 'Assign Manager'}
                  </SubmitButton>
                </form>
              )}

              {canAssignProjectManager && managerOptions.length === 0 && (
                <p className="mt-3 text-xs text-orange-600">
                  No project managers found for this office.
                </p>
              )}
            </div>

            {canManageTasks && (
              <div className="lg:min-w-[280px]">
                <h3 className="text-lg font-semibold">Create Task</h3>

                <form action={createProjectTaskAction} className="mt-3 flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-200">
                    <span>Task title</span>

                    <input
                      name="title"
                      required
                      className="rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-200">
                    <span>Description</span>

                    <textarea
                      name="description"
                      rows={3}
                      className="rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-200">
                    <span>Assignee</span>

                    <select
                      name="assigneeId"
                      defaultValue=""
                      className="rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    >
                      <option value="">Unassigned</option>

                      {teamOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name ?? member.email ?? member.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <SubmitButton
                    className="self-start bg-indigo-600 text-white hover:bg-indigo-700"
                    loadingText="Creating..."
                  >
                    Add Task
                  </SubmitButton>
                </form>
              </div>
            )}
          </div>

          {projectTasks.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-lg font-semibold">Team Tasks</h3>

              <ul className="space-y-3">
                {projectTasks.map((task) => {
                  const assigneeLabel =
                    task.assignee?.name ?? task.assignee?.email ?? task.assigneeId ?? 'Unassigned';

                  return (
                    <li
                      key={task.id}
                      className="rounded border border-gray-200 bg-gray-50 px-3 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {task.title}
                          </div>

                          {task.description && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {task.description}
                            </div>
                          )}

                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            Status:{' '}
                            <span className="font-medium">
                              {TASK_STATUS_LABELS[task.status] ?? task.status}
                            </span>{' '}
                            - Assigned to {assigneeLabel}
                          </div>
                        </div>

                        {canManageTasks && (
                          <form
                            action={updateProjectTaskAction}
                            className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3"
                          >
                            <input type="hidden" name="taskId" value={task.id} />
                            <label className="sr-only" htmlFor={`task-${task.id}-status`}>
                              Task status
                            </label>
                            <select
                              id={`task-${task.id}-status`}
                              name="status"
                              defaultValue={task.status}
                              className="rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            >
                              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <label className="sr-only" htmlFor={`task-${task.id}-assignee`}>
                              Task assignee
                            </label>
                            <select
                              id={`task-${task.id}-assignee`}
                              name="assigneeId"
                              defaultValue={task.assigneeId ?? ''}
                              className="rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            >
                              <option value="">Unassigned</option>
                              {teamOptions.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name ?? member.email ?? member.id}
                                </option>
                              ))}
                            </select>
                            <SubmitButton
                              className="bg-slate-900 text-white hover:bg-slate-800"
                              loadingText="Updating..."
                            >
                              Update
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {!canSalesEndorse && (
        <>
          {/* Material & Labour running totals */}
          <div className="space-y-8">
            {groups.map((group, gIdx) => (
              <div key={`${group.key}-${group.isLabour ? 'L' : 'M'}`}>
                {/* Materials total banner - shown right before first labour group */}
                {gIdx === firstLabourIdx && firstLabourIdx > 0 && (
                  <div className="mb-6 space-y-3">
                    <div className="flex justify-end">
                      <div className="rounded-lg bg-blue-100 px-6 py-3 dark:bg-blue-900/30">
                        <span className="text-sm font-bold text-blue-900 dark:text-blue-200">
                          TOTAL MATERIALS:{' '}
                        </span>
                        <span className="text-sm font-bold text-blue-900 dark:text-blue-100">
                          <Money value={materialTotal} />
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 p-4 border-2 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 flex items-center gap-3">
                      <WrenchScrewdriverIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                      <h2 className="font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wider text-base">
                        Labour
                      </h2>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {group.isLabour ? (
                        <WrenchScrewdriverIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      ) : group.section === 'MATERIALS' ? (
                        <BeakerIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <TagIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      )}
                      <h3 className="font-bold text-blue-900 dark:text-blue-100 uppercase tracking-wider text-sm">
                        {group.label}
                      </h3>
                    </div>
                    {isReviewer && status === 'SUBMITTED_REVIEW' && (
                      <DeleteSectionButton
                        quoteId={quote.id}
                        section={group.section}
                        itemType={group.isLabour ? 'LABOUR' : 'MATERIAL'}
                        label={group.label}
                      />
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-12"
                          >
                            #
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                          >
                            Description
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24"
                          >
                            Unit
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24"
                          >
                            Qty
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-64"
                          >
                            Rate
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-32"
                          >
                            Amount
                          </th>
                          {isReviewer && status === 'SUBMITTED_REVIEW' && (
                            <th
                              scope="col"
                              className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-12"
                            ></th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {group.rows.map((row, idx) => (
                          <tr
                            key={row.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                              <div className="line-clamp-2">{row.description}</div>
                              {row.labourNote && !isReviewer && (
                                <div className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">
                                  {row.labourNote}
                                </div>
                              )}
                              {row.labourNote !== null && isReviewer && (
                                <LabourNoteEditor
                                  quoteId={quote.id}
                                  lineId={row.id}
                                  defaultNote={row.labourNote ?? ''}
                                />
                              )}
                              <div className="mt-1 flex flex-wrap gap-2">
                                {row.source === 'Manual' && (
                                  <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                    MANUAL{row.addedVersion ? ` (v${row.addedVersion})` : ''}
                                  </span>
                                )}
                                {!row.isCurrentCycle && (
                                  <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                    <LockClosedIcon className="h-3 w-3" />
                                    LOCKED (CYCLE {row.cycle})
                                  </span>
                                )}
                                {row.negotiation && (
                                  <span
                                    className={clsx(
                                      'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold',
                                      NEGOTIATION_BADGE_CLASSES[row.negotiation.status]
                                    )}
                                  >
                                    {formatDecisionLabel(row.negotiation.status)}
                                    {row.negotiation.status !== 'PENDING' &&
                                      row.negotiation.reviewerName &&
                                      ` by ${row.negotiation.reviewerName}`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                              {row.unit}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                              {row.qty.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">
                              {allowEdit ? (
                                <div className="flex justify-end">
                                  {allowEdit &&
                                  (quote.status !== 'NEGOTIATION_REVIEW' ||
                                    row.negotiation?.status === 'PENDING') ? (
                                    <LineRateEditor
                                      quoteId={quote.id}
                                      lineId={row.id}
                                      defaultRate={row.rate}
                                      defaultQuantity={row.qty}
                                      isNegotiationPending={row.negotiation?.status === 'PENDING'}
                                    />
                                  ) : (
                                    <Money value={row.rate} />
                                  )}
                                </div>
                              ) : (
                                <Money value={row.rate} />
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-white">
                              <Money value={row.amount} />
                            </td>
                            {isReviewer && status === 'SUBMITTED_REVIEW' && (
                              <td className="px-4 py-3 text-center">
                                <DeleteLineButton quoteId={quote.id} lineId={row.id} />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <td
                            colSpan={isReviewer && status === 'SUBMITTED_REVIEW' ? 6 : 5}
                            className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white"
                          >
                            Section Subtotal
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-white">
                            <Money value={group.subtotal} />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    {isReviewer && status === 'SUBMITTED_REVIEW' && (
                      <AddLineForm quoteId={quote.id} section={group.section} />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Labour Total + Fix & Supply Grand Total */}
            <div className="space-y-3">
              {labourTotal > 0 && (
                <div className="flex justify-end">
                  <div className="rounded-lg bg-amber-100 px-6 py-3 dark:bg-amber-900/30">
                    <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
                      TOTAL LABOUR:{' '}
                    </span>
                    <span className="text-sm font-bold text-amber-900 dark:text-amber-100">
                      <Money value={labourTotal} />
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <div className="rounded-lg bg-green-100 px-6 py-4 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                  <span className="text-base font-bold text-green-900 dark:text-green-200">
                    TOTAL FIX &amp; SUPPLY:{' '}
                  </span>
                  <span className="text-base font-bold text-green-900 dark:text-green-100">
                    <Money value={materialTotal + labourTotal} />
                  </span>
                </div>
              </div>
            </div>
          </div>
          {role === 'ADMIN' && (
            <section className="rounded border bg-white p-4 shadow-sm dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Versions</h2>

              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {versions.length === 0 && (
                  <div className="col-span-full text-sm text-gray-500 dark:text-gray-400">
                    No versions recorded yet.
                  </div>
                )}

                {versions.map((version, index) => {
                  const diff = versionDiffs[index];

                  return (
                    <div
                      key={version.id}
                      className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                              v{version.version} - {version.label ?? 'Snapshot'}
                            </div>

                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(version.createdAt).toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Status: {version.status ?? '-'}
                            </div>
                          </div>

                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            <div className="text-right">
                              <Money value={version.snapshot.totals.grandTotal} />
                            </div>
                            {diff.totalDelta !== null && diff.totalDelta !== 0 && (
                              <div
                                className={clsx(
                                  'text-right text-xs',
                                  diff.totalDelta > 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                                )}
                              >
                                {diff.totalDelta > 0 ? '+' : '-'}
                                <Money value={Math.abs(diff.totalDelta)} />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 space-y-2 text-sm border-t border-gray-100 pt-3 dark:border-gray-700">
                          {diff.lineChanges.length > 0 ? (
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white text-xs uppercase tracking-wide mb-1">
                                Line changes
                              </div>

                              <ul className="space-y-1">
                                {diff.lineChanges.slice(0, 5).map((change) => (
                                  <li
                                    key={change.lineId}
                                    className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300"
                                  >
                                    <span className="truncate">{change.description}</span>

                                    <span className="shrink-0">
                                      {change.previous !== undefined && (
                                        <span className="mr-2 text-xs text-gray-500 line-through dark:text-gray-500">
                                          <Money value={change.previous} />
                                        </span>
                                      )}

                                      <Money value={change.current} />
                                    </span>
                                  </li>
                                ))}
                                {diff.lineChanges.length > 5 && (
                                  <li className="text-xs text-gray-400 italic">
                                    +{diff.lineChanges.length - 5} more changes...
                                  </li>
                                )}
                              </ul>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                              No line changes.
                            </div>
                          )}

                          {diff.removed.length > 0 && (
                            <div className="mt-2">
                              <div className="font-medium text-gray-900 dark:text-white text-xs uppercase tracking-wide mb-1">
                                Removed
                              </div>

                              <ul className="space-y-1">
                                {diff.removed.slice(0, 3).map((removed) => (
                                  <li
                                    key={removed.lineId}
                                    className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300"
                                  >
                                    <span className="truncate">{removed.description}</span>

                                    <span className="shrink-0 text-gray-500 dark:text-gray-400">
                                      <Money value={removed.amount} />
                                    </span>
                                  </li>
                                ))}
                                {diff.removed.length > 3 && (
                                  <li className="text-xs text-gray-400 italic">
                                    +{diff.removed.length - 3} more removed...
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {canViewVersionsAndNegotiations && (
            <NegotiationsList
              negotiationSnapshots={negotiationSnapshots}
              quoteLines={quote.lines}
              isReviewer={isReviewer}
              vatRate={vatRate}
              activeCycle={activeCycle}
              closeNegotiationAction={closeNegotiationAction}
            />
          )}

          {/* Quote Notes (Barmlo Template) */}
          <QuoteNotes
            assumptions={parseJson<string[]>(quote.assumptions) ?? []}
            exclusions={parseJson<string[]>(quote.exclusions) ?? []}
            readOnly={!allowEdit}
            onSave={
              allowEdit
                ? async (a, e) => {
                    'use server';
                    await updateQuoteNotes(quote.id, a, e);
                  }
                : undefined
            }
          />

          <div className="flex justify-center gap-2 mb-8 mt-8 no-print">
            <DownloadPdfButton
              quoteId={quote.id}
              generatePdf={generateQuotePdf}
              className="bg-green-600 hover:bg-green-700 focus:ring-green-600"
            />
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 no-print">
            <div className="flex flex-wrap items-center justify-end gap-4">
              {role && (role === 'QS' || role === 'ADMIN') && <QSEditButton quoteId={quote.id} />}

              {visibleTargets.map((target) => (
                <form
                  key={target}
                  action={transitionAction}
                  className={
                    STATUS_BUTTON_LABELS[target] === 'Send to Sales' ||
                    STATUS_BUTTON_LABELS[target] === 'Move to Negotiation'
                      ? 'w-full'
                      : ''
                  }
                >
                  <input type="hidden" name="target" value={target} />

                  <SubmitButton
                    loadingText=""
                    className={clsx(
                      'rounded-xl px-8 py-3 text-sm shadow-md transition-all inline-flex items-center justify-center gap-3 font-bold',
                      STATUS_BUTTON_LABELS[target] === 'Send to Sales' ||
                        STATUS_BUTTON_LABELS[target] === 'Move to Negotiation'
                        ? 'w-full bg-green-600 text-white hover:bg-green-700 hover:shadow-lg hover:-translate-y-0.5 text-lg py-4'
                        : STATUS_BUTTON_LABELS[target] === 'Submit for Review'
                          ? 'bg-green-600 text-white hover:bg-green-700 min-w-[200px]'
                          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 min-w-[200px]'
                    )}
                  >
                    {STATUS_BUTTON_LABELS[target] === 'Submit for Review' && (
                      <PaperAirplaneIcon className="h-5 w-5" />
                    )}
                    {STATUS_BUTTON_LABELS[target] === 'Mark Reviewed' && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                        />
                      </svg>
                    )}
                    {STATUS_BUTTON_LABELS[target] === 'Archive' && (
                      <ArchiveBoxIcon className="h-5 w-5" />
                    )}
                    <span
                      className={
                        STATUS_BUTTON_LABELS[target] === 'Send to Sales' ||
                        STATUS_BUTTON_LABELS[target] === 'Move to Negotiation'
                          ? 'text-xl'
                          : 'text-lg'
                      }
                    >
                      {STATUS_BUTTON_LABELS[target]}
                    </span>
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>

          {isReviewer && latestNegotiation?.status === 'OPEN' && allItemsResolved && (
            <form
              action={closeNegotiationAction.bind(null, latestNegotiation.id)}
              className="fixed bottom-8 right-8 z-50 no-print"
            >
              <SubmitButton
                loadingText="Closing..."
                className="group flex items-center gap-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-8 py-4 text-white shadow-lg shadow-green-900/20 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-green-900/30 active:translate-y-0 active:shadow-md"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 group-hover:bg-white/30 transition-colors">
                    <CheckCircleIcon className="h-5 w-5" />
                  </span>
                  <span className="text-lg font-bold tracking-wide">Close Proposal</span>
                </span>
              </SubmitButton>
            </form>
          )}
        </>
      )}
    </div>
  );
}
