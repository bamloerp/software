'use server';

import { prisma } from '@/lib/db';
import { postStockMove } from '@/lib/inventory';
import { PaymentScheduleStatus, Prisma } from '@prisma/client';
import type { ScheduleItem } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { toMinor } from '@/helpers/money';
import { TX_OPTS } from '@/lib/db-tx';
import { USER_ROLES, type UserRole } from '@/lib/workflow';
import { revalidatePath } from 'next/cache';
import { getCanonicalScheduleStage } from '@/lib/scheduleStageOrder';
import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { getRemainingDispatchMap } from '@/lib/dispatch';
import { recalculateRipple, ScheduleItemMinimal, addGap, addWorkingTime, inferTaskType as engineInferTaskType, ProductivitySettings as EngineProductivitySettings } from '@/lib/schedule-engine';
import { getQuoteGrandTotalMinor } from '@/app/lib/payments';


const ROLE_SET = new Set<UserRole>(USER_ROLES as unknown as UserRole[]);

function assertRole(role: string | null | undefined): UserRole {
  const normalized = role && ROLE_SET.has(role as UserRole) ? (role as UserRole) : null;
  if (!normalized) throw new Error('Unsupported user role');
  return normalized;
}

function assertOneOf(role: string | null | undefined, allowed: string[]) {
  if (!role || !allowed.includes(role)) throw new Error('Not authorized');
}

function assertRoles(role: string | null | undefined, allowed: string[]) {
  if (!role || !allowed.includes(role)) throw new Error('Not authorized');
}

function moneyToMinor(amount: number) {
  return BigInt(Math.round((amount ?? 0) * 100));
}

type Result = { ok: true; requisitionId: string } | { ok: false; error: string };

export async function ensureProjectIsPlanned(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) throw new Error('Project not found');
  if (project.status === 'CREATED' || project.status === 'DEPOSIT_PENDING') {
    throw new Error('Project deposit not received yet. Project must be PLANNED before proceeding.');
  }

  const scheduleCount = await prisma.schedule.count({ where: { projectId } });
  if (scheduleCount === 0) {
    throw new Error('Project schedule not created yet. Please create a schedule before proceeding.');
  }

  return project.status;
}

export async function ensureProjectIsPaidFor(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) throw new Error('Project not found');
  if (project.status === 'CREATED' || project.status === 'DEPOSIT_PENDING') {
    throw new Error('Project deposit not received yet. Project must be PLANNED before proceeding.');
  }


  return project.status;
}

export async function clearReviewSubmissionIfNone(requisitionId: string) {
  const pending = await prisma.procurementRequisitionItem.count({
    where: { requisitionId, reviewRequested: true },
  });
  if (pending === 0) {
    // Unlock and clear note
    const current = await prisma.procurementRequisition.findUnique({ where: { id: requisitionId }, select: { status: true, note: true } });
    const updates: any = { reviewSubmittedAt: null, reviewSubmittedById: null };

    if (current?.status === 'AWAITING_APPROVAL') {
      updates.status = 'SUBMITTED';
    }

    // Clear note
    let newNote = current?.note;
    if (newNote && newNote.includes('Review request from Req')) {
      newNote = newNote.split('\n').filter(line => !line.includes('Review request from Req')).join('\n').trim();
      updates.note = newNote === '' ? null : newNote;
    } else {
      updates.note = newNote;
    }

    await prisma.procurementRequisition.update({
      where: { id: requisitionId },
      data: updates,
    });
  }
}

async function ensureNoPendingItemReviews(requisitionId: string) {
  const pending = await prisma.procurementRequisitionItem.count({
    where: { requisitionId, reviewRequested: true, reviewApproved: false },
  });
  if (pending > 0) {
    throw new Error('Pending item reviews must be approved before requesting funding.');
  }
}

export async function submitProcurementRequest(requisitionId: string, amountMajor?: number) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['PROCUREMENT', 'SENIOR_PROCUREMENT', 'PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(role)) {
    throw new Error('Only Procurement/Ops/Admin');
  }
  await ensureNoPendingItemReviews(requisitionId);

  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    include: { items: true },
  });
  if (!req) throw new Error('Requisition not found');

  const totalMinor = req.items.reduce((acc, it) => acc + BigInt(it.estPriceMinor ?? 0n), 0n);
  const amountMinor =
    typeof amountMajor === 'number' && amountMajor >= 0 ? toMinor(amountMajor) : totalMinor;

  // Clear any rejection reasons now that we are proceeding with funding
  await prisma.procurementRequisitionItem.updateMany({
    where: { requisitionId },
    data: { reviewRejectionReason: null },
  });

  await prisma.fundingRequest.create({
    data: {
      requisitionId,
      amountMinor,
      status: 'REQUESTED',
      requestedById: user.id!,
    },
  });

  revalidatePath(`/projects/${req?.projectId}`);
  // redirect('/dashboard'); // Handled by client to avoid NEXT_REDIRECT error in try/catch
  return { ok: true };
}

export async function requestFunding(requisitionId: string, amountMajor?: number) {
  'use server';
  return submitProcurementRequest(requisitionId, amountMajor);
}

// Old functions removed - see new implementation below




export async function computeEstimatesForItems(
  items: ScheduleItemMinimal[],
  settings: EngineProductivitySettings,
): Promise<any[]> {
  if (!items.length) return [];

  // Use the ripple engine starting from the first item
  // If we don't have a start date for the first item, we use today's working hour
  const projectStart = items[0].plannedStart
    ? new Date(items[0].plannedStart)
    : new Date();

  return recalculateRipple(items, 0, projectStart, 30, settings); // Assuming 30m gap default for server side too
}

// --- Task reports and status ---
export async function createScheduleTaskReport(itemId: string, input: { activity?: string | null; usedQty?: number | null; usedUnit?: string | null; remainingQty?: number | null; remainingUnit?: string | null }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');

  const item = await prisma.scheduleItem.findUnique({
    where: { id: itemId },
    include: {
      schedule: {
        include: {
          items: { orderBy: { createdAt: 'asc' }, include: { assignees: true } }
        }
      }
    }
  });
  if (!item) throw new Error('Schedule item not found');

  await prisma.scheduleTaskReport.create({
    data: {
      scheduleItemId: itemId,
      reporterId: user.id,
      activity: input.activity ?? null,
      usedQty: input.usedQty ?? null,
      usedUnit: input.usedUnit ?? null,
      remainingQty: input.remainingQty ?? null,
      remainingUnit: input.remainingUnit ?? null,
    },
  });

  // Calculate if we need a ripple push
  // If today is past plannedEnd and not done, or if manually reporting remaining qty that exceeds original
  const now = new Date();
  const plannedEnd = item.plannedEnd ? new Date(item.plannedEnd) : null;
  const isOverdue = plannedEnd && now > plannedEnd && item.status !== 'DONE';

  if (isOverdue) {
    const settings = await getProductivitySettings(item.schedule.projectId);
    const scheduleItems = item.schedule.items.map(it => ({
      ...it,
      employeeIds: it.assignees.map(a => a.id)
    }));
    const currentIndex = scheduleItems.findIndex(it => it.id === itemId);

    // Recalculate ripple starting from the current task (adjusting its end)
    // or from the next task if current is somehow finish-able.
    // For now, let's just shift everything forward from "now" (next working hour)
    const updated = recalculateRipple(
      scheduleItems as ScheduleItemMinimal[],
      currentIndex,
      now, // Start from now
      30,
      settings
    );

    await prisma.$transaction(
      updated.map(u => prisma.scheduleItem.update({
        where: { id: u.id! },
        data: {
          plannedStart: u.plannedStart ? new Date(u.plannedStart) : null,
          plannedEnd: u.plannedEnd ? new Date(u.plannedEnd) : null,
          estHours: u.estHours
        }
      }))
    );
  }

  revalidatePath(`/projects/${item.schedule.projectId}/reports`);
  revalidatePath(`/projects/${item.schedule.projectId}/schedule`);
  revalidatePath(`/projects/${item.schedule.projectId}/daily-tasks`);
  revalidatePath('/dashboard');
}

export async function updateScheduleItemStatus(itemId: string, status: 'ACTIVE' | 'ON_HOLD' | 'DONE') {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER'].includes(role as string)) {
    throw new Error('Only Ops/Admin/MD/General Manager');
  }

  const item = await prisma.scheduleItem.findUnique({
    where: { id: itemId },
    include: {
      schedule: {
        include: {
          items: { orderBy: { createdAt: 'asc' }, include: { assignees: true } }
        }
      }
    }
  });
  if (!item) throw new Error('Schedule item not found');

  await prisma.scheduleItem.update({ where: { id: itemId }, data: { status } });

  // ripple effect if DONE early or late
  if (status === 'DONE' || status === 'ACTIVE') {
    const settings = await getProductivitySettings(item.schedule.projectId);
    const scheduleItems = item.schedule.items.map(it => ({
      ...it,
      employeeIds: it.assignees.map(a => a.id)
    }));
    const currentIndex = scheduleItems.findIndex(it => it.id === itemId);

    // If DONE, the next item can start as early as "now" (or next working hour)
    const nextStartIndex = status === 'DONE' ? currentIndex + 1 : currentIndex;
    if (nextStartIndex < scheduleItems.length) {
      const updated = recalculateRipple(
        scheduleItems as ScheduleItemMinimal[],
        nextStartIndex,
        new Date(), // Start from now
        30,
        settings
      );

      await prisma.$transaction(
        updated.slice(nextStartIndex - currentIndex).map(u => prisma.scheduleItem.update({
          where: { id: u.id! },
          data: {
            plannedStart: u.plannedStart ? new Date(u.plannedStart) : null,
            plannedEnd: u.plannedEnd ? new Date(u.plannedEnd) : null,
            estHours: u.estHours
          }
        }))
      );
    }
  }

  revalidatePath(`/projects/${item.schedule.projectId}/reports`);
  revalidatePath(`/projects/${item.schedule.projectId}/schedule`);
}

/* export async function recordDisbursement(projectId: string, input: { amount: number; date: string; ref?: string | null }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  // tweak your roles here
  assertRoles((user as any).role, ['ACCOUNTS', 'ACCOUNTING_OFFICER', 'ADMIN', 'CASHIER']);

  await prisma.payment.create({
    data: {
      projectId,
      type: 'DISBURSEMENT',
      amountMinor: moneyToMinor(input.amount),
      paidOn: new Date(input.date),
      ref: input.ref ?? null,
      createdById: user.id!,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
} */



type ActionResult = { ok: true; dispatchId: string } | { ok: false; error: string };

// Create a new dispatch containing ONLY items that have been purchased but not fully dispatched yet.
/* export async function createDispatchFromPurchases(projectId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Authentication required' };

  // PM or Admin guard (optional)
  if (user.role !== 'PROJECT_OPERATIONS_OFFICER' && user.role !== 'ADMIN') {
    return { ok: false, error: 'Only Project Managers or Admin can create dispatches' };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) Fetch all requisition items for this project
      const reqItems = await tx.procurementRequisitionItem.findMany({
        where: { requisition: { projectId } },
        select: { id: true, description: true, unit: true },
      });

      if (reqItems.length === 0) {
        throw new Error('No requisition items found for this project.');
      }

      const itemIds = reqItems.map((r) => r.id);

      // 2) Sum purchased qty per requisition item (already bought)
      const purchases = await tx.purchase.groupBy({
        by: ['requisitionItemId'],
        where: {
          requisitionItemId: { in: itemIds },
        },
        _sum: { qty: true },
      });

      // map: itemId -> purchased qty (default 0)
      const purchasedByItem = new Map<string, number>();
      for (const p of purchases) {
        if (p.requisitionItemId) {
          purchasedByItem.set(p.requisitionItemId, (p._sum.qty ?? 0) as number);
        }
      }

      // 3) Sum already dispatched qty per requisition item
      const dispatched = await tx.dispatchItem.groupBy({
        by: ['requisitionItemId'],
        where: { dispatch: { projectId } },
        _sum: { qty: true },
      });

      const dispatchedByItem = new Map<string, number>();
      for (const d of dispatched) {
        if (d.requisitionItemId) {
          dispatchedByItem.set(d.requisitionItemId, (d._sum.qty ?? 0) as number);
        }
      }

      // 4) Compute remaining = purchased - already dispatched
      const toDispatch = [];
      for (const it of reqItems) {
        const bought = purchasedByItem.get(it.id) ?? 0;
        const already = dispatchedByItem.get(it.id) ?? 0;
        const remaining = Math.max(0, bought - already);
        if (remaining > 0) {
          toDispatch.push({
            requisitionItemId: it.id,
            description: it.description,
            unit: it.unit ?? null,
            qty: remaining,
          });
        }
      }

      if (toDispatch.length === 0) {
        throw new Error('Nothing to dispatch: no purchased and undisbursed items found.');
      }

      // 5) Create Dispatch & Items
      const dispatch = await tx.dispatch.create({
        data: {
          projectId,
          status: 'DRAFT',
          items: {
            create: toDispatch.map((i) => ({
              requisitionItemId: i.requisitionItemId,
              description: i.description,
              unit: i.unit,
              qty: i.qty,
            })),
          },
        },
        select: { id: true },
      });

      return dispatch.id;
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true, dispatchId: result };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to create dispatch' };
  }
} */


/* export async function createDispatchFromPurchases(projectId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');

  // 1) all purchases for this project (through requisition -> project)
  const purchases = await prisma.purchase.findMany({
    where: {
      requisition: { projectId },
      qty: { gt: 0 },
    },
    include: { requisitionItem: true },
  });

  const dispatchItems: {
    description: string;
    qty: number;
    unit: string | null;
    purchaseId?: string;
    inventoryItemId?: string;
    selected?: boolean;
  }[] = [];

  // 2) turn each purchase into a dispatchable line ONLY if there is remaining
  for (const p of purchases) {
    const agg = await prisma.dispatchItem.aggregate({
      where: { purchaseId: p.id },
      _sum: { qty: true },
    });
    const already = Number(agg._sum.qty ?? 0);
    const remaining = Math.max(0, Number(p.qty) - already);
    if (remaining <= 0) continue;

    const description =
      (p.requisitionItem?.description?.trim?.() || '') || `Purchase ${p.taxInvoiceNo || p.vendor || p.id}`;
    const unit = p.requisitionItem?.unit ?? null;

    dispatchItems.push({
      description,
      qty: remaining,
      unit,
      purchaseId: p.id,
      selected: true,
    });
  }

  // 3) also include multipurpose inventory that has stock
  const multipurpose = await prisma.inventoryItem.findMany({
    where: { category: 'MULTIPURPOSE', qty: { gt: 0 } },
  });
  for (const inv of multipurpose) {
    dispatchItems.push({
      description: inv.name ?? inv.description,
      qty: Number(inv.qty ?? 0),
      unit: inv.unit ?? null,
      inventoryItemId: inv.id,
      selected: false, // let PM tick what they want
    });
  }

  if (dispatchItems.length === 0) {
    throw new Error('No purchased or available inventory items to dispatch for this project.');
  }

  // 4) create dispatch
  const dispatch = await prisma.dispatch.create({
    data: {
      projectId,
      status: 'DRAFT',
      items: {
        create: dispatchItems.map((it) => ({
          description: it.description,
          qty: it.qty,
          unit: it.unit,
          purchaseId: it.purchaseId ?? null,
          inventoryItemId: it.inventoryItemId ?? null,
          selected: it.selected ?? true,
        })),
      },
      createdById: user.id!,
    },
    include: { items: true },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/dispatches/${dispatch.id}`);

  return { ok: true, dispatchId: dispatch.id };
} */

