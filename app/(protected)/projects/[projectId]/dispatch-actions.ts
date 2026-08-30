'use server';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getRemainingDispatchMap } from '@/lib/dispatch';

function assertRole(role: string | null | undefined, allowed: string[]) {
  if (!role || !allowed.includes(role)) {
    throw new Error('You do not have permission for this action.');
  }
}

export async function createDispatch(
  projectId: string,
  input: {
    note?: string | null;
    driverId?: string | null;
    driverName?: string | null;
    vehicleReg?: string | null;
    items: Array<{
      requisitionItemId?: string | null;
      description: string;
      unit?: string | null;
      qty: number;
      estPriceMinor?: bigint | number | string | null;
    }>;
  }
) {
  try {
    const user = await getCurrentUser();
    assertRole(user?.role, ['PROJECT_OPERATIONS_OFFICER', 'ADMIN', 'SECURITY']);

    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Add at least one item to dispatch.');
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        quote: true,
        requisitions: {
          where: { status: { in: ['APPROVED', 'PARTIAL'] } },
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        },
      },
    });
    if (!project) throw new Error('Project not found.');
    const requisition = project.requisitions[0] ?? null;
    const requisitionId = requisition?.id ?? null;

    const remainingMap = await getRemainingDispatchMap(projectId);
    for (const it of input.items) {
      if (it.requisitionItemId) {
        const left = remainingMap.get(it.requisitionItemId) ?? 0;
        if (!(it.qty > 0)) throw new Error(`Qty must be > 0 for ${it.description}`);
        if (it.qty > left) {
          throw new Error(`Qty to dispatch for "${it.description}" exceeds remaining (${left}).`);
        }
      }
    }

    const isDirectDispatch = !!input.driverId || !!input.driverName;
    const status = isDirectDispatch ? 'DISPATCHED' : 'DRAFT';

    const dispatch = await prisma.$transaction(async (tx) => {
      // 1) Create the dispatch record
      const d = await tx.dispatch.create({
        data: {
          projectId,
          status,
          note: input.note || null,
          createdById: user!.id!,
          assignedToDriverId: input.driverId || null,
          driverName: input.driverName || null,
          vehicleReg: input.vehicleReg || null,
          securityById: isDirectDispatch ? user!.id! : null,
          securitySignedAt: isDirectDispatch ? new Date() : null,
          items: {
            create: input.items.map((it) => ({
              requisitionItemId: it.requisitionItemId || null,
              description: it.description,
              unit: it.unit || null,
              qty: it.qty,
              estPriceMinor: it.estPriceMinor ? BigInt(it.estPriceMinor as any) : 0n,
              handedOutAt: isDirectDispatch ? new Date() : null,
              handedOutById: isDirectDispatch ? user!.id! : null,
              handedOutQty: isDirectDispatch ? it.qty : 0,
            })),
          },
        },
        include: { items: true },
      });

      // 2) If direct dispatch, decrement inventory for each item
      if (isDirectDispatch) {
        for (const it of d.items) {
          // Resolve inventory item (logic similar to markItemHandedOut)
          let inventoryItem = await tx.inventoryItem.findFirst({
            where: {
              OR: [
                { purchaseId: it.purchaseId || undefined },
                { name: it.description.trim(), unit: it.unit || null }
              ]
            }
          });

          if (inventoryItem) {
            const updated = await tx.inventoryItem.updateMany({
              where: { id: inventoryItem.id, quantity: { gte: it.qty } },
              data: { quantity: { decrement: it.qty } }
            });
            if (updated.count === 0) {
              throw new Error(`Insufficient stock for "${it.description}" (Needed: ${it.qty}, Available: ${inventoryItem.quantity})`);
            }

            // Record movement
            await tx.inventoryMove.create({
              data: {
                inventoryItemId: inventoryItem.id,
                changeById: user!.id!,
                delta: -it.qty,
                reason: 'DIRECT_DISPATCH',
                metaJson: JSON.stringify({ dispatchItemId: it.id, dispatchId: d.id }),
              }
            });
          }
        }
      }

      return d;
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/dispatches`);
    return { ok: true, dispatchId: dispatch.id };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to create dispatch' };
  }
}

export async function markDispatchSent(
  dispatchId: string,
  input: { securityById?: string | null; driverName?: string | null; vehicleReg?: string | null; securityAck?: string | null }
) {
  const user = await getCurrentUser();
  assertRole(user?.role, ['SECURITY', 'ADMIN']);

  await prisma.dispatch.update({
    where: { id: dispatchId },
    data: {
      status: 'SENT',
      securityById: input.securityById || user!.id!,
      securitySignedAt: new Date(),
      driverName: input.driverName || null,
      vehicleReg: input.vehicleReg || null,
      securityAck: input.securityAck || null,
      departAt: new Date(),
    },
  });

  const d = await prisma.dispatch.findUnique({ where: { id: dispatchId }, select: { projectId: true } });
  revalidatePath(`/projects/${d?.projectId}`);
  revalidatePath(`/dispatches/${dispatchId}/receipt`);
}

export async function markDispatchReceived(
  dispatchId: string,
  input: { siteAck?: string | null }
) {
  const user = await getCurrentUser();
  assertRole(user?.role, ['SECURITY', 'ADMIN', 'PROJECT_OPERATIONS_OFFICER']);

  await prisma.dispatch.update({
    where: { id: dispatchId },
    data: {
      status: 'RECEIVED',
      siteAck: input.siteAck || null,
      receiveAt: new Date(),
    },
  });

  const d = await prisma.dispatch.findUnique({ where: { id: dispatchId }, select: { projectId: true } });
  revalidatePath(`/projects/${d?.projectId}`);
  revalidatePath(`/dispatches/${dispatchId}/receipt`);
}

export async function getProjectDispatchableItems(projectId: string) {
  const remainingMap = await getRemainingDispatchMap(projectId);
  const relevantItemIds = Array.from(remainingMap.entries())
    .filter(([_, qty]) => qty > 0)
    .map(([id]) => id);

  if (relevantItemIds.length === 0) {
    return [];
  }

  const items = await prisma.procurementRequisitionItem.findMany({
    where: {
      id: { in: relevantItemIds },
    },
  });

  const dispatchableItems = items
    .map((ri) => {
      const remaining = remainingMap.get(ri.id) ?? 0;

      // Double check, though we filtered keys already
      if (remaining <= 0) return null;

      return {
        id: ri.id,
        description: ri.description,
        unit: ri.unit,
        remaining,
        estPriceMinor: ri.estPriceMinor.toString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return dispatchableItems;
}