export async function createDispatchFromPurchases(projectId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  await ensureProjectIsPlanned(projectId);

  console.log(`[CreateDispatch] Starting for Project ${projectId}`);

  // 1) Fetch verified GRNs to calculate RECEIVED limits
  const verifiedGrnItems = await prisma.goodsReceivedNoteItem.findMany({
    where: {
      grn: {
        status: 'VERIFIED',
        purchaseOrder: { requisition: { projectId } }
      }
    },
    include: { poItem: true }
  });

  console.log(`[CreateDispatch] Found ${verifiedGrnItems.length} verified GRN items`);

  const receivedQtyByReqItem = new Map<string, number>();
  for (const grnItem of verifiedGrnItems) {
    if (grnItem.poItem?.requisitionItemId) {
      const rid = grnItem.poItem.requisitionItemId;
      const current = receivedQtyByReqItem.get(rid) ?? 0;
      receivedQtyByReqItem.set(rid, current + grnItem.qtyAccepted);
    }
  }

  // 2) Fetch Requisition Items (APPROVED/ORDERED/PARTIAL/RECEIVED/PURCHASED) for this project
  const reqItems = await prisma.procurementRequisitionItem.findMany({
    where: {
      requisition: {
        projectId,
        status: { in: ['APPROVED', 'ORDERED', 'PURCHASED', 'PARTIAL', 'RECEIVED'] }
      }
    },
    include: {
      requisition: { select: { status: true } },
      purchases: { select: { id: true, qty: true }, where: { qty: { gt: 0 } } } // Try to link purchase if exists
    }
  });

  console.log(`[CreateDispatch] Found ${reqItems.length} potential Requisition Items`);

  const itemsToCreate: any[] = [];

  // 3) Filter and Create
  for (const ri of reqItems) {
    // Check already dispatched amount for this Requisition Item
    const used = await prisma.dispatchItem.aggregate({
      where: { requisitionItemId: ri.id, dispatch: { projectId } },
      _sum: { qty: true },
    });
    const already = Number(used._sum.qty ?? 0);

    // Determine the LIMIT (What is physically available)
    // Strictly enforce GRN limits for ALL items. 
    // Even "Direct Purchases" must be received (Verified GRN) before dispatching to ensure inventory exists.
    let limit = receivedQtyByReqItem.get(ri.id) ?? 0;

    const remaining = Math.max(0, limit - already);

    console.log(`[CreateDispatch] ReqItem ${ri.id}: Status=${ri.requisition.status}, Limit=${limit}, Already=${already}, Remaining=${remaining}`);

    if (remaining <= 0) continue;

    const description = ri.description?.trim() || 'Unknown Item';
    const unit = ri.unit ?? null;

    // Attempt to link to a Purchase ID if we can find a matching one
    // Logic: Grab the first purchase linked to this item, or none.
    const purchaseId = ri.purchases?.[0]?.id ?? undefined;

    itemsToCreate.push({
      description,
      qty: remaining,
      unit,
      selected: true,
      requisitionItem: { connect: { id: ri.id } }, // ✅ Link directly to ReqItem
      purchase: purchaseId ? { connect: { id: purchaseId } } : undefined, // Optional link
    });
  }

  if (itemsToCreate.length === 0) {
    console.error('No items to dispatch. Throwing error.');
    throw new Error('No purchased or available inventory items to dispatch for this project.');
  }

  const dispatch = await prisma.dispatch.create({
    data: {
      projectId,
      status: 'DRAFT',
      createdById: user.id!,
      items: {
        create: itemsToCreate,
      },
    },
    include: { items: true },
  });

  console.log(`[CreateDispatch] Successfully created Dispatch ${dispatch.id} with ${itemsToCreate.length} items`);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/dispatches/${dispatch.id}`);

  return { ok: true, dispatchId: dispatch.id };
}

// Create a dispatch containing inventory items that currently have stock on hand.
export async function createDispatchFromInventory(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Auth required' } as const;
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(user.role as any)) {
    return { ok: false, error: 'Only Ops/Admin can create dispatches' } as const;
  }
  // await ensureProjectIsPlanned(projectId);
  await ensureProjectIsPlanned(projectId);

  const items = await prisma.inventoryItem.findMany({
    where: { qty: { gt: 0 }, category: 'MULTIPURPOSE' },
    orderBy: [{ name: 'asc' }, { description: 'asc' }],
    select: { id: true, name: true, description: true, unit: true, qty: true },
  });
  if (items.length === 0) return { ok: false, error: 'No inventory available to dispatch' } as const;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: { projectId, status: 'DRAFT', createdById: user.id ?? null },
        select: { id: true },
      });
      for (const i of items) {
        await tx.dispatchItem.create({
          data: {
            dispatchId: dispatch.id,
            description: i.name ?? i.description,
            unit: i.unit ?? null,
            qty: i.qty ?? 0,
            inventoryItemId: i.id,
          },
        });
      }
      return dispatch.id;
    });

    return { ok: true, dispatchId: result } as const;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed to create dispatch from inventory' } as const;
  }
}

// Create a dispatch containing ONLY multipurpose items (PM/Admin)
export async function createMultipurposeDispatch(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Auth required' } as const;
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(user.role as any)) {
    return { ok: false, error: 'Only Ops/Admin can create dispatches' } as const;
  }
  await ensureProjectIsPlanned(projectId);

  const items = await prisma.inventoryItem.findMany({
    where: { qty: { gt: 0 }, category: 'MULTIPURPOSE' },
    orderBy: [{ name: 'asc' }, { description: 'asc' }],
    select: { id: true, name: true, description: true, unit: true, qty: true },
  });
  if (items.length === 0)
    return { ok: false, error: 'No multipurpose inventory available to dispatch' } as const;

  try {
    const dispatchId = await prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: { projectId, status: 'DRAFT', createdById: user.id ?? null },
        select: { id: true },
      });

      for (const i of items) {
        // Physical reservation on creation
        await tx.inventoryItem.update({
          where: { id: i.id },
          data: { qty: { decrement: i.qty ?? 0 } }
        });

        await tx.dispatchItem.create({
          data: {
            dispatchId: dispatch.id,
            description: i.name ?? i.description,
            unit: i.unit ?? null,
            qty: i.qty ?? 0,
            inventoryItemId: i.id,
          },
        });
      }
      return dispatch.id;
    });

    return { ok: true, dispatchId };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed to create multipurpose dispatch' } as const;
  }
}

// Create a dispatch from a selected subset of inventory items with explicit quantities
export async function createDispatchFromSelectedInventory(
  projectId: string,
  items: { inventoryItemId: string; qty: number }[],
  note?: string | null,
) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Auth required' } as const;
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(user.role as any)) {
    return { ok: false, error: 'Only Ops/Admin can create dispatches' } as const;
  }

  const clean = items
    .map((i) => ({ id: String(i.inventoryItemId), qty: Number(i.qty) }))
    .filter((i) => i.id && Number.isFinite(i.qty) && i.qty > 0);
  if (clean.length === 0) return { ok: false, error: 'No items selected' } as const;

  const ids = clean.map((i) => i.id);
  const stock = await prisma.inventoryItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, description: true, unit: true, qty: true },
  });
  const byId = new Map(stock.map((s) => [s.id, s]));

  // Validate quantities do not exceed available
  for (const sel of clean) {
    const s = byId.get(sel.id);
    const available = Number(s?.qty ?? 0);
    if (!s) return { ok: false, error: 'Inventory item not found' } as const;
    if (sel.qty > available) {
      return { ok: false, error: `Qty for ${s.name ?? s.description} exceeds available (${available}).` } as const;
    }
  }

  try {
    const dispatchId = await prisma.$transaction(async (tx) => {
      const d = await tx.dispatch.create({
        data: {
          projectId,
          status: 'DRAFT',
          createdById: user.id ?? null,
          note: note || null,
        },
        select: { id: true }
      });
      for (const sel of clean) {
        const s = byId.get(sel.id)!;
        await tx.dispatchItem.create({
          data: {
            dispatchId: d.id,
            description: s.name ?? s.description,
            unit: s.unit ?? null,
            qty: sel.qty,
            inventoryItemId: s.id,
          },
        });
        // Reserved stock (decrement available only)
        await tx.inventoryItem.update({
          where: { id: s.id },
          data: { qty: { decrement: sel.qty } }
        });
      }
      return d.id;
    });
    return { ok: true, dispatchId } as const;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed to create dispatch from selected inventory' } as const;
  }
}

export async function listMultipurposeTools() {
  return prisma.inventoryItem.findMany({
    where: { category: 'MULTIPURPOSE' },
    orderBy: { name: 'asc' },
  });
}

// Create a dispatch including eligible purchases plus user-selected multipurpose tools
export async function createDispatchFromPurchasesAndTools(
  projectId: string,
  toolInputs: { inventoryItemId: string; qty: number }[] = [],
) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');
  await ensureProjectIsPlanned(projectId);

  return prisma.$transaction(async (tx) => {
    // 1) Create dispatch shell
    const dispatch = await tx.dispatch.create({
      data: { projectId, status: 'DRAFT', createdById: me.id ?? null },
      select: { id: true },
    });

    // 2) Include eligible project purchases (not yet dispatched)
    const requisitions = await tx.procurementRequisition.findMany({
      where: { projectId },
      select: { id: true },
    });
    const reqIds = requisitions.map((r) => r.id);
    if (reqIds.length) {
      const purchases = await tx.purchase.findMany({
        where: { requisitionId: { in: reqIds }, dispatchItems: { none: {} } },
        orderBy: { createdAt: 'asc' },
      });
      for (const p of purchases) {
        await tx.dispatchItem.create({
          data: {
            dispatchId: dispatch.id,
            description: p.vendor ? `${p.vendor} - ${p.taxInvoiceNo}` : p.taxInvoiceNo || 'Purchased item',
            qty: Number(p.qty),
            unit: '-',
            purchaseId: p.id,
          },
        });
      }
    }

    // 3) Multipurpose tools (category = MULTIPURPOSE)
    for (const tool of toolInputs) {
      if (!tool?.inventoryItemId) continue;
      const inv = await tx.inventoryItem.findUnique({ where: { id: tool.inventoryItemId } });
      if (!inv) continue;
      const available = Number(inv.qty ?? 0);
      const qtyToSend = Math.min(Number(tool.qty ?? 0), available);
      if (!(qtyToSend > 0)) continue;

      await tx.dispatchItem.create({
        data: {
          dispatchId: dispatch.id,
          description: inv.name ?? inv.description,
          unit: inv.unit ?? null,
          qty: qtyToSend,
          inventoryItemId: inv.id,
        },
      });

      await tx.inventoryItem.update({
        where: { id: inv.id },
        data: { qty: { decrement: qtyToSend } },
      });

      await tx.inventoryAllocation.create({
        data: { inventoryItemId: inv.id, projectId, qty: qtyToSend },
      });
    }

    return { ok: true, dispatchId: dispatch.id } as const;
  });
}

export async function returnMultipurposeItem(allocationId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');

  await prisma.$transaction(async (tx) => {
    const alloc = await tx.inventoryAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc) throw new Error('Allocation not found');
    if (alloc.returnedAt) return;

    await tx.inventoryItem.update({
      where: { id: alloc.inventoryItemId },
      data: { qty: { increment: alloc.qty }, quantity: { increment: alloc.qty } },
    });
    await tx.inventoryAllocation.update({ where: { id: allocationId }, data: { returnedAt: new Date() } });
  });
  return { ok: true } as const;
}

// wrapper for creating stock dispatch and redirecting
export async function createAndRedirectStockDispatch(projectId: string) {
  'use server';
  const result = await createDispatchFromInventory(projectId);
  if (result.ok) {
    redirect(`/projects/${projectId}/dispatches/${result.dispatchId}`);
  } else {
    // If we fail (e.g. no items), we might want to throw or redirect with error.
    // For now, throw so the error boundary catches it or UI shows it?
    // In server actions, redirect is the way. Passing error back requires client component handling.
    // We will throw, Next.js error boundary/toast might handle it if invoke via useFormState (but we use form action).
    throw new Error(result.error);
  }
}

export async function deleteDispatch(dispatchId: string) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(role)) {
    throw new Error('Unauthorized');
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    select: { id: true, status: true, projectId: true },
  });

  if (!dispatch) throw new Error('Dispatch not found');
  if (dispatch.status !== 'DRAFT') {
    throw new Error('Only DRAFT dispatches can be deleted');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Restore reserved stock
    const items = await tx.dispatchItem.findMany({
      where: { dispatchId, inventoryItemId: { not: null } },
      select: { inventoryItemId: true, qty: true }
    });

    for (const item of items) {
      if (item.inventoryItemId && Number(item.qty) > 0) {
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { qty: { increment: item.qty } }
        });
      }
    }

    // 2. Delete dispatch
    await tx.dispatchItem.deleteMany({
      where: { dispatchId },
    });
    await tx.dispatch.delete({
      where: { id: dispatchId },
    });
  });

  revalidatePath('/dispatches');
  redirect('/dispatches');
}

// --- Inventory Returns ---
type ReturnItemInput = {
  dispatchItemId?: string | null;
  inventoryItemId?: string | null;
  description: string;
  qty: number;
  unit?: string | null;
  note?: string | null;
};

/* export async function returnItemsToInventory(
  dispatchId: string,
  projectId: string | null,
  items: ReturnItemInput[],
  note?: string | null,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');

  const role = (user as any).role as string | undefined;
  if (!['PROJECT_OPERATIONS_OFFICER', 'PROCUREMENT', 'ADMIN'].includes(role ?? '')) {
    throw new Error('Not allowed to create returns');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No items to return');
  }

  const normalized = items
    .map((it) => ({
      dispatchItemId: it.dispatchItemId ?? null,
      inventoryItemId: it.inventoryItemId ?? null,
      description: String(it.description ?? '').trim(),
      qty: Number(it.qty ?? 0),
      unit: it.unit ?? null,
      note: it.note ?? null,
    }))
    .filter((it) => it.qty > 0 && it.description.length > 0);

  if (normalized.length === 0) throw new Error('No positive quantities to return');

  const result = await prisma.$transaction(async (tx) => {
    for (const it of normalized) {
      if (it.dispatchItemId) {
        const d = await tx.dispatchItem.findUnique({
          where: { id: it.dispatchItemId },
          select: { id: true, qty: true },
        });
        if (!d) throw new Error(`Dispatch item ${it.dispatchItemId} not found`);

        // compute how much already returned for this line
        const agg = await tx.inventoryReturnItem.aggregate({
          where: { dispatchItemId: it.dispatchItemId },
          _sum: { qty: true },
        });
        const alreadyReturned = Number(agg._sum.qty ?? 0);
        const available = Math.max(0, Number(d.qty ?? 0) - alreadyReturned);

        if (it.qty > available) {
          throw new Error(
            `Return qty (${it.qty}) exceeds available to return (${available}) for item ${it.dispatchItemId}`,
          );
        }
      }
    }

    const createdReturn = await tx.inventoryReturn.create({
      data: {
        dispatchId,
        projectId: projectId ?? undefined,
        createdById: user.id!,
        note: note ?? null,
      },
    });

    for (const it of normalized) {
      let inventoryItemIdToUse: string | null = it.inventoryItemId ?? null;

      if (!inventoryItemIdToUse) {
        const key = `${it.description.trim()}|${(it.unit ?? '').trim()}`.toLowerCase();
        const found = await tx.inventoryItem.findUnique({ where: { key } });
        if (found) inventoryItemIdToUse = found.id;
      }

      if (!inventoryItemIdToUse) {
        const invName = it.description;
        const unit = it.unit ?? null;
        const key = `${invName.trim()}|${(unit || '').trim()}`.toLowerCase();
        const newInv = await tx.inventoryItem.create({
          data: {
            name: invName,
            description: invName,
            unit,
            key,
            qty: it.qty,
            quantity: it.qty,
            category: 'MULTIPURPOSE',
          },
        });
        inventoryItemIdToUse = newInv.id;
      } else {
        await tx.inventoryItem.update({
          where: { id: inventoryItemIdToUse },
          data: { qty: { increment: it.qty }, quantity: { increment: it.qty } },
        });
      }

      await tx.inventoryReturnItem.create({
        data: {
          returnId: createdReturn.id,
          dispatchItemId: it.dispatchItemId ?? null,
          inventoryItemId: inventoryItemIdToUse,
          description: it.description,
          qty: it.qty,
          unit: it.unit ?? null,
          note: it.note ?? null,
        },
      });

      if (it.dispatchItemId) {
        try {
          await tx.dispatchItem.update({
            where: { id: it.dispatchItemId },
            data: { returnedQty: { increment: it.qty } as any },
          } as any);
        } catch (_) {
          // silently ignore if field not present
        }
      }
    }

    return { ok: true as const, returnId: createdReturn.id };
  });

  revalidatePath(`/dispatches/${dispatchId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return result;
} */


export async function returnItemsToInventory(
  dispatchId: string,
  projectId: string | null,
  rows: {
    dispatchItemId: string;
    inventoryItemId?: string | null;
    description: string;
    unit?: string | null;
    qty: number;
    note?: string | null;
  }[],
  globalNote?: string | null
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: 'Auth required' };

  // allow PROJECT_OPERATIONS_OFFICER, PROCUREMENT, ACCOUNTS, ADMIN etc. adjust as needed:
  if (!['PROJECT_OPERATIONS_OFFICER', 'PROCUREMENT', 'ADMIN', 'SECURITY'].includes(me.role as string)) {
    return { ok: false, error: 'Not authorized to return items' };
  }

  if (!rows || rows.length === 0) return { ok: false, error: 'No return rows provided' };

  return prisma.$transaction(async (tx) => {
    // refresh dispatch items to validate
    const dispatch = await tx.dispatch.findUnique({
      where: { id: dispatchId },
      include: { items: true },
    });
    if (!dispatch) throw new Error('Dispatch not found');

    // prepare create items
    const returnItemsToCreate: any[] = [];

    for (const r of rows) {
      const it = await tx.dispatchItem.findUnique({
        where: { id: r.dispatchItemId },
        select: { id: true, handedOutQty: true, returnedQty: true, usedOutQty: true, inventoryItemId: true },
      });
      if (!it) throw new Error('Dispatch item not found');

      const alreadyHanded = Number(it.handedOutQty ?? 0);
      const alreadyReturned = Number(it.returnedQty ?? 0);
      const alreadyUsed = Number(it.usedOutQty ?? 0);
      const maxReturnable = Math.max(0, alreadyHanded - alreadyReturned - alreadyUsed);

      if (!(r.qty > 0)) throw new Error('Invalid return qty');
      if (r.qty > maxReturnable) {
        throw new Error(`Return qty ${r.qty} exceeds available to return ${maxReturnable}`);
      }

      returnItemsToCreate.push({
        dispatchItemId: r.dispatchItemId,
        inventoryItemId: r.inventoryItemId ?? it.inventoryItemId ?? null,
        description: r.description,
        unit: r.unit ?? null,
        qty: r.qty,
        note: r.note ?? null,
      });
    }

    // create InventoryReturn parent
    const invReturn = await tx.inventoryReturn.create({
      data: {
        dispatchId,
        projectId: projectId ?? null,
        createdById: me.id,
        note: globalNote ?? null,
      },
    });

    // for each returned item: create InventoryReturnItem, update dispatchItem.returnedQty, increment inventory
    for (const r of returnItemsToCreate) {
      await tx.inventoryReturnItem.create({
        data: {
          returnId: invReturn.id,
          dispatchItemId: r.dispatchItemId,
          inventoryItemId: r.inventoryItemId ?? null,
          description: r.description,
          unit: r.unit,
          qty: r.qty,
          note: r.note,
        },
      });

      // increment dispatchItem.returnedQty
      await tx.dispatchItem.update({
        where: { id: r.dispatchItemId },
        data: { returnedQty: { increment: r.qty } },
      });

      // increment inventory if linked
      if (r.inventoryItemId) {
        await tx.inventoryItem.update({
          where: { id: r.inventoryItemId },
          data: { qty: { increment: r.qty }, quantity: { increment: r.qty } },
        });

        // inventory move audit
        await tx.inventoryMove.create({
          data: {
            inventoryItemId: r.inventoryItemId,
            changeById: me.id,
            delta: r.qty,
            reason: 'DISPATCH_RETURN',
            metaJson: JSON.stringify({ dispatchId, dispatchItemId: r.dispatchItemId, returnId: invReturn.id }),
          },
        });
      }
    }

    // revalidate
    revalidatePath(`/dispatches/${dispatchId}`);
    revalidatePath('/dispatches');
    revalidatePath('/inventory');

    return { ok: true, dispatchId };
  });
}

export async function markItemUsedOut(itemId: string, qty?: number): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: 'Auth required' };
  // authorization: PM or SECURITY? adjust
  // we allow PM/PROJECT_OPERATIONS_OFFICER or ADMIN to mark used out
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(me.role as string)) {
    return { ok: false, error: 'Not authorized to mark used out' };
  }

  return prisma.$transaction(async (tx) => {
    const it = await tx.dispatchItem.findUnique({
      where: { id: itemId },
      select: { id: true, handedOutQty: true, returnedQty: true, usedOutQty: true, inventoryItemId: true },
    });
    if (!it) throw new Error('Dispatch item not found');

    const alreadyHanded = Number(it.handedOutQty ?? 0);
    const alreadyReturned = Number(it.returnedQty ?? 0);
    const alreadyUsed = Number(it.usedOutQty ?? 0);
    const remaining = Math.max(0, alreadyHanded - alreadyReturned - alreadyUsed);
    if (remaining <= 0) throw new Error('No remaining qty to mark used out');

    const markQty = qty == null ? remaining : Number(qty);
    if (!(markQty > 0 && markQty <= remaining)) {
      throw new Error(`Invalid used-out qty; remaining=${remaining}`);
    }

    const updated = await tx.dispatchItem.update({
      where: { id: itemId },
      data: { usedOutQty: { increment: markQty } },
      select: { id: true, dispatchId: true, usedOutQty: true, returnedQty: true, handedOutQty: true, inventoryItemId: true },
    });

    // Optionally set a status when fully used
    const newTotalUsed = Number(updated.usedOutQty ?? 0);
    if (newTotalUsed + Number(updated.returnedQty ?? 0) === Number(updated.handedOutQty ?? 0)) {
      await tx.dispatchItem.update({ where: { id: itemId }, data: { /* you might set status field here */ } });
    }

    const moveData: Record<string, any> = {
      delta: 0, // no change to qty now (handout already applied), but record usage
      reason: 'DISPATCH_USED_OUT',
      metaJson: JSON.stringify({ dispatchItemId: itemId, usedQty: markQty }),
    }

    if (it.inventoryItemId) {
      moveData.inventoryItemId = it.inventoryItemId
    }

    if (!me.id) redirect("/login");

    moveData.changeById = me.id;



    // audit: inventoryMove (used out means consumed - but inventory already decreased at handout)
    await tx.inventoryMove.create({
      data: moveData as Prisma.InventoryMoveCreateInput
    });

    revalidatePath('/dispatches');
    revalidatePath(`/dispatches/${it.id}`);

    return { ok: true, dispatchId: updated.dispatchId };
  });
}

export async function createDispatchFromAssets(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Auth required' } as const;

  // Basic check for assets existence
  const assetCount = await prisma.inventoryItem.count({
    where: { category: 'ASSET', qty: { gt: 0 } }
  });

  if (assetCount === 0) {
    return { ok: false, error: 'No assets available to dispatch' } as const;
  }

  try {
    const dispatch = await prisma.dispatch.create({
      data: { projectId, status: 'DRAFT', createdById: user.id ?? null },
      select: { id: true },
    });
    return { ok: true, dispatchId: dispatch.id } as const;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to create asset dispatch' } as const;
  }
}


// app/(protected)/projects/actions.ts
export async function getConsolidatedDispatch(projectId: string) {
  const items = await prisma.dispatchItem.findMany({
    where: { dispatch: { projectId } },
    select: { description: true, unit: true, qty: true, requisitionItemId: true },
  });

  const grouped = new Map<string, { description: string; unit: string | null; qty: number }>();
  for (const it of items) {
    const key = `${it.requisitionItemId ?? it.description}::${it.unit ?? ''}`;
    const prev = grouped.get(key);
    if (prev) {
      prev.qty += it.qty;
    } else {
      grouped.set(key, { description: it.description, unit: it.unit ?? null, qty: it.qty });
    }
  }
  return Array.from(grouped.values());
}

// --- Dispatch editing for PMs ---

export async function updateDispatchItems(
  dispatchId: string,
  updates: { id: string; qty: number; selected?: boolean }[],
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (role !== 'PROJECT_OPERATIONS_OFFICER' && role !== 'ADMIN') {
    throw new Error('Only PM/Admin can edit dispatch items');
  }

  const d = await prisma.dispatch.findUnique({ where: { id: dispatchId }, select: { status: true } });
  if (!d) throw new Error('Dispatch not found');
  if (d.status !== 'DRAFT') throw new Error('Only DRAFT dispatch is editable');

  const projectId = (await prisma.dispatch.findUnique({ where: { id: dispatchId }, select: { projectId: true } }))?.projectId;
  const remainingMap = projectId ? await getRemainingDispatchMap(projectId, dispatchId) : new Map<string, number>();

  for (const u of updates) {
    const item = await prisma.dispatchItem.findUnique({ where: { id: u.id }, include: { purchase: true } });
    if (!item) continue;
    const newQty = Number(u.qty);
    const oldQty = Number(item.qty);
    if (!Number.isFinite(newQty) || newQty < 0) throw new Error('Invalid qty');

    const diff = newQty - oldQty;

    // Validate project-specific items
    if (item.requisitionItemId && projectId) {
      const left = remainingMap.get(item.requisitionItemId) ?? 0;
      if (newQty > left) {
        throw new Error(`Line "${item.description}" exceeds remaining project stock (${left}).`);
      }
    }

    // Cap multipurpose/inventory items by available stock and move physical inventory
    if (item.inventoryItemId) {
      const inv = await prisma.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
      const available = Number(inv?.qty ?? 0);

      // We need to move 'diff' items.
      // If newQty > oldQty, diff is positive (consumption), must be <= available.
      if (diff > available) {
        throw new Error(`You tried to dispatch ${newQty}, but only ${available + oldQty} is available in inventory.`);
      }

      // Perform physical movement
      if (diff !== 0) {
        await prisma.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { qty: { decrement: diff } }
        });
      }
    }

    await prisma.dispatchItem.update({
      where: { id: u.id },
      data: {
        qty: newQty,
        selected: u.selected !== undefined ? u.selected : item.selected
      },
    });
  }

  revalidatePath(`/dispatches/${dispatchId}`);
  return { ok: true };
}

export async function submitDispatch(dispatchId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (role !== 'PROJECT_OPERATIONS_OFFICER' && role !== 'ADMIN') throw new Error('Only PM/Admin can submit a dispatch');

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: { items: true },
  });
  if (!dispatch) throw new Error('Dispatch not found');
  if (dispatch.status !== 'DRAFT') throw new Error('Only DRAFT can be submitted');

  const selected = dispatch.items.filter((i: any) => i.selected !== false);
  if (selected.length === 0) throw new Error('Select at least one item to submit');

  if (dispatch.projectId) {
    const remainingMap = await getRemainingDispatchMap(dispatch.projectId, dispatchId);
    for (const it of selected) {
      if (it.requisitionItemId) {
        const left = remainingMap.get(it.requisitionItemId) ?? 0;
        if (it.qty > left) {
          throw new Error(`Line "${it.description}" exceeds remaining project stock (${left}).`);
        }
      }
    }
  }

  await prisma.dispatch.update({ where: { id: dispatchId }, data: { status: 'APPROVED' } });
  revalidatePath(`/dispatches/${dispatchId}`);
  return { ok: true };
}

export async function addMultipurposeToDispatch(dispatchId: string, inventoryItemId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');
  const role = assertRole(me.role);
  if (role !== 'PROJECT_OPERATIONS_OFFICER' && role !== 'ADMIN') throw new Error('Only PM/Admin can edit dispatch');

  const inv = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!inv) throw new Error('Inventory item not found');
  const available = Number(inv.qty ?? 0);
  if (available <= 0) {
    throw new Error('No stock available for this inventory item');
  }

  await prisma.dispatchItem.create({
    data: {
      dispatchId,
      description: inv.name ?? inv.description,
      unit: inv.unit ?? null,
      qty: 1, // default to 1; user can edit later but will be capped by stock
      selected: true,
      inventoryItemId: inv.id,
    },
  });
  revalidatePath(`/dispatches/${dispatchId}`);
  return { ok: true };
}


/* export async function recordDisbursement(
  fundingRequestId: string,
  args: { amount: number; paidAt: string; ref?: string | null; attachmentUrl?: string | null },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');

  // Clerk or Admin
  if (!['ADMIN', 'ACCOUNTS_CLERK', 'ACCOUNTING_OFFICER'].includes(user.role as any)) {
    throw new Error('Only Accounts may record disbursements');
  }

  const fr = await prisma.fundingRequest.findUnique({
    where: { id: fundingRequestId },
    include: { disbursements: true },
  });
  if (!fr) throw new Error('Funding request not found');
  if (fr.status !== 'APPROVED') throw new Error('Funding request not approved');

  const amountMinor = BigInt(Math.round((args.amount ?? 0) * 100));
  if (amountMinor <= 0n) throw new Error('Invalid amount');

  await prisma.fundDisbursement.create({
    data: {
      fundingRequestId,
      amountMinor,
      paidAt: new Date(args.paidAt),
      ref: args.ref ?? null,
      attachmentUrl: args.attachmentUrl ?? null,
    },
  });
}
 */
// --- Procurement: ask for extra budget (TOP_UP) ---
/* export async function requestTopUp(
  requisitionId: string,
  args: { amount: number; note?: string | null },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');

  if (!['ADMIN', 'PROCUREMENT', 'PROJECT_OPERATIONS_OFFICER'].includes(user.role as any)) {
    throw new Error('Only Procurement / PM can request a top-up');
  }

  const amountMinor = BigInt(Math.round((args.amount ?? 0) * 100));
  if (amountMinor <= 0n) throw new Error('Invalid amount');

  await prisma.fundingRequest.create({
    data: {
      requisitionId,
      type: 'TOP_UP',
      amountMinor,
      status: 'PENDING',
      note: args.note ?? null,
      requestedById: user.id!,
    },
  });
}
 */

export async function markDispatchArrived(dispatchId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');

  const dispatch = await prisma.dispatch.findUnique({ where: { id: dispatchId } });
  if (!dispatch) throw new Error('Dispatch not found');

  // Only allow if currently IN_TRANSIT (Driver picked up)
  // Fallback: Dispatched or Submitted valid too if steps skipped
  if (!['IN_TRANSIT', 'DISPATCHED', 'SUBMITTED'].includes(dispatch.status)) {
    // throw new Error('Dispatch is not in transit');
  }

  await prisma.dispatch.update({
    where: { id: dispatchId },
    data: { status: 'ARRIVED' }
  });
  revalidatePath(`/dispatches/${dispatchId}`);
  return { ok: true };
}

export async function confirmDispatchPickup(dispatchId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');

  const dispatch = await prisma.dispatch.findUnique({ where: { id: dispatchId } });
  if (!dispatch) throw new Error('Dispatch not found');

  if (dispatch.status !== 'DISPATCHED') {
    throw new Error('Dispatch is not ready for pickup (Must be DISPATCHED by Security)');
  }

  await prisma.dispatch.update({
    where: { id: dispatchId },
    data: {
      status: 'IN_TRANSIT',
      departAt: new Date(), // Set departure time
      // Could assign driver here if not already assigned?
    }
  });
  revalidatePath(`/dispatches/${dispatchId}`);
  return { ok: true };
}

export async function acknowledgeDispatch(dispatchId: string, items: { itemId: string; acceptedQty: number; note?: string }[]) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: { items: true }
  });
  if (!dispatch) throw new Error('Dispatch not found');

  // Verify State
  if (!['DISPATCHED', 'ARRIVED'].includes(dispatch.status)) {
    throw new Error('Dispatch not ready for acknowledgment');
  }

  // 1. Update Dispatch Status -> DELIVERED
  await prisma.dispatch.update({
    where: { id: dispatchId },
    data: {
      status: 'DELIVERED',
      receiveAt: new Date(),
      siteAck: 'Acknowledged by Site Manager' // audit log
    }
  });

  // 2. Update Items (Received Qty)
  // For each item sent, find the matching acceptedQty
  for (const item of dispatch.items) {
    const ack = items.find(i => i.itemId === item.id);
    const receivedQty = ack ? ack.acceptedQty : 0; // default to 0 if missing? or full? NO, safer to be explicit

    const qtySent = item.qty; // or handedOutQty if we tracked it explicitly
    const qtyReturned = Math.max(0, qtySent - receivedQty);

    await prisma.dispatchItem.update({
      where: { id: item.id },
      data: {
        receivedAt: new Date(),
        receivedById: me.id,
        // We don't have a receivedQty field in schema yet (checked lines 439-466)
        // It has `usedOutQty`, `returnedQty`. 
        // So we should set `returnedQty` here if there's a difference.
        returnedQty: qtyReturned,
        // We can perhaps store the "Accepted" amount implicitly as (qty - returnedQty)
      }
    });
    // If returnedQty > 0, we should ideally create the InventoryReturn record here as per plan.
    // But user said "just end there for now that site acknowledges".
    // So I will Just set returnedQty for visibility.

    if (qtyReturned > 0) {
      // Create Pending Return logic would go here.
      // For now, we rely on the `returnedQty` field on the item.
      /*
      await prisma.inventoryReturn.create({
        data: {
          dispatchId,
          createdById: me.id,
          status: 'INITIATED', // If we added the enum. But wait, we DID NOT add the enum/status field yet because schema update failed/was skipped.
          // Schema check: Line 848 InventoryReturn.
          // I need to be careful. The user said "schema update" in task.
        }
      }).catch(err => console.log('Skipping return record creation as schema might not match', err));
      */
    }
  }

  revalidatePath(`/dispatches/${dispatchId}`);
  return { ok: true };
}

export async function requestTopUp(requisitionId: string, amount?: number) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Authentication required');

  // Who can request a top-up? PM/Proc/Admin by your process (tweak as needed)
  const role = (me as any).role as string | undefined;
  if (!['ADMIN', 'PROJECT_OPERATIONS_OFFICER', 'PROCUREMENT'].includes(role ?? '')) {
    throw new Error('You do not have permission to request a top-up.');
  }

  // 1) Block if there is an existing active top-up (PENDING or APPROVED)
  const activeTopUp = await prisma.fundingRequest.findFirst({
    where: {
      requisitionId,
      isTopUp: true,
      status: { in: ['PENDING', 'APPROVED'] },
    },
    select: { id: true, status: true, amountMinor: true },
  });
  if (activeTopUp) {
    throw new Error('A top-up request is already active. Wait until it is decided/finished.');
  }

  // Optional: allow top-up only when remaining budget is <= 0 (or below threshold)
  const [approvedAgg, spentAgg] = await Promise.all([
    prisma.fundingRequest.aggregate({
      where: { requisitionId, status: 'APPROVED' },
      _sum: { amountMinor: true },
    }),
    prisma.purchase.aggregate({
      where: { requisitionId },
      _sum: { priceMinor: true },
    }),
  ]);
  const approved = BigInt(approvedAgg._sum.amountMinor ?? 0);
  const spent = BigInt(spentAgg._sum.priceMinor ?? 0);
  const remaining = approved - spent;

  // Example rule: only allow top-up if remaining <= 0
  if (remaining > 0n) {
    throw new Error('There are still approved funds remaining; top-up not allowed yet.');
  }

  // Create the top-up (status PENDING). Amount may be provided or default to gap.
  const amountMinor =
    typeof amount === 'number' && amount > 0 ? toMinor(amount) : (spent - approved > 0n ? spent - approved : 0n);
  if (amountMinor <= 0n) {
    throw new Error('Top-up amount must be greater than zero.');
  }

  await prisma.fundingRequest.create({
    data: {
      requisitionId,
      amountMinor,
      status: 'REQUESTED',
      isTopUp: true,        // <- make sure this boolean exists in your schema
      requestedAt: new Date(),
      requestedById: me.id!,
    },
  });

  revalidatePath(`/requisitions/${requisitionId}`);
  return { ok: true };
}

// --- Guard purchases: enforce budget/cash policy ---
export async function canSpend(requisitionId: string, priceMinor: bigint) {
  const req = await prisma.fundingRequest.findMany({
    where: { requisitionId },
    include: { disbursements: true },
  });
  const approved = req.filter(r => r.status === 'APPROVED')
    .reduce((n, r) => n + Number(r.amountMinor), 0);
  const disbursed = req.reduce((n, r) => n + r.disbursements.reduce((m, d) => m + Number(d.amountMinor), 0), 0);

  const agg = await prisma.purchase.aggregate({
    where: { requisitionId },
    _sum: { priceMinor: true },
  });
  const spentRaw = agg._sum.priceMinor ?? 0;

  // normalize all monetary sums to bigint to avoid mixed number/bigint ops
  const toBigInt = (v: number | bigint) => (typeof v === 'bigint' ? v : BigInt(Math.round(v)));
  const approvedMinor = BigInt(Math.round(approved));
  const disbursedMinor = BigInt(Math.round(disbursed));
  const spentMinor = toBigInt(spentRaw);

  const allowCredit = process.env.ALLOW_PURCHASE_WITHOUT_DISBURSEMENT === 'true';

  const willSpend = spentMinor + priceMinor;
  if (willSpend > approvedMinor) return { ok: false, reason: 'Purchase exceeds approved budget' };
  if (!allowCredit && willSpend > disbursedMinor) return { ok: false, reason: 'Insufficient disbursed cash' };
  return { ok: true };
}

// --- Clerk: record cash out ---
/* export async function recordDisbursement(
  fundingRequestId: string,
  args: { amount: number; paidAt: string; ref?: string | null; attachmentUrl?: string | null },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');

  // Clerk or Admin
  if (!['ADMIN', 'ACCOUNTS', /* 'ACCOUNTING_OFFICER',  'ACCOUNTING_CLERK'].includes(user.role as any)) {
    throw new Error('Only Accounts may record disbursements');
  }

  const fr = await prisma.fundingRequest.findUnique({
    where: { id: fundingRequestId },
    include: { disbursements: true },
  });
  if (!fr) throw new Error('Funding request not found');
  if (fr.status !== 'APPROVED') throw new Error('Funding request not approved');

  const amountMinor = BigInt(Math.round((args.amount ?? 0) * 100));
  if (amountMinor <= 0n) throw new Error('Invalid amount');

  await prisma.fundDisbursement.create({
    data: {
      fundingRequestId,
      amountMinor,
      paidAt: new Date(args.paidAt),
      ref: args.ref ?? null,
      attachmentUrl: args.attachmentUrl ?? null,
    },
  });
} */

/* function toMinor(n: number) {
  return BigInt(Math.round(Number(n) * 100));
} */

function hashText(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Record a disbursement against a single FundingRequest.
 * - CLERK: must be <= approved - alreadyDisbursed
 * - OFFICER/ADMIN: may exceed only with override + reason
 */
// small helper -> stable signed 32-bit int
function hashToInt32(s: string): number {
  const h = crypto.createHash('sha1').update(s).digest(); // 20 bytes
  // take first 4 bytes, interpret as signed 32-bit
  const i = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
  return i | 0; // force int32
}

function hashToBigInt64(s: string): bigint {
  const h = crypto.createHash('sha1').update(s).digest(); // 20 bytes
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(h[i]);
  if (v > 0x7fffffffffffffffn) v -= 0x10000000000000000n; // signed
  return v;
}

export async function recordDisbursement(
  fundingRequestId: string,
  args: { amount: number; paidAt: string; ref?: string | null; attachmentUrl?: string | null },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');

  // Clerk / Officer / Admin
  if (!['ADMIN', 'ACCOUNTING_CLERK', 'ACCOUNTING_OFFICER'].includes((user as any).role)) {
    throw new Error('Only Accounts may record disbursements');
  }

  const amountMinor = BigInt(Math.round((args.amount ?? 0) * 100));
  if (amountMinor <= 0n) throw new Error('Invalid amount');

  await prisma.$transaction(async (tx) => {
    const key64 = hashToBigInt64(`funding:${fundingRequestId}`);
    // 👇 cast ensures Postgres uses pg_advisory_xact_lock(int8)
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${Prisma.sql`${key64}::bigint`})`
    );

    // load FR + totals under the lock
    const fr = await tx.fundingRequest.findUnique({
      where: { id: fundingRequestId },
      include: {
        requisition: true,
        disbursements: { select: { amountMinor: true } },
      },
    });
    if (!fr) throw new Error('Funding request not found');
    if (fr.status !== 'APPROVED') throw new Error('Funding request not approved');

    const approvedMinor = BigInt(fr.amountMinor ?? 0n);
    const alreadyMinor =
      fr.disbursements.reduce<bigint>((a, d) => a + BigInt(d.amountMinor), 0n) ?? 0n;

    // 🚫 prevent over-disbursement
    if (alreadyMinor + amountMinor > approvedMinor) {
      const remaining = Number(approvedMinor - alreadyMinor) / 100;
      throw new Error(
        `Disbursement exceeds approved budget. Remaining you can disburse: ${remaining.toFixed(2)}.`
      );
    }

    await tx.fundDisbursement.create({
      data: {
        fundingRequestId,
        amountMinor,
        paidAt: new Date(args.paidAt),
        ref: args.ref ?? null,
        attachmentUrl: args.attachmentUrl ?? null,
        // createdById: user.id!,
      },
    });
  });

  return { ok: true };
}

// ===== PROCUREMENT =====

// 2.3 create a purchase record (with optional tie to a requisition line)
/* export async function createPurchase(input: {
  requisitionId: string;
  requisitionItemId?: string | null;
  vendor: string;
  taxInvoiceNo: string;
  qty: number;
  price: number; // total price
  date: string;  // yyyy-mm-dd
  invoiceUrl?: string | null; // assume already uploaded; wire your uploader
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  assertRole((user as any).role, ['PROCUREMENT', 'ADMIN']);

  const requisition = await prisma.procurementRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { projectId: true },
  });
  if (!requisition) throw new Error('Requisition not found');

  const purchase = await prisma.purchase.create({
    data: {
      requisitionId: input.requisitionId,
      requisitionItemId: input.requisitionItemId ?? null,
      vendor: input.vendor.trim(),
      taxInvoiceNo: input.taxInvoiceNo.trim(),
      qty: Number(input.qty || 0),
      priceMinor: moneyToMinor(input.price),
      purchasedOn: new Date(input.date),
      invoiceUrl: input.invoiceUrl ?? null,
      createdById: user.id!,
    },
  });

  // optional: if all lines fully purchased -> you can mark requisition "COMPLETED"
  revalidatePath(`/procurement/requisitions/${input.requisitionId}`);
  revalidatePath(`/projects/${requisition.projectId}`);
  return { ok: true, id: purchase.id };
} */


export async function createRequisition(
  projectId: string,
  items: { description: string; qty: number; unit?: string; estPrice?: number }[],
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'PROJECT_OPERATIONS_OFFICER' && role !== 'ADMIN') {
    throw new Error('Only Project Managers or Admin can create requisitions');
  }

  return prisma.$transaction(
    async (tx) => {
      const requisition = await tx.procurementRequisition.create({
        data: {
          projectId,
          status: 'SUBMITTED',
          submittedById: user.id ?? null,
        },
      });

      if (items.length) {
        await tx.procurementRequisitionItem.createMany({
          data: items.map((item) => ({
            requisitionId: requisition.id,
            description: item.description,
            qty: item.qty,
            unit: item.unit ?? null,
            estPriceMinor: toMinor(item.estPrice ?? 0),
          })),
        });
      }

      const totalMinor = items.reduce<bigint>((acc, item) => acc + toMinor(item.estPrice ?? 0), 0n);
      await tx.fundingRequest.create({
        data: {
          requisitionId: requisition.id,
          amountMinor: totalMinor,
        },
      });

      return { ok: true, requisitionId: requisition.id };
    },
    TX_OPTS,
  );
}

export async function submitRequisitionToProcurement(requisitionId: string) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(role)) {
    throw new Error('Only Project Manager or Admin can submit requisitions');
  }

  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    select: { id: true, status: true, projectId: true },
  });
  if (!req) throw new Error('Requisition not found');
  if (req.status !== 'DRAFT') {
    throw new Error('Only DRAFT requisitions can be submitted');
  }

  await prisma.procurementRequisition.update({
    where: { id: requisitionId },
    data: {
      status: 'SUBMITTED',
      submittedById: user.id,
    },
  });

  revalidatePath(`/projects/${req.projectId}`);
  redirect(`/projects/${req.projectId}/requisitions`);
}

export async function createRequisitionFromQuotePicks(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');

  const projectId = String(formData.get('projectId') || '');
  const draftRequisitionId = String(formData.get('draftRequisitionId') || '');
  if (!projectId) throw new Error('Missing projectId');
  await ensureProjectAccess(projectId, user);
  const assignedProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { assignedToId: true },
  });
  if (!assignedProject?.assignedToId) {
    throw new Error('Assign a Project Operations Officer before creating a requisition.');
  }

  type PickRow = {
    quoteLineId: string;
    qty: number;
  };

  const picks: PickRow[] = [];
  let idx = 0;
  while (idx < 200) {
    const ql = formData.get(`pick-${idx}-quoteLineId`);
    if (!ql) break;
    const included = formData.get(`pick-${idx}-include`);
    const qtyRaw = formData.get(`pick-${idx}-qty`);
    const baseQty = Math.max(0, Number(qtyRaw || 0));
    if (included && baseQty > 0) {
      picks.push({
        quoteLineId: String(ql),
        qty: baseQty,
      });
    }
    idx++;
  }

  if (picks.length === 0) {
    throw new Error('Select at least one item');
  }

  const quoteLines = await prisma.quoteLine.findMany({
    where: { id: { in: picks.map((p) => p.quoteLineId) } },
    select: {
      id: true,
      description: true,
      unit: true,
      metaJson: true,
      quantity: true,
      lineTotalMinor: true,
    },
  });
  const quoteLineById = new Map(quoteLines.map((line) => [line.id, line]));

  const itemsToCreate = picks.map((p) => {
    const ql = quoteLineById.get(p.quoteLineId);
    if (!ql) {
      throw new Error('Quote line not found for a selected requisition row.');
    }

    let unit: string | null = ql.unit ?? null;
    if (!unit) {
      try {
        const meta = ql.metaJson ? JSON.parse(ql.metaJson) : null;
        if (typeof meta?.unit === 'string' && meta.unit.trim().length) unit = meta.unit;
      } catch {
        // ignore malformed meta JSON and fall back to null
      }
    }

    return {
      description: ql.description,
      unit,
      qty: Math.max(0, p.qty),
      qtyRequested: Math.max(0, p.qty),
      estPriceMinor: ql.lineTotalMinor ?? 0n,
      amountMinor: ql.lineTotalMinor ?? 0n,
      quoteLineId: ql.id,
    };
  });

  const req = await prisma.$transaction(async (tx) => {
    if (draftRequisitionId) {
      const existingDraft = await tx.procurementRequisition.findUnique({
        where: { id: draftRequisitionId },
        select: { id: true, projectId: true, status: true },
      });

      if (!existingDraft || existingDraft.projectId !== projectId) {
        throw new Error('Draft requisition not found.');
      }

      if (existingDraft.status !== 'DRAFT') {
        throw new Error('Only draft requisitions can be edited.');
      }

      await tx.procurementRequisitionItem.deleteMany({
        where: { requisitionId: existingDraft.id },
      });

      return tx.procurementRequisition.update({
        where: { id: existingDraft.id },
        data: {
          items: {
            create: itemsToCreate,
          },
        },
        include: { items: true },
      });
    }

    return tx.procurementRequisition.create({
      data: {
        projectId,
        status: 'DRAFT',
        items: {
          create: itemsToCreate,
        },
      },
      include: { items: true },
    });
  }, TX_OPTS);

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/requisitions/${req.id}`);
}

export async function createRequisitionFromQuote(
  projectId: string,
  picks: Array<{ quoteLineId: string; qtyRequested?: number }>,
): Promise<Result> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Authentication required');

    // load quote lines for the project’s quote
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { quote: { include: { lines: true } } },
    });
    if (!project?.quote) throw new Error('Project/quote not found');
    if (project.status === 'CREATED' || project.status === 'DEPOSIT_PENDING') {
      throw new Error('Project deposit not received yet');
    }

    const lineById = new Map(project.quote.lines.map((l) => [l.id, l]));

    const itemsToCreate = picks
      .map((p) => {
        const line = lineById.get(p.quoteLineId);
        if (!line) return null;

        // prefer an explicit unit on the line, else meta.unit
        const unit =
          (line as any).unit ??
          (() => {
            try {
              const meta = (line as any).metaJson ? JSON.parse((line as any).metaJson) : null;
              return typeof meta?.unit === 'string' ? meta.unit : null;
            } catch {
              return null;
            }
          })();

        // derive per-unit total from quote line totals (includes VAT/discounts if present)
        const qtyOnQuote = Number((line as any).quantity) || 1;
        const lineTotalMinor = BigInt((line as any).lineTotalMinor ?? 0);
        const perUnitTotalMinor = qtyOnQuote > 0 ? lineTotalMinor / BigInt(qtyOnQuote) : 0n;

        const qtyRequested = Number(p.qtyRequested ?? qtyOnQuote);
        const qtyScaled = BigInt(Math.max(0, Math.round(qtyRequested * 100)));
        const amountMinor = (perUnitTotalMinor * qtyScaled) / 100n;

        return {
          description: (line as any).description as string,
          unit: unit as string | null,
          qtyRequested: qtyRequested,
          amountMinor: amountMinor,
          quoteLineId: (line as any).id as string,
        };
      })
      .filter(Boolean) as {
        description: string;
        unit: string | null;
        qtyRequested: number;
        amountMinor: bigint;
        quoteLineId: string;
      }[];

    if (itemsToCreate.length === 0) throw new Error('Pick at least one item');

    const req = await prisma.procurementRequisition.create({
      data: {
        projectId,
        status: 'SUBMITTED',
        submittedById: user.id ?? null,
        items: { create: itemsToCreate },
      },
      include: { items: true },
    });

    return { ok: true, requisitionId: req.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed to create requisition' };
  }
}

export async function approveFunding(fundingRequestId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (
    role !== 'ADMIN' &&
    role !== 'ACCOUNTS' &&
    role !== 'ACCOUNTING_CLERK' &&
    role !== 'MANAGING_DIRECTOR'
  ) {
    throw new Error('Only Accounts or Admin users can approve funding');
  }

  return prisma.$transaction(
    async (tx) => {
      const fr = await tx.fundingRequest.update({
        where: { id: fundingRequestId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          lastReminderAt: null,
          reminderCount: 0,
          decidedById: user.id!,
        },
        select: { requisition: { select: { id: true, projectId: true } } },
      });

      // Status changes to APPROVED so that purchasing/dispatch can begin
      await tx.procurementRequisition.update({
        where: { id: fr.requisition.id },
        data: { status: 'APPROVED' },
      });

      revalidatePath(`/procurement/requisitions/${fr.requisition.id}`);
      revalidatePath(`/projects/${fr.requisition.projectId}`);

      return { ok: true };
    },
    TX_OPTS,
  );
}

export async function rejectFunding(fundingId: string, reason: string) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (
    ![
      'ACCOUNTS',
      'ACCOUNTING_CLERK',
      'ACCOUNTING_OFFICER',
      'ACCOUNTING_AUDITOR',
      'ADMIN',
      'MANAGING_DIRECTOR',
    ].includes(role)
  )
    throw new Error('Only Accounts roles');

  const reasonClean = (reason ?? '').trim();
  if (!reasonClean) throw new Error('Please provide a reason for rejection');

  const fr = await prisma.fundingRequest.update({
    where: { id: fundingId },
    data: {
      status: 'REJECTED',
      decidedById: user.id!,
      decidedAt: new Date(),
      reason: reasonClean,
    },
    include: { requisition: { select: { id: true, projectId: true } } },
  });
  revalidatePath(`/projects/${fr.requisition.projectId}`);
  revalidatePath(`/procurement/requisitions/${fr.requisition.id}`);
}

/* export async function createPurchase(
  requisitionId: string,
  input: { vendor: string; taxInvoiceNo: string; price: number; purchasedAt: string; attachmentsJson?: string | null },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'ADMIN' && role !== 'PROCUREMENT') {
    throw new Error('Only Procurement or Admin can record purchases');
  }

  await prisma.purchase.create({
    data: {
      requisitionId,
      vendor: input.vendor,
      taxInvoiceNo: input.taxInvoiceNo,
      priceMinor: toMinor(input.price),
      purchasedAt: new Date(input.purchasedAt),
      attachmentsJson: input.attachmentsJson ?? null,
    },
  });

  await prisma.procurementRequisition.update({
    where: { id: requisitionId },
    data: { status: 'PURCHASED' },
  });

  return { ok: true };
} */

/* export async function createPurchase(input: {
  requisitionId: string;
  requisitionItemId?: string | null;
  vendor: string;
  taxInvoiceNo: string;
  qty: number;
  price: number; // total price
  date: string;  // yyyy-mm-dd
  invoiceUrl?: string | null; // assume already uploaded; wire your uploader
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  assertRoles((user as any).role, ['PROCUREMENT', 'ADMIN']);

  const requisition = await prisma.procurementRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { projectId: true },
  });
  if (!requisition) throw new Error('Requisition not found');

  const purchase = await prisma.purchase.create({
    data: {
      requisitionId: input.requisitionId,
      requisitionItemId: input.requisitionItemId ?? null,
      vendor: input.vendor.trim(),
      taxInvoiceNo: input.taxInvoiceNo.trim(),
      qty: Number(input.qty || 0),
      priceMinor: moneyToMinor(input.price),
      purchasedOn: new Date(input.date),
      invoiceUrl: input.invoiceUrl ?? null,
      createdById: user.id!,
    },
  });

  // optional: if all lines fully purchased -> you can mark requisition "COMPLETED"
  revalidatePath(`/procurement/requisitions/${input.requisitionId}`);
  revalidatePath(`/projects/${requisition.projectId}`);
  return { ok: true, id: purchase.id };
} */

/* export async function createPurchase(input: {
  requisitionId: string;
  requisitionItemId?: string | null;
  vendor: string;
  taxInvoiceNo: string;
  qty: number;
  price: number;
  date: string;
  invoiceUrl?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  assertRoles((user as any).role, ['PROCUREMENT', 'ADMIN']);

  

  // Validate numeric inputs early
  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero');
  const price = Number(input.price);
  if (!(price >= 0)) throw new Error('Price must be a valid number');

  // If tied to a specific requisition line, compute remaining
  if (input.requisitionItemId) {
    const [item, agg] = await Promise.all([
      prisma.procurementRequisitionItem.findUnique({
        where: { id: input.requisitionItemId },
        select: { id: true, qty: true, requisitionId: true },
      }),
      prisma.purchase.aggregate({
        where: { requisitionItemId: input.requisitionItemId },
        _sum: { qty: true },
      }),
    ]);
    if (!item) throw new Error('Requisition line not found');

    const already = Number(agg._sum.qty ?? 0);
    const remaining = Math.max(0, Number(item.qty) - already);
    if (qty > remaining) {
      throw new Error(`Requested qty (${qty}) exceeds remaining (${remaining}).`);
    }
  }

  const requisition = await prisma.procurementRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { projectId: true },
  });
  if (!requisition) throw new Error('Requisition not found');

  

  await prisma.purchase.create({
    data: {
      requisitionId: input.requisitionId,
      requisitionItemId: input.requisitionItemId ?? null,
      vendor: input.vendor.trim(),
      taxInvoiceNo: input.taxInvoiceNo.trim(),
      qty,
      priceMinor: BigInt(Math.round(price * 100)),
      purchasedOn: new Date(input.date),
      invoiceUrl: input.invoiceUrl ?? null,
      createdById: user.id!,
    },
  });

  revalidatePath(`/procurement/requisitions/${input.requisitionId}`);
  revalidatePath(`/projects/${requisition.projectId}`);
  return { ok: true };
} */




/* export async function createPurchase(input: {
  requisitionId: string;
  requisitionItemId?: string | null;
  vendor: string;
  taxInvoiceNo: string;
  qty: number;
  price: number;          // TOTAL price of this purchase (major units)
  date: string;
  invoiceUrl?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  // Only Procurement/Admin may purchase
  if (!['PROCUREMENT', 'ADMIN'].includes((user as any).role)) {
    throw new Error('Only Procurement can record purchases');
  }

  // Validate numeric inputs early
  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero');
  const price = Number(input.price);
  if (!(price >= 0)) throw new Error('Price must be a valid number');

  // If tied to a specific requisition line, enforce remaining-qty rule
  if (input.requisitionItemId) {
    const [item, agg] = await Promise.all([
      prisma.procurementRequisitionItem.findUnique({
        where: { id: input.requisitionItemId },
        select: { id: true, qty: true, requisitionId: true },
      }),
      prisma.purchase.aggregate({
        where: { requisitionItemId: input.requisitionItemId },
        _sum: { qty: true },
      }),
    ]);
    if (!item) throw new Error('Requisition line not found');

    const already = Number(agg._sum.qty ?? 0);
    const remaining = Math.max(0, Number(item.qty) - already);
    if (qty > remaining) {
      throw new Error(`Requested qty (${qty}) exceeds remaining (${remaining}).`);
    }
  }

  const requisition = await prisma.procurementRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { projectId: true },
  });
  if (!requisition) throw new Error('Requisition not found');

  // ⬇️ NEW: enforce budget/disbursement guard
  const priceMinor = BigInt(Math.round(price * 100)); // total purchase amount in minor units
  const guard = await canSpend(input.requisitionId, priceMinor);
  if (!guard.ok) {
    throw new Error(guard.reason ?? 'Cannot create purchase (budget/disbursement policy)');
  }

  await prisma.purchase.create({
    data: {
      requisitionId: input.requisitionId,
      requisitionItemId: input.requisitionItemId ?? null,
      vendor: input.vendor.trim(),
      taxInvoiceNo: input.taxInvoiceNo.trim(),
      qty,
      priceMinor, // already computed
      purchasedOn: new Date(input.date),
      invoiceUrl: input.invoiceUrl ?? null,
      createdById: user.id!,
    },
  });

  revalidatePath(`/procurement/requisitions/${input.requisitionId}`);
  revalidatePath(`/projects/${requisition.projectId}`);
  return { ok: true };
} */

/* export async function createPurchase(input: {
  requisitionId: string;
  requisitionItemId?: string | null;
  vendor: string;
  taxInvoiceNo: string;
  qty: number;
  price: number;
  date: string;
  invoiceUrl?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');

  // only procurement/admin
  if (!['PROCUREMENT', 'ADMIN'].includes(user.role as string)) {
    throw new Error('Only Procurement can record purchases');
  }

  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero');

  const price = Number(input.price);
  if (!(price >= 0)) throw new Error('Price must be a valid number');

  // if tied to a line, validate against *qtyRequested* first, then fallback to old qty
  if (input.requisitionItemId) {
    const [item, agg] = await Promise.all([
      prisma.procurementRequisitionItem.findUnique({
        where: { id: input.requisitionItemId },
        select: {
          id: true,
          requisitionId: true,
          qty: true,
          qtyRequested: true,
        },
      }),
      prisma.purchase.aggregate({
        where: { requisitionItemId: input.requisitionItemId },
        _sum: { qty: true },
      }),
    ]);

    if (!item) throw new Error('Requisition line not found');

    // prefer the new field
    const lineQty = item.qtyRequested && item.qtyRequested > 0 ? item.qtyRequested : item.qty;
    const already = Number(agg._sum.qty ?? 0);
    const remaining = Math.max(0, Number(lineQty) - already);

    if (qty > remaining) {
      throw new Error(`Requested qty (${qty}) exceeds remaining (${remaining}).`);
    }
  }

  // get project for revalidate
  const requisition = await prisma.procurementRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { projectId: true },
  });
  if (!requisition) throw new Error('Requisition not found');

  // 1) create purchase
  const purchase = await prisma.purchase.create({
    data: {
      requisitionId: input.requisitionId,
      requisitionItemId: input.requisitionItemId ?? null,
      vendor: input.vendor.trim(),
      taxInvoiceNo: input.taxInvoiceNo.trim(),
      qty,
      priceMinor: BigInt(Math.round(price * 100)),
      purchasedOn: new Date(input.date),
      invoiceUrl: input.invoiceUrl ?? null,
      createdById: user.id!,
    },
    include: { requisitionItem: true },
  });

  // 2) auto-add to inventory (by purchase)
  const invName = purchase.requisitionItem?.description ?? `${input.vendor.trim()} / ${input.taxInvoiceNo.trim()}`;
  const unit = purchase.requisitionItem?.unit ?? null;
  const key = `${invName.trim()}|${(unit || '').trim()}`.toLowerCase();

  

  await prisma.inventoryItem.upsert({
    where: { purchaseId: purchase.id },
    update: {
      qty: { increment: qty },
      quantity: { increment: qty },
    },
    create: {
      purchaseId: purchase.id,
      name: invName,
      description: invName,
      unit,
      key,
      qty,
      quantity: qty,
      category: 'MATERIAL',
    },
  });

  // refresh relevant pages
  revalidatePath(`/procurement/requisitions/${input.requisitionId}`);
  revalidatePath(`/projects/${requisition.projectId}`);
  revalidatePath(`/inventory`);

  return { ok: true };
} */

function buildInventoryKey(name: string, unit: string | null | undefined) {
  return `${name.trim().toLowerCase()}::${(unit ?? '').trim().toLowerCase()}`;
}

/* export async function createPurchase(input: {
  requisitionId: string;
  requisitionItemId?: string | null;
  vendor: string;
  taxInvoiceNo: string;
  qty: number;
  price: number;
  date: string;
  invoiceUrl?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
 
  // only procurement/admin
  if (!['PROCUREMENT', 'ADMIN'].includes(user.role as string)) {
    throw new Error('Only Procurement can record purchases');
  }
 
  // 1) sanitize numbers
  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero');
 
  const price = Number(input.price);
  if (!(price >= 0)) throw new Error('Price must be a valid number');
 
  // 2) if this purchase is for a specific requisition line, enforce remaining qty
  if (input.requisitionItemId) {
    const [item, agg] = await Promise.all([
      prisma.procurementRequisitionItem.findUnique({
        where: { id: input.requisitionItemId },
        select: {
          id: true,
          requisitionId: true,
          qty: true,
          qtyRequested: true,
          description: true,
          unit: true,
        },
      }),
      prisma.purchase.aggregate({
        where: { requisitionItemId: input.requisitionItemId },
        _sum: { qty: true },
      }),
    ]);
 
    if (!item) throw new Error('Requisition line not found');
 
    const lineQty =
      item.qtyRequested && item.qtyRequested > 0 ? item.qtyRequested : item.qty;
 
    const already = Number(agg._sum.qty ?? 0);
    const remaining = Math.max(0, Number(lineQty) - already);
 
    if (qty > remaining) {
      throw new Error(`Requested qty (${qty}) exceeds remaining (${remaining}).`);
    }
  }
 
  // 3) fetch requisition for project id
  const requisition = await prisma.procurementRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { projectId: true },
  });
  if (!requisition) throw new Error('Requisition not found');
 
  // 4) create the purchase record
  const purchase = await prisma.purchase.create({
    data: {
      requisitionId: input.requisitionId,
      requisitionItemId: input.requisitionItemId ?? null,
      vendor: input.vendor.trim(),
      taxInvoiceNo: input.taxInvoiceNo.trim(),
      qty,
      priceMinor: BigInt(Math.round(price * 100)),
      purchasedOn: new Date(input.date),
      invoiceUrl: input.invoiceUrl ?? null,
      createdById: user.id!,
    },
    include: {
      requisitionItem: true,
    },
  });
 
  // 5) auto-add to INVENTORY
  const invName =
    purchase.requisitionItem?.description ||
    `${input.vendor.trim()} / ${input.taxInvoiceNo.trim()}`;
  const invUnit = purchase.requisitionItem?.unit ?? '';
  const invKey = buildInventoryKey(invName, invUnit);
 
  // this assumes you added:
  // @@unique([name, unit])
  // to InventoryItem
  await prisma.inventoryItem.upsert({
    where: {
      name_unit: {
        name: invName,
        unit: invUnit,
      },
    },
    update: {
      qty: { increment: qty },
    },
    create: {
      name: invName,
      unit: invUnit,
      qty,
      // the two you were missing:
      key: invKey,
      description: invName,
      category: 'MATERIAL',
    },
  });
 
  // 6) refresh relevant screens
  revalidatePath(`/procurement/requisitions/${input.requisitionId}`);
  revalidatePath(`/projects/${requisition.projectId}`);
  revalidatePath('/inventory');
 
  return { ok: true };
} */



export async function requestTopUpForItem(requisitionItemId: string, qty: number, note?: string | null) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (!['PROCUREMENT', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN'].includes(role))
    throw new Error('Not authorized to request a top-up');
  if (!(qty > 0)) throw new Error('Top-up qty must be greater than zero');

  const item = await prisma.procurementRequisitionItem.findUnique({
    where: { id: requisitionItemId },
    select: {
      requisitionId: true,
      extraRequestedQty: true,
      requisition: { select: { projectId: true } },
    },
  });
  if (!item) throw new Error('Requisition item not found');

  await prisma.$transaction(async (tx) => {
    await tx.requisitionItemTopup.create({
      data: {
        requisitionItemId,
        qtyRequested: qty,
        requestedById: user.id!,
        reason: note?.trim() ? note.trim() : null,
      },
    });
    const nextExtra = Number(item.extraRequestedQty ?? 0) + qty;
    await tx.procurementRequisitionItem.update({
      where: { id: requisitionItemId },
      data: { extraRequestedQty: nextExtra },
    });
  });

  revalidatePath(`/procurement/requisitions/${item.requisitionId}`);
  revalidatePath('/procurement/requisitions');
  revalidatePath('/procurement/approvals');
  if (item.requisition?.projectId) revalidatePath(`/projects/${item.requisition.projectId}`);
  return { ok: true };
}

// function sendRequisitionForReview removed (replaced by newer version at bottom)

export async function approveTopUpRequest(topupId: string, approve = true) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (!['PROJECT_COORDINATOR', 'ADMIN'].includes(role)) {
    throw new Error('Only Senior PM or Admin users can approve top-up requests');
  }

  const topup = await prisma.requisitionItemTopup.findUnique({
    where: { id: topupId },
    include: {
      requisitionItem: {
        select: {
          id: true,
          requisitionId: true,
          extraRequestedQty: true,
          qtyRequested: true,
          estPriceMinor: true,
          requestedUnitPriceMinor: true,
          requisition: { select: { projectId: true } },
        },
      },
    },
  });
  if (!topup) throw new Error('Top-up request not found');

  await prisma.$transaction(async (tx) => {
    await tx.requisitionItemTopup.update({
      where: { id: topupId },
      data: { approved: approve, decidedById: user.id!, decidedAt: new Date() },
    });
    const baseExtra = Number(topup.requisitionItem.extraRequestedQty ?? 0);
    const updatedExtra = Math.max(baseExtra - topup.qtyRequested, 0);
    const updateData: {
      qtyRequested?: number;
      extraRequestedQty: number;
      estPriceMinor?: bigint;
    } = { extraRequestedQty: updatedExtra };

    if (approve) {
      const prevQty = Number(topup.requisitionItem.qtyRequested ?? 0);
      const unitMinor =
        topup.requisitionItem.requestedUnitPriceMinor != null
          ? topup.requisitionItem.requestedUnitPriceMinor
          : prevQty > 0
            ? ((topup.requisitionItem.estPriceMinor ?? 0n) * 100n) /
            BigInt(Math.round(prevQty * 100))
            : 0n;
      const extraQtyMinor = BigInt(Math.round(topup.qtyRequested * 100));
      const extraMinor = (unitMinor * extraQtyMinor) / 100n;

      updateData.qtyRequested = prevQty + topup.qtyRequested;
      updateData.estPriceMinor = (topup.requisitionItem.estPriceMinor ?? 0n) + extraMinor;
    }

    await tx.procurementRequisitionItem.update({
      where: { id: topup.requisitionItemId },
      data: updateData,
    });
  });

  revalidatePath(`/procurement/requisitions/${topup.requisitionItem.requisitionId}`);
  if (topup.requisitionItem.requisition?.projectId)
    revalidatePath(`/projects/${topup.requisitionItem.requisition.projectId}`);
  return { ok: true };
}

export async function requestItemReview(requisitionItemId: string, flag: boolean) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (!['PROCUREMENT', 'PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(role))
    throw new Error('Not authorized to update review state');

  const item = await prisma.procurementRequisitionItem.update({
    where: { id: requisitionItemId },
    data: {
      reviewRequested: flag,
      reviewApproved: false,
      // @ts-ignore
      stagedUnitPriceMinor: flag ? undefined : 0n, // Reset if un-flagging
    },
    select: { requisitionId: true, requisition: { select: { projectId: true } } },
  });

  if (!flag) await clearReviewSubmissionIfNone(item.requisitionId);

  revalidatePath(`/procurement/requisitions/${item.requisitionId}`);
  revalidatePath('/procurement/requisitions');
  revalidatePath('/procurement/approvals');
  if (item.requisition?.projectId) revalidatePath(`/projects/${item.requisition.projectId}`);
  return { ok: true };
}

export async function approveItemReview(requisitionItemId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (!['SENIOR_PROCUREMENT', 'MANAGING_DIRECTOR', 'ADMIN'].includes(role))
    throw new Error('Not authorized to approve reviews');

  // Calculate new amount based on the APPROVED requested price (or Staged if present)
  const pendingItem = await prisma.procurementRequisitionItem.findUnique({
    where: { id: requisitionItemId },
    select: {
      qty: true,
      qtyRequested: true,
      requestedUnitPriceMinor: true,
      // @ts-ignore
      stagedUnitPriceMinor: true
    }
  });

  // @ts-ignore
  const staged = BigInt(pendingItem?.stagedUnitPriceMinor ?? 0n);
  const requested = pendingItem?.requestedUnitPriceMinor ?? 0n;

  // If staged price exists (In-Place Review), promote it. Otherwise use requested (Post-Funding Split).
  const newUnitMinor = staged > 0n ? staged : requested;

  const qty = Number(pendingItem?.qtyRequested ?? pendingItem?.qty ?? 0);
  const newAmountMinor = BigInt(qty) * newUnitMinor;

  const item = await prisma.procurementRequisitionItem.update({
    where: { id: requisitionItemId },
    data: {
      reviewApproved: true,
      reviewRequested: false,
      requestedUnitPriceMinor: newUnitMinor, // Promote staged -> requested
      amountMinor: newAmountMinor,           // Update total budget
      // @ts-ignore
      stagedUnitPriceMinor: 0n               // Clear staged
    },
    select: { requisitionId: true, requisition: { select: { projectId: true } } },
  });

  await clearReviewSubmissionIfNone(item.requisitionId);

  revalidatePath(`/procurement/requisitions/${item.requisitionId}`);
  revalidatePath('/procurement/requisitions');
  revalidatePath('/procurement/approvals');
  if (item.requisition?.projectId) revalidatePath(`/projects/${item.requisition.projectId}`);
  return { ok: true };
}

export async function rejectItemReview(requisitionItemId: string, reason?: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (!['SENIOR_PROCUREMENT', 'MANAGING_DIRECTOR', 'ADMIN'].includes(role))
    throw new Error('Not authorized to reject reviews');

  const item = await prisma.procurementRequisitionItem.findUnique({
    where: { id: requisitionItemId },
    select: {
      requisitionId: true,
      requisition: { select: { projectId: true } },
    },
  });
  if (!item) throw new Error('Requisition item not found');

  await prisma.procurementRequisitionItem.update({
    where: { id: requisitionItemId },
    data: {
      reviewRequested: false,
      reviewApproved: false,
      requestedUnitPriceMinor: 0n,
      // @ts-ignore
      reviewRejectionReason: reason || 'Rejected by Senior Procurement',
    },
  });

  await clearReviewSubmissionIfNone(item.requisitionId);

  revalidatePath(`/procurement/requisitions/${item.requisitionId}`);
  revalidatePath('/procurement/requisitions');
  revalidatePath('/procurement/approvals');
  if (item.requisition?.projectId) revalidatePath(`/projects/${item.requisition.projectId}`);
  return { ok: true };
}

export async function updateRequisitionItemUnitPrice(
  requisitionItemId: string,
  unitPriceMajor: number,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (!['PROCUREMENT', 'ADMIN'].includes(role))
    throw new Error('Not authorized to edit unit price');
  const price = Number(unitPriceMajor);
  if (!(price >= 0)) throw new Error('Invalid unit price');

  const item = await prisma.procurementRequisitionItem.findUnique({
    where: { id: requisitionItemId },
    select: {
      requisitionId: true,
      requisition: { select: { projectId: true } },
      reviewRequested: true,
      amountMinor: true,
      qty: true,
      qtyRequested: true,
    },
  });
  if (!item) throw new Error('Requisition item not found');

  const quotedQty = Number(item.qty ?? item.qtyRequested ?? 0);
  const quotedTotalMajor = Number(item.amountMinor ?? 0n) / 100;
  const quotedUnitMajor =
    quotedQty > 0 ? quotedTotalMajor / quotedQty : quotedTotalMajor > 0 ? quotedTotalMajor : 0;

  if (!item.reviewRequested && quotedUnitMajor > 0 && price > quotedUnitMajor) {
    throw new Error('UNIT_PRICE_EXCEEDS_QUOTE');
  }

  const priceMinor = BigInt(Math.round(price * 100));

  // SEPARATION OF CONCERNS:
  // If review is requested, we update the STAGED price.
  // If not, we update the main APPROVED/REQUESTED price.

  if (item.reviewRequested) {
    await prisma.procurementRequisitionItem.update({
      where: { id: requisitionItemId },
      // @ts-ignore
      data: { stagedUnitPriceMinor: priceMinor },
    });
  } else {
    await prisma.procurementRequisitionItem.update({
      where: { id: requisitionItemId },
      data: { requestedUnitPriceMinor: priceMinor },
    });
  }

  revalidatePath(`/procurement/requisitions/${item.requisitionId}`);
  revalidatePath('/procurement/requisitions');
  revalidatePath('/procurement/approvals');
  if (item.requisition?.projectId) revalidatePath(`/projects/${item.requisition.projectId}`);
  return { ok: true };
}

export async function saveUnitPricesForRequisition(
  requisitionId: string,
  updates: Array<{ itemId: string; unitPriceMajor: number }>,
) {
  if (!updates.length) return;
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (!['PROCUREMENT', 'ADMIN', 'PROJECT_OPERATIONS_OFFICER'].includes(role)) {
    throw new Error('Not authorized to edit unit prices');
  }

  const items = await prisma.procurementRequisitionItem.findMany({
    where: { requisitionId, id: { in: updates.map((u) => u.itemId) } },
    select: { id: true, reviewRequested: true },
  });

  const itemMap = new Map(items.map(it => [it.id, it]));

  await prisma.$transaction(
    updates
      .filter((upd) => itemMap.has(upd.itemId))
      .map((upd) => {
        const item = itemMap.get(upd.itemId)!;
        const priceMinor = BigInt(Math.max(0, Math.round(upd.unitPriceMajor * 100)));

        if (item.reviewRequested) {
          return prisma.procurementRequisitionItem.update({
            where: { id: upd.itemId },
            // @ts-ignore
            data: { stagedUnitPriceMinor: priceMinor }
          });
        } else {
          return prisma.procurementRequisitionItem.update({
            where: { id: upd.itemId },
            data: { requestedUnitPriceMinor: priceMinor }
          });
        }
      }),
  );
}

export async function createPurchase(input: {
  requisitionId: string;
  requisitionItemId?: string | null;
  vendor: string;
  taxInvoiceNo: string;
  vendorPhone?: string | null;
  qty: number;
  price?: number;
  unitPrice?: number;
  date: string;
  invoiceUrl?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  if (!['PROCUREMENT', 'ADMIN', 'SECURITY'].includes(user.role as string)) throw new Error('Only Procurement/Security can record purchases');

  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero');
  const unitPrice = Number(input.unitPrice ?? input.price);
  const totalPrice = unitPrice * qty;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Unit price must be a valid number');
  if (!Number.isFinite(totalPrice) || totalPrice < 0) throw new Error('Total price must be a valid number');

  // Validate against requisition item remaining (if provided)
  if (input.requisitionItemId) {
    const [item, agg] = await Promise.all([
      prisma.procurementRequisitionItem.findUnique({
        where: { id: input.requisitionItemId },
        select: { id: true, qty: true, qtyRequested: true, requisitionId: true },
      }),
      prisma.purchase.aggregate({
        where: { requisitionItemId: input.requisitionItemId },
        _sum: { qty: true },
      }),
    ]);
    if (!item) throw new Error('Requisition line not found');
    const lineQty = item.qtyRequested && item.qtyRequested > 0 ? item.qtyRequested : item.qty;
    const already = Number(agg._sum.qty ?? 0);
    const remaining = Math.max(0, Number(lineQty) - already);
    if (qty > remaining) throw new Error(`Requested qty (${qty}) exceeds remaining (${remaining}).`);
  }

  const requisition = await prisma.procurementRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { projectId: true },
  });
  if (!requisition) throw new Error('Requisition not found');

  // create purchase record
  const purchase = await prisma.purchase.create({
    data: {
      requisitionId: input.requisitionId,
      requisitionItemId: input.requisitionItemId ?? null,
      vendor: input.vendor.trim(),
      taxInvoiceNo: input.taxInvoiceNo.trim(),
      vendorPhone: input.vendorPhone?.trim() || null,
      qty,
      priceMinor: BigInt(Math.round(totalPrice * 100)),
      purchasedOn: new Date(input.date),
      invoiceUrl: input.invoiceUrl ?? null,
      createdById: user.id!,
    },
    include: { requisitionItem: true },
  });

  // 4. Do NOT update Inventory here (Staging Mode)
  // 5. Do NOT update Requisition Status here (It remains APPROVED or PARTIAL until PO is created)

  revalidatePath('/procurement/requisitions/${input.requisitionId}');
  revalidatePath('/projects/${requisition.projectId}');

  return { ok: true, purchaseId: purchase.id };
}

export async function createPartialPOFromPurchases(requisitionId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  assertRoles(user.role as any, ['PROCUREMENT', 'SENIOR_PROCUREMENT', 'ADMIN']);

  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    select: { id: true, projectId: true },
  });
  if (!req) throw new Error('Requisition not found');

  // 1. Find all pending purchases (staged items)
  const pendingPurchases = await prisma.purchase.findMany({
    where: {
      requisitionId,
      status: 'PENDING',
    } as any,
    include: { requisitionItem: true },
  });

  if (pendingPurchases.length === 0) {
    throw new Error('No staged purchase items found.');
  }

  // 2. Create the Purchase Order
  const po = await prisma.$transaction(async (tx) => {
    // Calculate total
    const totalMinor = pendingPurchases.reduce((acc, p) => acc + BigInt(p.priceMinor), 0n);

    // Create PO
    const newPO = await tx.purchaseOrder.create({
      data: {
        projectId: req.projectId,
        requisitionId: req.id,
        status: 'PURCHASED', // Immediately ready for Security
        vendor: 'Mixed/Staged Purchase', // Or we could try to detect if single vendor
        requestedMinor: totalMinor,
        items: {
          create: pendingPurchases.map((p) => ({
            requisitionItemId: p.requisitionItemId,
            description: p.requisitionItem?.description || p.vendor,
            unit: p.requisitionItem?.unit || 'Lot',
            qty: p.qty,
            unitPriceMinor: p.qty > 0 ? (p.priceMinor / BigInt(Math.round(p.qty))) : 0n, // Approx unit price
            totalMinor: p.priceMinor,
            quoteLineId: p.requisitionItem?.quoteLineId,
          })),
        },
      },
    });

    // 3. Update Purchase Records to link to PO and mark as PO_CREATED
    await tx.purchase.updateMany({
      where: {
        id: { in: pendingPurchases.map(p => p.id) }
      },
      data: {
        status: 'PO_CREATED',
        purchaseOrderId: newPO.id,
      } as any,
    });

    // 4. Update Requisition Status and determine if complete
    const allItems = await tx.procurementRequisitionItem.findMany({
      where: { requisitionId },
      include: { purchases: { select: { qty: true } } },
    });

    const isFullyPurchased = allItems.every((it) => {
      const purchasedQty = it.purchases.reduce((sum, p) => sum + p.qty, 0);
      const targetQty = it.qtyRequested && it.qtyRequested > 0 ? it.qtyRequested : (it.qty ?? 0);
      return purchasedQty >= targetQty;
    });

    await tx.procurementRequisition.update({
      where: { id: requisitionId },
      data: { status: isFullyPurchased ? 'COMPLETED' : 'PARTIAL' },
    });

    return { isFullyPurchased };
  }, {
    timeout: 20000, // Increase timeout to 20 seconds
  });

  revalidatePath(`/procurement/requisitions/${requisitionId}`);
  if (po.isFullyPurchased) {
    redirect('/dashboard');
  }
  // Otherwise, stay on the page. (No redirect = stay on current path in Next.js Server Actions)
}


export async function createDispatch(
  projectId: string,
  items: { description: string; qty: number; unit?: string; requisitionItemId?: string }[],
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'PROJECT_OPERATIONS_OFFICER' && role !== 'ADMIN') {
    throw new Error('Only Project Managers or Admin can create dispatches');
  }
  await ensureProjectIsPlanned(projectId);

  return prisma.$transaction(
    async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          projectId,
          status: 'DRAFT',
          createdById: user.id ?? null,
        },
      });

      if (items.length) {
        await tx.dispatchItem.createMany({
          data: items.map((item) => ({
            dispatchId: dispatch.id,
            description: item.description,
            qty: item.qty,
            unit: item.unit ?? null,
            requisitionItemId: item.requisitionItemId ?? null,
          })),
        });
      }

      return { ok: true, dispatchId: dispatch.id };
    },
    TX_OPTS,
  );
}

export async function approveDispatch(dispatchId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'ADMIN' && role !== 'PROJECT_OPERATIONS_OFFICER') {
    throw new Error('Only Security or Admin can approve dispatches');
  }

  await prisma.dispatch.update({
    where: { id: dispatchId },
    data: { status: 'APPROVED', securitySignedAt: new Date() },
  });

  return { ok: true };
}

export async function markDispatchDelivered(dispatchId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'ADMIN' && role !== 'SECURITY') {
    throw new Error('Only Security or Admin can mark delivery');
  }

  await prisma.dispatch.update({
    where: { id: dispatchId },
    data: {
      status: 'DELIVERED',
      driverSignedAt: new Date(),
      siteStockistSignedAt: new Date(),
    },
  });

  return { ok: true };
}

// Mark a single dispatch item as handed out and decrement inventory if linked
export async function markDispatchItemHandedOut(dispatchItemId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  // Only Security or Admin
  if (!['SECURITY', 'ADMIN'].includes(user.role as any)) {
    throw new Error('Only Security can hand out items');
  }

  const item = await prisma.dispatchItem.findUnique({
    where: { id: dispatchItemId },
    include: { inventoryItem: true, dispatch: true },
  });
  if (!item) throw new Error('Dispatch item not found');

  // prevent double issue
  if (item.handedOutAt) return { ok: true } as const;

  if (item.inventoryItemId && item.inventoryItem) {
    const stock = Number(item.inventoryItem.qty ?? 0);
    const toIssue = Number(item.qty ?? 0);
    if (toIssue > stock) {
      throw new Error(
        `Not enough stock for ${item.inventoryItem.name}. In stock: ${stock}, requested: ${toIssue}`,
      );
    }

    await prisma.$transaction([
      prisma.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { qty: { decrement: toIssue } } }),
      prisma.dispatchItem.update({
        where: { id: item.id },
        data: { handedOutAt: new Date(), handedOutById: user.id ?? null },
      }),
    ]);
  } else {
    await prisma.dispatchItem.update({
      where: { id: item.id },
      data: { handedOutAt: new Date(), handedOutById: user.id ?? null },
    });
  }

  // If all items handed out -> mark dispatch DISPATCHED
  const remaining = await prisma.dispatchItem.count({ where: { dispatchId: item.dispatchId, handedOutAt: null } });
  if (remaining === 0) {
    await prisma.dispatch.update({ where: { id: item.dispatchId }, data: { status: 'DISPATCHED' } });
  }

  return { ok: true } as const;
}

/* export async function recordPayment(
  projectId: string,
  input: { type: 'DEPOSIT' | 'INSTALLMENT'; amount: number; receivedAt: string; receiptNo?: string },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'ADMIN' && role !== 'ACCOUNTS' && role !== 'CASHIER' && role !== 'ACCOUNTING_OFFICER') {
    throw new Error('Only Accounts roles can record payments');
  }
 
  await prisma.payment.create({
    data: {
      projectId,
      type: input.type,
      amountMinor: toMinor(input.amount),
      receivedAt: new Date(input.receivedAt),
      receivedById: user.id ?? null,
      receiptNo: input.receiptNo ?? null,
    },
  });
 
  return { ok: true };
} */

// 2.2 record client payment (deposit or installment)
export async function recordPayment(projectId: string, input: { type: 'DEPOSIT' | 'INSTALLMENT'; amount: number; date: string; ref?: string | null }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  assertRoles((user as any).role, ['ACCOUNTS', 'ACCOUNTING_OFFICER', 'ADMIN', 'CASHIER']);

  const amountMinor = moneyToMinor(input.amount);

  await prisma.$transaction(async (tx) => {
    // Create the payment record
    await tx.payment.create({
      data: {
        projectId,
        type: input.type,
        amountMinor,
        paidOn: new Date(input.date),
        receivedAt: new Date(input.date),
        ref: input.ref ?? null,
        createdById: user.id!,
      },
    });

    // Get payment schedule items ordered by sequence
    const scheduleItems = await tx.paymentSchedule.findMany({
      where: { projectId },
      orderBy: { seq: 'asc' },
    });

    // Allocate payment to schedule items
    let remainingAmount = amountMinor;

    for (const item of scheduleItems) {
      if (remainingAmount <= 0) break;

      const unpaidAmount = item.amountMinor - item.paidMinor;
      if (unpaidAmount <= 0) continue; // Already fully paid

      const paymentForThisItem = remainingAmount >= unpaidAmount ? unpaidAmount : remainingAmount;
      const newPaidMinor = item.paidMinor + paymentForThisItem;

      await tx.paymentSchedule.update({
        where: { id: item.id },
        data: {
          paidMinor: newPaidMinor,
          status: newPaidMinor >= item.amountMinor ? 'PAID' : 'PARTIAL',
        },
      });

      remainingAmount -= paymentForThisItem;
    }
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}


// tiny util
// --- Security Helper ---
export async function ensureProjectAccess(projectId: string, user?: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) {
    user = await getCurrentUser();
  }
  if (!user) throw new Error('Auth required');

  const role = user.role as string;

  // 1. Absolute super-users
  if (['ADMIN', 'DEPUTY_ADMIN', 'PROJECT_COORDINATOR', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER'].includes(role)) {
    return; // Allowed
  }

  // 2. Project Manager - Strict Assignment Check
  if (role === 'PROJECT_OPERATIONS_OFFICER') {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { assignedToId: true },
    });

    if (!project) throw new Error('Project not found');

    if (project.assignedToId !== user.id) {
      throw new Error('Access Denied: You differ from the assigned Project Manager.');
    }
    return; // Allowed
  }

  // 3. Other roles (Sales, Accounts, etc.) - Keep existing loose or specific checks in their respective actions
  // For now, we default to "only specific roles permitted" in the individual actions or assume they are read-only/specific flows.
  // If we want to block them generally from "PM" actions, we can throw here.
  // For this specific helper intended for PM actions, we'll deny others.

  throw new Error('Access Denied: Role not authorized for project management actions.');
}

export async function assignProjectToManager(projectId: string, userId: string) {
  const me = await getCurrentUser();
  assertRoles(me?.role, ['ADMIN', 'DEPUTY_ADMIN', 'PROJECT_COORDINATOR', 'GENERAL_MANAGER', 'MANAGING_DIRECTOR']);

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) throw new Error('User not found');
  if (targetUser.role !== 'PROJECT_OPERATIONS_OFFICER') throw new Error('User is not a Project Operations Officer');

  await prisma.project.update({
    where: { id: projectId },
    data: { assignedToId: userId },
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ----------------------------------------------------------------------

function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export async function generatePaymentSchedule(projectId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');

  // Enforce Access
  // Note: generatePaymentSchedule might be run by SALES too, so we need to be careful with ensureProjectAccess which currently blocks non-PMs.
  // We'll modify logic: If PM, strictly check assignment. If Sales/Admin, allow.

  const role = (me as any).role as string | undefined;

  if (role === 'PROJECT_OPERATIONS_OFFICER') {
    await ensureProjectAccess(projectId, me);
  } else if (
    ![
      'ADMIN',
      'SALES',
      'PROJECT_COORDINATOR',
      'ACCOUNTS',
      'SALES_ACCOUNTS',
      'CASHIER',
      'ACCOUNTING_OFFICER',
      'ACCOUNTING_AUDITOR',
      'GENERAL_MANAGER',
      'MANAGING_DIRECTOR',
    ].includes(role || '')
  ) {
    throw new Error('Not allowed');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      quote: {
        select: {
          id: true,
          lines: { select: { lineTotalMinor: true } },
          metaJson: true, // in case you keep totals here
        },
      },
      paymentSchedules: { select: { id: true } },
    },
  });
  if (!project) throw new Error('Project not found');

  // Idempotence: if schedule exists, do nothing
  if (project.paymentSchedules.length > 0) return { ok: true, created: 0 };

  const grandTotalMinor = await getQuoteGrandTotalMinor(projectId);

  // pull sales inputs
  const depositMinor = BigInt(project.depositMinor ?? 0);
  const installmentMinor = BigInt(project.installmentMinor ?? 0);
  const commenceOn = project.commenceOn ? new Date(project.commenceOn) : new Date();
  const firstDueOn =
    project.installmentDueOn ? new Date(project.installmentDueOn) : commenceOn;

  // Build schedule rows
  const rows: {
    projectId: string;
    seq: number;
    label: string;
    dueOn: Date;
    amountMinor: bigint;
    paidMinor?: bigint | null;
    status: 'PARTIAL' | 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  }[] = [];

  let seq = 1;

  // 1) Deposit (optional)
  if (depositMinor > 0n) {
    rows.push({
      projectId,
      seq: seq++,
      label: 'Deposit',
      // choose dueOn policy: the endorsement day or commence day
      dueOn: commenceOn,
      amountMinor: depositMinor,
      paidMinor: null,
      status: PaymentScheduleStatus.DUE,
    });
  }

  // 2) Monthly installments until total is covered
  let remaining = grandTotalMinor - depositMinor;
  if (remaining < 0n) remaining = 0n; // over-deposit protection

  if (remaining > 0n) {
    if (installmentMinor <= 0n) {
      // No installment configured: force a single balance line due on firstDueOn
      rows.push({
        projectId,
        seq: seq++,
        label: 'Balance',
        dueOn: firstDueOn,
        amountMinor: remaining,
        paidMinor: null,
        status: PaymentScheduleStatus.DUE,
      });
    } else {
      let i = 0;
      while (remaining > 0n && i < 600 /* hard guard */) {
        const amt = remaining > installmentMinor ? installmentMinor : remaining;
        rows.push({
          projectId,
          seq: seq++,
          label: `Installment ${i + 1}`,
          dueOn: addMonths(firstDueOn, i),
          amountMinor: amt,
          paidMinor: null,
          status: PaymentScheduleStatus.DUE,
        });
        remaining -= amt;
        i++;
      }
    }
  }

  // Persist
  if (rows.length === 0) {
    // fully paid by deposit (or total == 0): add a single paid row for traceability
    rows.push({
      projectId,
      seq: 1,
      label: 'Fully paid on endorsement',
      dueOn: commenceOn,
      amountMinor: 0n,
      paidMinor: 0n,
      status: PaymentScheduleStatus.PAID,
    });
  }

  // Prisma createMany does not support BigInt in some drivers by plain object literal;
  // if your field is BigInt in Prisma schema, you can pass BigInt directly.
  await prisma.paymentSchedule.createMany({
    data: rows.map(r => ({
      projectId: r.projectId,
      seq: r.seq,
      label: r.label,
      dueOn: r.dueOn,
      amountMinor: r.amountMinor,
      ...(r.paidMinor != null ? { paidMinor: r.paidMinor } : {}),
      status: r.status,
    })),
  });

  return { ok: true, created: rows.length };
}

// (Removed duplicate createDispatchFromInventory definition)

// --- New: Approve/hand-out dispatch and post inventory OUT moves
export async function getProductivitySettings(projectId: string): Promise<EngineProductivitySettings> {
  const settings = await prisma.projectProductivitySetting.findUnique({ where: { projectId } });
  return {
    builderShare: settings?.builderShare ?? 0.3333,
    excavationBuilder: settings?.excavationBuilder ?? 5,
    excavationAssistant: settings?.excavationAssistant ?? 5,
    brickBuilder: settings?.brickBuilder ?? 500,
    brickAssistant: settings?.brickAssistant ?? 500,
    plasterBuilder: settings?.plasterBuilder ?? 16,
    plasterAssistant: settings?.plasterAssistant ?? 16,
    cubicBuilder: settings?.cubicBuilder ?? 5,
    cubicAssistant: settings?.cubicAssistant ?? 5,
    tilerBuilder: settings?.tilerBuilder ?? 20,
    tilerAssistant: settings?.tilerAssistant ?? 20,
  };
}

function inferTaskType(unit?: string | null, description?: string | null): 'excavation' | 'brick' | 'plaster' | 'cubic' | 'tiler' | null {
  const u = (unit || '').toLowerCase();
  const d = (description || '').toLowerCase();
  if (d.includes('tile') || d.includes('tiling')) return 'tiler';
  if (u.includes('m3') || u.includes('cubic')) return 'cubic';
  if (u.includes('m2') || u.includes('sqm') || d.includes('plaster')) return 'plaster';
  if (u.includes('brick') || d.includes('brick')) return 'brick';
  if (u === 'm' || d.includes('excav')) return 'excavation';
  return null;
}

export async function approveAndHandoutDispatch(dispatchId: string) {
  const me = await getCurrentUser();
  assertOneOf(me?.role, ['SECURITY', 'ADMIN']);

  const d = await prisma.dispatch.update({
    where: { id: dispatchId },
    data: { status: 'APPROVED', securitySignedAt: new Date(), securityById: me!.id! },
    include: { items: true, project: true },
  });

  for (const it of d.items) {
    // OUT of inventory by description/unit
    await postStockMove({
      description: it.description,
      unit: it.unit ?? undefined,
      qty: -Math.abs(Number(it.qty)),
      kind: 'OUT',
      projectId: d.projectId,
      refType: 'DISPATCH',
      refId: d.id,
    });
  }

  return d.id;
}

// --- Schedule: build from quote labour lines
export async function createScheduleFromQuote(projectId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');

  await ensureProjectAccess(projectId, user);

  const existing = await prisma.schedule.findFirst({
    where: { projectId },
    include: { items: { include: { assignees: true } } },
  });

  // Payment is required when creating a schedule, but must not prevent an
  // already-running project from receiving newly added quotation stages.
  if (!existing) {
    await ensureProjectIsPaidFor(projectId);
  }

  const quote = await prisma.quote.findFirst({
    where: { project: { id: projectId } },
    include: { lines: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
  });
  if (!quote) throw new Error('No quote found for project');

  const parseLineMeta = (value: unknown): Record<string, any> => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const labourLines = quote.lines.filter((l) => {
    const meta = parseLineMeta(l.metaJson);
    const type = (l.itemType || meta.itemType || meta.type || '').toUpperCase();
    const isLabour = type === 'LABOUR' || meta.isLabour === true;
    return isLabour;
  }).sort((a, b) => {
    const rankDifference =
      getCanonicalScheduleStage({ stage: a.section, title: a.description }).rank -
      getCanonicalScheduleStage({ stage: b.section, title: b.description }).rank;
    if (rankDifference !== 0) return rankDifference;

    const stageA = String(a.section || '').toUpperCase();
    const stageB = String(b.section || '').toUpperCase();
    if (stageA === stageB && (stageA.includes('FOUNDATION') || stageA.includes('SUBSTRUCTURE'))) {
      const priority = (description: string) => {
        const value = description.toLowerCase();
        if (value.includes('setting out')) return 0;
        if (value.includes('site clearance')) return 1;
        return 2;
      };
      const difference = priority(a.description) - priority(b.description);
      if (difference !== 0) return difference;
    }
    return a.position - b.position;
  });

  const items = labourLines.map((ln, position) => {
    const meta = parseLineMeta(ln.metaJson);
    const title = ln.description ?? meta.title ?? 'Labour task';
    const unit = ln.unit ?? meta.unit ?? null;
    const qty = Number((ln as any).quantity ?? 0);
    const estHours = typeof meta.expectedHours === 'number' ? meta.expectedHours : undefined;
    const stage = getCanonicalScheduleStage({
      stage: String(ln.section || meta.section || 'OTHER WORKS'),
      title,
      description: meta.note ?? ln.description ?? '',
    }).label;
    return {
      quoteLineId: ln.id,
      stage,
      position,
      title,
      description: meta.note ?? ln.description ?? '',
      unit,
      quantity: qty || undefined,
      estHours: estHours ?? undefined,
      employees: meta?.expectedEmployees ?? undefined,
      plannedStart: meta?.plannedStart ? new Date(meta.plannedStart) : undefined,
      plannedEnd: meta?.plannedEnd ? new Date(meta.plannedEnd) : undefined,
      note: meta?.note ?? null,
    };
  });

  if (existing) {
    const matchedExistingByQuoteLine = new Map(
      existing.items.filter((item) => item.quoteLineId).map((item) => [item.quoteLineId!, item]),
    );
    const normalizeTitle = (value: string | null | undefined) =>
      String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const unmatchedLegacyByTitle = new Map<string, typeof existing.items>();
    for (const existingItem of existing.items.filter((item) => !item.quoteLineId)) {
      const key = normalizeTitle(existingItem.title || existingItem.description);
      if (!key) continue;
      const matches = unmatchedLegacyByTitle.get(key) ?? [];
      matches.push(existingItem);
      unmatchedLegacyByTitle.set(key, matches);
    }
    for (const item of items) {
      if (matchedExistingByQuoteLine.has(item.quoteLineId)) continue;
      const matches = unmatchedLegacyByTitle.get(normalizeTitle(item.title));
      const legacyMatch = matches?.shift();
      if (legacyMatch) matchedExistingByQuoteLine.set(item.quoteLineId, legacyMatch);
    }
    const latestExistingEnd = existing.items.reduce<Date | null>((latest, item) => {
      if (!item.plannedEnd) return latest;
      return !latest || item.plannedEnd > latest ? item.plannedEnd : latest;
    }, null);
    let nextNewTaskStart = latestExistingEnd ? addGap(latestExistingEnd, 30) : new Date();
    const reconciledItems = items.map((item) => {
      if (matchedExistingByQuoteLine.has(item.quoteLineId)) return item;
      const plannedStart = new Date(nextNewTaskStart);
      const plannedEnd = addWorkingTime(plannedStart, item.estHours ?? 10);
      nextNewTaskStart = addGap(plannedEnd, 30);
      return { ...item, plannedStart, plannedEnd };
    });

    await prisma.$transaction(
      reconciledItems.map((item) => {
        const current = matchedExistingByQuoteLine.get(item.quoteLineId);
        if (current) {
          return prisma.scheduleItem.update({
            where: { id: current.id },
            data: {
              quoteLineId: item.quoteLineId,
              stage: item.stage,
              position: item.position,
              title: item.title,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              estHours: current.estHours ?? item.estHours,
            },
          });
        }
        return prisma.scheduleItem.create({
          data: {
            scheduleId: existing.id,
            ...item,
          },
        });
      }),
    );

    // Include retained/manual tasks in the same construction sequence. This
    // prevents old rows from interleaving with newly synced quotation stages.
    const allScheduleItems = await prisma.scheduleItem.findMany({
      where: { scheduleId: existing.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const orderedScheduleItems = allScheduleItems
      .map((item, originalIndex) => ({
        item,
        originalIndex,
        canonical: getCanonicalScheduleStage(item),
      }))
      .sort((a, b) =>
        (a.canonical.rank - b.canonical.rank) || (a.originalIndex - b.originalIndex),
      );
    const positionUpdates = orderedScheduleItems.flatMap((entry, position) =>
      entry.item.position === position && entry.item.stage === entry.canonical.label
        ? []
        : [
            prisma.scheduleItem.update({
              where: { id: entry.item.id },
              data: { position, stage: entry.canonical.label },
            }),
          ],
    );
    if (positionUpdates.length) await prisma.$transaction(positionUpdates);

    const refreshed = await prisma.schedule.findUnique({
      where: { id: existing.id },
      include: {
        items: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: { assignees: true },
        },
      },
    });
    revalidatePath(`/projects/${projectId}/schedule`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, scheduleId: existing.id, items: refreshed?.items ?? [] };
  }

  const schedule = await prisma.schedule.create({
    data: {
      projectId,
      createdById: user.id,
      status: 'DRAFT',
      items: { create: items },
    },
    include: { items: true },
  });

  revalidatePath(`/projects/${projectId}/schedule`);
  // redirect(`/projects/${projectId}/schedule`); // Removed to allow API usage without redirect
  revalidatePath(`/projects/${projectId}`);

  return { ok: true, scheduleId: schedule.id, items: schedule.items };
}

// Save schedule (create or update)
export async function saveSchedule(
  scheduleId: string | null,
  projectId: string,
  payload: {
    note?: string | null;
    items: {
      id?: string | null;
      title: string;
      description?: string | null;
      unit?: string | null;
      quantity?: number | null;
      plannedStart?: string | null;
      plannedEnd?: string | null;
      employees?: number | null;
      estHours?: number | null;
      note?: string | null;
      employeeIds?: string[];
    }[];
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');

  await ensureProjectAccess(projectId, user);

  await ensureProjectIsPlanned(projectId);

  // Validate: schedule start date must be today or in the future
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  for (const it of payload.items) {
    if (it.plannedStart) {
      const d = new Date(it.plannedStart);
      d.setHours(0, 0, 0, 0);
      if (d < todayStart) {
        throw new Error('Schedule start date must be today or in the future');
      }
      break; // only need to check the first item (project start)
    }
  }

  const settings = await getProductivitySettings(projectId);
  const enrichedItems = await computeEstimatesForItems(payload.items, settings);

  return prisma.$transaction(async (tx) => {
    let schedule;
    if (scheduleId) {
      schedule = await tx.schedule.update({
        where: { id: scheduleId },
        data: { note: payload.note ?? undefined, updatedAt: new Date() },
      });
    } else {
      schedule = await tx.schedule.create({
        data: { projectId, createdById: user.id, note: payload.note ?? undefined },
      });
    }

    const incomingIds = payload.items.map((i) => i.id).filter(Boolean) as string[];
    await tx.scheduleItem.deleteMany({
      where: { scheduleId: schedule.id, id: { notIn: incomingIds.length ? incomingIds : ['__none__'] } },
    });

    for (const it of enrichedItems) {
      if (it.id) {
        await tx.scheduleItem.update({
          where: { id: it.id },
          data: {
            title: it.title,
            description: it.description ?? null,
            unit: it.unit ?? null,
            quantity: it.quantity ?? null,
            plannedStart: it.plannedStart ? new Date(it.plannedStart) : null,
            plannedEnd: it.plannedEnd ? new Date(it.plannedEnd) : null,
            employees: it.employees ?? null,
            estHours: it.estHours ?? null,
            note: it.note ?? null,
            assignees: Array.isArray((it as any).employeeIds)
              ? {
                set: ((it as any).employeeIds as string[])
                  .filter((id) => typeof id === 'string' && id.trim().length > 0)
                  .map((id) => ({ id })),
              }
              : undefined,
          },
        });
      } else {
        await tx.scheduleItem.create({
          data: {
            scheduleId: schedule.id,
            title: it.title,
            description: it.description ?? null,
            unit: it.unit ?? null,
            quantity: it.quantity ?? null,
            plannedStart: it.plannedStart ? new Date(it.plannedStart) : null,
            plannedEnd: it.plannedEnd ? new Date(it.plannedEnd) : null,
            employees: it.employees ?? null,
            estHours: it.estHours ?? null,
            note: it.note ?? null,
            assignees: Array.isArray((it as any).employeeIds)
              ? {
                connect: ((it as any).employeeIds as string[])
                  .filter((id) => typeof id === 'string' && id.trim().length > 0)
                  .map((id) => ({ id })),
              }
              : undefined,
          },
        });
      }
    }

    revalidatePath(`/projects/${projectId}/schedule`);
    return { ok: true, scheduleId: schedule.id };
  });
}


export async function sendRequisitionForReviewInPlace(requisitionId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  assertRoles(user.role as any, ['PROCUREMENT', 'SENIOR_PROCUREMENT', 'ADMIN']);

  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    select: { id: true, note: true }
  });
  if (!req) throw new Error('Requisition not found');

  const pendingItems = await prisma.procurementRequisitionItem.findMany({
    where: { requisitionId, reviewRequested: true },
    select: {
      id: true, description: true, requestedUnitPriceMinor: true,
      // @ts-ignore
      stagedUnitPriceMinor: true
    }
  });
  if (pendingItems.length === 0) throw new Error('Mark at least one item for review before sending');

  // Validate Prices
  const missingPrice = pendingItems.find(it => {
    // Check staged price (since that is what we edit during review staging).
    // @ts-ignore
    const price = BigInt(it.stagedUnitPriceMinor ?? 0);
    return price <= 0n;
  });

  if (missingPrice) {
    throw new Error(`Item "${missingPrice.description}" marked for review must have a unit price > 0.`);
  }

  // Update In-Place:
  // 1. Set reviewSubmittedAt/By
  // 2. Append/Set "Review request" in note to trigger routing logic (Hidden from Procurement, Visible to Senior)
  //    (We check if note already contains it to avoid duplication)
  const newNote = req.note?.includes('Review request from Req')
    ? req.note
    : `${req.note || ''}\nReview request from Req #${req.id.slice(-6).toUpperCase()}`.trim();

  await prisma.procurementRequisition.update({
    where: { id: requisitionId },
    data: {
      reviewSubmittedAt: new Date(),
      reviewSubmittedById: user.id,
      note: newNote,
      status: 'AWAITING_APPROVAL'
    },
  });

  revalidatePath(`/procurement/requisitions/${requisitionId}`);
  revalidatePath(`/projects`); // Update dashboard counts
  return { ok: true };
}

export async function sendRequisitionForReview(requisitionId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  assertRoles(user.role as any, ['PROCUREMENT', 'SENIOR_PROCUREMENT', 'ADMIN']);

  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    include: { items: { include: { quoteLine: true } }, project: true }
  });
  if (!req) throw new Error('Requisition not found');

  // Identify items to move (review requested but not approved)
  const itemsToMove = req.items.filter(it => it.reviewRequested && !it.reviewApproved);
  if (itemsToMove.length === 0) return; // Nothing to do

  await prisma.$transaction(async (tx) => {
    // Create new Requisition
    const newReq = await tx.procurementRequisition.create({
      data: {
        projectId: req.projectId,
        status: 'AWAITING_APPROVAL', // New status for review requests
        submittedById: user.id,
        note: `Review request from Req #${req.id.slice(-6).toUpperCase()}`,
        items: {
          create: [] // we will populate this manually in the loop
        }
      }
    });

    for (const item of itemsToMove) {
      // Calculate remaining (unpurchased) quantity
      const purchases = await tx.purchase.findMany({
        where: { requisitionItemId: item.id },
        select: { qty: true }
      });
      const purchasedQty = purchases.reduce((s, p) => s + p.qty, 0);
      const totalReqQty = Number(item.qtyRequested ?? item.qty ?? 0);
      const remainingQty = Math.max(0, totalReqQty - purchasedQty);

      if (remainingQty <= 0) {
        // If item is fully purchased, just clear the review flag on the old item so it stops blocking
        await tx.procurementRequisitionItem.update({
          where: { id: item.id },
          data: { reviewRequested: false }
        });
        continue;
      }

      // Add to new Req
      await tx.procurementRequisitionItem.create({
        data: {
          requisitionId: newReq.id,
          description: item.description,
          unit: item.unit,
          qty: remainingQty,
          // qty: remainingQty, // Duplicate removed
          qtyRequested: remainingQty,
          // Use the STAGED price as the new Requested Price
          // @ts-ignore
          requestedUnitPriceMinor: item.stagedUnitPriceMinor ?? item.requestedUnitPriceMinor,
          // @ts-ignore
          amountMinor: BigInt(Math.round(remainingQty * Number(item.stagedUnitPriceMinor ?? item.requestedUnitPriceMinor ?? 0n))),
          quoteLineId: item.quoteLineId,
          estPriceMinor: item.estPriceMinor,
          reviewRequested: true,
          reviewApproved: false
        }
      });

      // Update old item to close it out (reduce qtyRequested to what's already bought)
      // and clear the review flag so it doesn't show up in the staged list anymore
      await tx.procurementRequisitionItem.update({
        where: { id: item.id },
        data: {
          qtyRequested: purchasedQty,
          reviewRequested: false,
          // @ts-ignore
          // @ts-ignore
          stagedUnitPriceMinor: 0n,
          // Sync amountMinor with new qtyRequested (purchasedQty)
          // @ts-ignore
          amountMinor: BigInt(Math.round(purchasedQty * Number(item.requestedUnitPriceMinor ?? 0n)))
        }
      });
    }

    // NEW: Calculate total reduction in value for the moved items, to update the Approved Funding.
    // We must reduce the funding by the amount that was APPROVED for these items.
    let totalReductionMinor = 0n;
    for (const item of itemsToMove) {
      const purchases = await tx.purchase.findMany({ where: { requisitionItemId: item.id }, select: { qty: true } });
      const purchasedQty = purchases.reduce((s, p) => s + p.qty, 0);
      const totalReqQty = Number(item.qtyRequested ?? item.qty ?? 0);
      const remainingQty = Math.max(0, totalReqQty - purchasedQty);
      if (remainingQty <= 0) continue;

      // Priority: Requested (Approved) -> Quote -> Estimate -> Amount/Qty
      let originalPriceMinor = item.requestedUnitPriceMinor ?? item.quoteLine?.unitPriceMinor ?? item.estPriceMinor ?? 0n;

      if (!originalPriceMinor && totalReqQty > 0 && item.amountMinor) {
        originalPriceMinor = BigInt(item.amountMinor) / BigInt(totalReqQty);
      }

      totalReductionMinor += BigInt(Math.round(remainingQty * Number(originalPriceMinor)));
    }

    if (totalReductionMinor > 0n) {
      // Find the active funding request
      const funding = await tx.fundingRequest.findFirst({
        where: { requisitionId: req.id, status: { in: ['REQUESTED', 'APPROVED'] } },
        orderBy: { createdAt: 'desc' }
      });

      if (funding) {
        const newAmount = BigInt(funding.amountMinor) - totalReductionMinor;
        await tx.fundingRequest.update({
          where: { id: funding.id },
          data: { amountMinor: newAmount > 0n ? newAmount : 0n } // Ensure not negative
        });
      }
    }

  });

  revalidatePath(`/procurement/requisitions/${requisitionId}`);
  revalidatePath(`/projects/${req.projectId}`);
}

// Refactored to avoid "Unknown argument" on potentially stale client
export async function getProjectsForReports() {
  const user = await getCurrentUser();
  if (!user) return [];

  const role = user.role || 'VIEWER';
  const isProjectManager = role === 'PROJECT_OPERATIONS_OFFICER';
  const isForeman = role === 'FOREMAN';

  // Base Logic from projects/page.tsx
  const where: Prisma.ProjectWhereInput = {
    // We want "Active" projects.
    // In projects/page.tsx, "Active" tab for PMs means schedule status is ACTIVE
    // For others, it generally implies the project is not closed.
  };

  if (isProjectManager) {
    // Match /projects?tab=active logic
    where.assignedToId = user.id;
    where.schedules = { status: 'ACTIVE' };
  } else if (isForeman) {
    // Foremen logic
    where.schedules = { items: { some: { assignees: { some: { userId: user.id } } } }, status: 'ACTIVE' };
  } else {
    // For Admins/Sales/Senior PMs, show all "Live" projects
    where.status = {
      in: ['PLANNED', 'PREPARING', 'READY', 'ONGOING', 'ON_HOLD', 'SCHEDULING_PENDING']
    };
  }

  try {
    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        office: true,
        quote: {
          select: {
            customer: { select: { displayName: true } }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return projects.map(p => ({
      id: p.id,
      name: p.name,
      client: p.quote?.customer?.displayName || 'Unknown Client',
      location: p.office || 'N/A',
      status: p.status,
    }));
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
}

export async function getDailyReportData(projectId: string, dateStr: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      assignedToId: true,
      projectNumber: true,
      status: true,
      office: true,
      quote: {
        select: {
          customer: { select: { displayName: true, city: true } }
        }
      }
    }
  });

  if (!project) throw new Error("Project not found");

  // Role Checks
  const role = user.role;
  if (role === 'PROJECT_OPERATIONS_OFFICER') {
    if (project.assignedToId !== user.id) {
      throw new Error("You are not assigned to this project.");
    }
  }
  // Other roles (Admin, Coordinator) can view if they have access to the page basically.

  // Parse date
  const date = new Date(dateStr);
  const startOfDay = new Date(date.setHours(0, 0, 0, 0));
  const endOfDay = new Date(date.setHours(23, 59, 59, 999));

  // Fetch Schedule Items that have REPORTS for this day OR were Active
  // For End of Day report, we typically just want to show what happened (Reports).
  // If no report was made, maybe we don't show it? 
  // User asked for "end of day report... daily tasks updating the schedule".
  // Let's fetch items that have at least one report on this day.

  const items = await prisma.scheduleItem.findMany({
    where: {
      schedule: { projectId },
      reports: {
        some: {
          reportedForDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      }
    },
    include: {
      reports: {
        where: {
          reportedForDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        include: { reporter: { select: { name: true } } }
      },
      assignees: {
        select: {
          id: true,
          givenName: true,
          surname: true,
          role: true
        }
      }
    }
  });

  // Calculate unique men on site from the reported tasks
  const uniqueWorkerIds = new Set<string>();
  items.forEach(item => {
    item.assignees.forEach(a => uniqueWorkerIds.add(a.id));
  });

  return {
    project: {
      name: project.name,
      number: project.projectNumber,
      customer: project.quote?.customer?.displayName,
      location: project.quote?.customer?.city || project.office,
      status: project.status
    },
    date: startOfDay.toISOString(),
    tasks: items.map(item => ({
      id: item.id,
      title: item.title,
      unit: item.unit,
      reports: item.reports.map(r => ({
        id: r.id,
        activity: r.activity,
        usedQty: r.usedQty,
        reporter: r.reporter?.name || 'Unknown'
      })),
      totalUsed: item.reports.reduce((acc, r) => acc + (r.usedQty || 0), 0),
      status: item.status,
      assignees: item.assignees
    })),
    stats: {
      totalMen: uniqueWorkerIds.size,
      totalTasksReported: items.length
    }
  };
}

export async function rescheduleOverdueTasks(projectId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { assignedToId: true }
  });
  if (!project) throw new Error("Project not found");

  const role = user.role;
  if (role === 'PROJECT_OPERATIONS_OFFICER' && project.assignedToId !== user.id) {
    throw new Error("You are not assigned to this project.");
  }

  // Fetch Schedule
  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    include: {
      items: {
        orderBy: { plannedStart: 'asc' },
        include: { assignees: true }
      }
    }
  });

  if (!schedule) throw new Error("No schedule found");

  const now = new Date();

  const items = schedule.items;
  let firstOverdueIndex = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.status === 'DONE') continue;

    // Check if plannedEnd is in the past (yesterday or earlier)
    // We compare against start of today to be strict "overdue"
    // or just "now". "Now" is safer.
    const end = item.plannedEnd ? new Date(item.plannedEnd) : null;
    if (end && end < now) {
      firstOverdueIndex = i;
      break;
    }
  }

  if (firstOverdueIndex === -1) {
    return { success: true, message: "No overdue tasks found." };
  }

  // Prepare items for recalculation
  const minimalItems: ScheduleItemMinimal[] = items.map(it => ({
    id: it.id,
    title: it.title,
    unit: it.unit,
    quantity: it.quantity,
    plannedStart: it.plannedStart,
    plannedEnd: it.plannedEnd,
    employees: it.employees,
    // @ts-ignore
    employeeIds: it.assignees.map(a => a.id),
    estHours: it.estHours,
    description: it.description
  }));

  // Shift to Tomorrow 07:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);

  // We need productivity settings for recalculation
  const productivity = await getProductivitySettings(projectId);

  // Recalculate from the overdue item index
  // Note: recalculateRipple expects Date object for startAt
  const updatedItems = recalculateRipple(
    minimalItems,
    firstOverdueIndex,
    tomorrow,
    30,
    productivity
  );

  // Preserve the first overdue task's original start date — work already began
  updatedItems[firstOverdueIndex].plannedStart = minimalItems[firstOverdueIndex].plannedStart;

  // Update Database
  const toUpdate = updatedItems.slice(firstOverdueIndex);

  await prisma.$transaction(
    toUpdate.map(u => prisma.scheduleItem.update({
      where: { id: u.id! },
      data: {
        plannedStart: u.plannedStart ? new Date(u.plannedStart) : null,
        plannedEnd: u.plannedEnd ? new Date(u.plannedEnd) : null,
        estHours: u.estHours
      }
    }))
  );

  revalidatePath(`/projects/${projectId}/schedule`);
  return { success: true, message: `Rescheduled ${toUpdate.length} tasks starting from '${items[firstOverdueIndex].title}'` };
}



export async function getGlobalDailyReportData(date: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const role = assertRole(user.role);
  if (!['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN', 'MANAGING_DIRECTOR', 'PM_CLERK'].includes(role)) {
    throw new Error("Unauthorized");
  }

  const projectWhere: any = role === 'PROJECT_OPERATIONS_OFFICER' ? { assignedToId: user.id } : {};

  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: { id: true, name: true }
  });

  const reports = [];

  for (const project of projects) {
    try {
      const reportData = await getDailyReportData(project.id, date);
      // Only include projects with activity or force all?
      // User said "summary of what was entered", so if nothing entered, maybe skip?
      // But "Report" usually implies status check.
      // Let's include all to show "No Activity" if nothing happened.
      reports.push(reportData);
    } catch (e) {
      console.error(`Failed to generate report for project ${project.name}`, e);
      // Skip projects that fail (e.g. no schedule)
    }
  }

  return reports;
}

export async function getEndOfDaySummaryData(dateStr: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const role = assertRole(user.role);
  if (!['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN', 'MANAGING_DIRECTOR', 'PM_CLERK'].includes(role)) {
    throw new Error("Unauthorized");
  }

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const projectWhere: any = role === 'PROJECT_OPERATIONS_OFFICER' ? { assignedToId: user.id } : {};

  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: {
      id: true,
      name: true,
      projectNumber: true,
      status: true,
      office: true,
      quote: {
        select: {
          customer: { select: { city: true } }
        }
      },
      dispatches: {
        select: {
          id: true,
          status: true,
          items: {
            select: {
              id: true,
              description: true,
              unit: true,
              qty: true,
              returnedQty: true,
              usedOutQty: true
            }
          }
        }
      },
      schedules: {
        select: {
          items: {
            select: {
              id: true,
              status: true,
              assignees: {
                select: {
                  id: true,
                  givenName: true,
                  surname: true,
                  role: true
                }
              },
              reports: {
                where: {
                  reportedForDate: {
                    lte: endOfDay
                  }
                },
                orderBy: {
                  reportedForDate: "desc"
                },
                take: 1,
                select: {
                  id: true,
                  reportedForDate: true,
                  activity: true
                }
              }
            }
          }
        }
      }
    }
  });

  return projects.map(project => {
    const items = project.schedules?.items ?? [];

    const completedTasks = items.filter(i => i.status === "DONE").length;
    const remainingTasks = items.filter(i => i.status !== "DONE").length;

    const materialsMap = new Map<string, { desc: string; unit: string | null; used: number; balance: number }>();
    for (const d of project.dispatches ?? []) {
      for (const it of d.items ?? []) {
        const key = `${(it.description || '').trim()}|${(it.unit || '').trim()}`.toLowerCase();
        const used = Number(it.usedOutQty || 0);
        const returned = Number(it.returnedQty || 0);
        const dispatched = Number(it.qty || 0);
        const balance = Math.max(0, dispatched - used - returned);
        const prev = materialsMap.get(key);
        if (prev) {
          prev.used += used;
          prev.balance += balance;
        } else {
          materialsMap.set(key, {
            desc: it.description,
            unit: it.unit ?? null,
            used,
            balance
          });
        }
      }
    }
    const materialSummaries = Array.from(materialsMap.values()).sort((a, b) => a.desc.localeCompare(b.desc));
    const usedSummary = materialSummaries
      .filter(m => m.used > 0)
      .map(m => `${m.desc}: ${m.used.toFixed(2)}${m.unit ? ` ${m.unit}` : ''}`)
      .join('\n');
    const balanceSummary = materialSummaries
      .filter(m => m.balance > 0)
      .map(m => `${m.desc}: ${m.balance.toFixed(2)}${m.unit ? ` ${m.unit}` : ''}`)
      .join('\n');

    let latestReportDate: Date | null = null;

    items.forEach(item => {
      const report = item.reports[0];
      if (report) {
        const d = report.reportedForDate;
        if (!latestReportDate || d > latestReportDate) {
          latestReportDate = d;
        }
      }
    });

    const activities: string[] = [];
    const workforceByRole = new Map<string, Set<string>>();

    if (latestReportDate) {
      const ts = latestReportDate.getTime();
      items.forEach(item => {
        const report = item.reports[0];
        if (!report || report.reportedForDate.getTime() !== ts) return;

        if (report.activity && !activities.includes(report.activity)) {
          activities.push(report.activity);
        }

        if (item.status === "DONE") return;

        item.assignees.forEach(a => {
          const name = (a.givenName || a.surname || "").trim();
          if (!name) return;
          const roleKey = (a.role || "").trim() || "Other";
          const set = workforceByRole.get(roleKey) ?? new Set<string>();
          set.add(name);
          workforceByRole.set(roleKey, set);
        });
      });
    }

    const location = project.quote?.customer?.city || project.office || "-";

    const workforceGroups = Array.from(workforceByRole.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([role, names]) => ({
        role,
        names: Array.from(names).sort()
      }));

    return {
      projectId: project.id,
      projectName: project.name,
      projectNumber: project.projectNumber,
      status: project.status,
      location,
      workforceGroups,
      lastActivity: activities.join(" | ") || "No activity reported",
      lastReportDate: latestReportDate ? latestReportDate.toISOString() : null,
      completedTasks,
      remainingTasks,
      materialsUsedSummary: usedSummary,
      materialsBalanceSummary: balanceSummary
    };
  });
}

export async function updateMaterialUsage(
  updates: { dispatchItemId: string; usedQty: number }[],
  pathname: string
) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      if (update.usedQty > 0) {
        const item = await tx.dispatchItem.findUnique({
          where: { id: update.dispatchItemId },
        });

        if (!item) continue;

        const newUsedQty = (item.usedOutQty || 0) + update.usedQty;

        // Optional: Add validation if strictly enforcing not exceeding handedOutQty
        // if (newUsedQty > item.handedOutQty) { ... }

        await tx.dispatchItem.update({
          where: { id: update.dispatchItemId },
          data: {
            usedOutQty: newUsedQty,
            // Track last usage?
            usedOutAt: new Date(),
            usedOutById: user.id,
          },
        });
      }
    }
  });

  revalidatePath(pathname);
  return { success: true };
}
