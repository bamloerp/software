// app/(protected)/accounts/purchase-orders/actions.ts
'use server';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { validateGrnQuantities } from '@/lib/grn-verification';
import type { Prisma } from '@prisma/client';

function buildInventoryKey(name: string, unit: string | null | undefined) {
  return `${name.trim().toLowerCase()}::${(unit ?? '').trim().toLowerCase()}`;
}

async function addAcceptedInventory(
  tx: Prisma.TransactionClient,
  name: string,
  unit: string | null,
  quantity: number,
) {
  const key = buildInventoryKey(name, unit);
  const existingByKey = await tx.inventoryItem.findUnique({ where: { key } });
  const existing = existingByKey ?? await tx.inventoryItem.findUnique({
    where: { name_unit: { name, unit } },
  });

  if (existing) {
    await tx.inventoryItem.update({
      where: { id: existing.id },
      data: {
        qty: { increment: quantity },
        quantity: { increment: quantity },
      },
    });
    return;
  }

  await tx.inventoryItem.upsert({
    where: { key },
    update: {
      qty: { increment: quantity },
      quantity: { increment: quantity },
    },
    create: {
        key,
        name,
        description: name,
        unit,
        qty: quantity,
        quantity,
        category: 'MATERIAL',
    },
  });
}

export async function createPurchaseOrder(
  requisitionId: string,
  userId: string,
  items: Array<{ requisitionItemId: string; unitPriceMajor: number; quantity: number }>,
  vendorDetails: { name: string; email?: string; phone?: string; address?: string }
) {
  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    include: { items: true, project: true },
  });
  if (!req) throw new Error('Requisition not found');
  if (req.status !== 'SUBMITTED') throw new Error('Requisition is not active');

  const requestedMinor = items.reduce((sum, item) => sum + BigInt(Math.round(item.unitPriceMajor * 100)) * BigInt(item.quantity), BigInt(0));

  const poId = await prisma.$transaction(async (tx) => {
    // Create PO
    const po = await tx.purchaseOrder.create({
      data: {
        status: 'SUBMITTED', // Created by procurement, waiting for approval (or auto-approve if implemented)
        vendor: vendorDetails.name,
        requestedMinor,
        totalMinor: requestedMinor,
        projectId: req.projectId,
        createdById: userId,
        requisitionId: req.id,
        items: {
          create: items.map((item) => {
            const reqItem = req.items.find((ri) => ri.id === item.requisitionItemId);
            return {
              description: reqItem?.description || 'Unknown',
              qty: item.quantity,
              unit: reqItem?.unit,
              unitPriceMinor: BigInt(Math.round(item.unitPriceMajor * 100)),
              totalMinor: BigInt(Math.round(item.unitPriceMajor * 100)) * BigInt(item.quantity),
              requisitionItemId: item.requisitionItemId,
            };
          }),
        },
        purchases: {
          create: items.map((item) => {
            // We also create a 'Purchase' record to track vendor details per item if needed, 
            // but 'Purchase' model is usually for staged payments/items. 
            // Logic in 'receiveGoods' uses 'po.purchases' to find vendor details.
            // So we should populate it for at least one entry or per item if multi-vendor supported?
            // Since PO is per vendor, we can just create one Purchase record or one per item.
            // Let's create one per item to map back to requisition item cleanly.
            const reqItem = req.items.find((ri) => ri.id === item.requisitionItemId);
            return {
              description: reqItem?.description || 'Unknown',
              amountMinor: BigInt(Math.round(item.unitPriceMajor * 100)) * BigInt(item.quantity),
              vendor: vendorDetails.name,
              vendorPhone: vendorDetails.phone,
              requisitionItemId: item.requisitionItemId,
              projectId: req.projectId,
              status: 'PENDING',
              isPaid: false,
              taxInvoiceNo: 'PENDING-PO', // Placeholder until invoice received
              requisitionId: req.id
            };
          })
        }
      },
    });

    // Update Requisition Status
    await tx.procurementRequisition.update({
      where: { id: requisitionId },
      data: { status: 'ORDERED' },
    });

    return po.id;
  });

  revalidatePath('/procurement/purchase-orders');
  revalidatePath('/dashboard');

  return poId;
}

export async function approvePO(poId: string, approverId: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { requestedMinor: true, projectId: true, status: true },
  });
  if (!po) throw new Error('PO not found');
  if (po.status !== 'SUBMITTED') throw new Error('PO not in SUBMITTED state');

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: 'APPROVED', approvedMinor: po.requestedMinor, decidedById: approverId, decidedAt: new Date() },
  });

  revalidatePath('/accounts/purchase-orders');
  revalidatePath(`/procurement/purchase-orders/${poId}`);
}

export async function rejectPO(poId: string, reason: string, approverId: string) {
  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: 'REJECTED', reason, decidedById: approverId, decidedAt: new Date() },
  });
  revalidatePath('/accounts/purchase-orders');
  revalidatePath(`/procurement/purchase-orders/${poId}`);
}

export async function approvePOWithUpdates(
  poId: string,
  approverId: string,
  items: { id: string; unitPriceMinor: number }[]
) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: true }
  });
  if (!po) throw new Error('PO not found');
  if (po.status !== 'SUBMITTED') throw new Error('PO not in SUBMITTED state');

  const totalMinor = items.reduce((acc, item) => {
    const originalItem = po.items.find(i => i.id === item.id);
    const qty = originalItem ? originalItem.qty : 0;
    const itemTotal = BigInt(Math.round(qty * item.unitPriceMinor));
    return acc + itemTotal;
  }, 0n);

  await prisma.$transaction(async (tx) => {
    // 1. Update Items
    for (const item of items) {
      const originalItem = po.items.find(i => i.id === item.id);
      const qty = originalItem ? originalItem.qty : 0;
      const itemTotal = BigInt(Math.round(qty * item.unitPriceMinor));

      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: {
          unitPriceMinor: BigInt(item.unitPriceMinor),
          totalMinor: itemTotal
        }
      });
    }

    // 2. Approve PO
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: 'APPROVED',
        approvedMinor: totalMinor, // Set approved amount
        requestedMinor: totalMinor, // Update requested to match approved? Or keep original? Let's update totalMinor.
        totalMinor: totalMinor,
        decidedById: approverId,
        decidedAt: new Date()
      },
    });
  });

  revalidatePath('/accounts/purchase-orders');
  revalidatePath(`/procurement/purchase-orders/${poId}`);
}

export async function placeOrder(poId: string, userId: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { status: true, projectId: true },
  });
  if (!po) throw new Error('PO not found');
  if (po.status !== 'APPROVED') throw new Error('PO must be APPROVED before placing order');

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: 'PURCHASED' },
  });

  revalidatePath(`/procurement/purchase-orders/${poId}`);
  revalidatePath(`/projects/${po.projectId}`);
}

export async function receiveGoods(
  poId: string,
  items: Array<{
    poItemId: string;
    qtyDelivered: number;
    vendorName: string;
    receiptNumber: string;
    vendorPhone: string;
    unitPriceMajor?: number;
  }>,
  userId: string,
  globalDetails: {
    note?: string;
    receivedAt: string; // YYYY-MM-DD
  }
) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      items: true,
      goodsReceivedNotes: { include: { items: true } }
    },
  });
  if (!po) throw new Error('PO not found');
  if (po.status !== 'PURCHASED' && po.status !== 'PARTIAL') {
    throw new Error('PO must be PURCHASED or PARTIAL to receive goods');
  }

  // Calculate previously received (accepted) quantities to validate over-delivery
  // Logic: "Used" = Accepted Quantity (if Verified) OR Delivered Quantity (if Pending)
  // This ensures that pending deliveries "occupy" the slot until they are either accepted or rejected.
  const receivedByItem = new Map<string, number>();
  po.goodsReceivedNotes.forEach((grn) => {
    grn.items.forEach((gi) => {
      if (gi.poItemId) {
        const current = receivedByItem.get(gi.poItemId) || 0;
        const used = grn.status === 'PENDING' ? gi.qtyDelivered : gi.qtyAccepted;
        receivedByItem.set(gi.poItemId, current + used);
      }
    });
  });

  // Validate items
  for (const item of items) {
    const poItem = po.items.find((pi) => pi.id === item.poItemId);
    if (!poItem) throw new Error(`PO Item not found: ${item.poItemId}`);

    const previouslyReceived = receivedByItem.get(item.poItemId) || 0;
    const remaining = poItem.qty - previouslyReceived;

    if (item.qtyDelivered > remaining) {
      throw new Error(`Cannot deliver ${item.qtyDelivered} for ${poItem.description}. Only ${remaining} remaining (Pending + Accepted).`);
    }
  }

  // 1. Group items by Vendor + Receipt Number
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.vendorName.trim().toLowerCase()}|${item.receiptNumber.trim().toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  // 2. Create GRN for each group
  const receivedAtDate = globalDetails.receivedAt ? new Date(globalDetails.receivedAt) : new Date();

  await prisma.$transaction(async (tx) => {
    for (const groupItems of groups.values()) {
      const first = groupItems[0]; // Reference for vendor/receipt props

      await tx.goodsReceivedNote.create({
        data: {
          purchaseOrderId: poId,
          receivedById: userId,
          receivedAt: receivedAtDate,
          status: 'PENDING',
          note: globalDetails.note ?? null,

          // Per-group details
          vendorName: first.vendorName,
          receiptNumber: first.receiptNumber,
          vendorPhone: first.vendorPhone || null, // Shared phone, assumption: same driver/delivery? Or generic.

          items: {
            create: groupItems.map((item) => {
              const poItem = po.items.find((pi) => pi.id === item.poItemId);

              const grnPriceMinor = item.unitPriceMajor ? BigInt(Math.round(item.unitPriceMajor * 100)) : BigInt(0);
              // Calculate Variance: PO Price - GRN Price. (Positive = Savings/Profit, Negative = Loss)
              // Default PO price to 0 if null/undefined, though schema says BigInt @default(0)
              const poPriceMinor = poItem?.unitPriceMinor ?? BigInt(0);
              const variance = poPriceMinor - grnPriceMinor;

              return {
                poItemId: item.poItemId,
                description: poItem?.description ?? 'Unknown',
                unit: poItem?.unit ?? null,
                qtyDelivered: item.qtyDelivered,
                qtyAccepted: 0,
                qtyRejected: 0,
                priceMinor: grnPriceMinor > 0 ? grnPriceMinor : null, // Store entered price
                varianceMinor: variance, // Store calculated variance
              };
            }),
          },
        },
      });
    }

    // 3. Update PO status based on delivery
    let allReceivedTotal = true;
    let anyReceivedTotal = false;

    for (const poItem of po.items) {
      const deliveredNow = items.find(i => i.poItemId === poItem.id)?.qtyDelivered ?? 0;
      const previouslyUsed = receivedByItem.get(poItem.id) ?? 0;
      const totalDelivered = previouslyUsed + deliveredNow;

      if (totalDelivered < poItem.qty) {
        allReceivedTotal = false;
      }
      if (totalDelivered > 0) {
        anyReceivedTotal = true;
      }
    }

    const nextStatus = allReceivedTotal ? 'RECEIVED' : anyReceivedTotal ? 'PARTIAL' : po.status;

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: nextStatus, updatedAt: new Date() }
    });
  }, { timeout: 10000 });

  revalidatePath(`/procurement/purchase-orders/${poId}`);
  revalidatePath('/dashboard');
}

export async function verifyGRN(
  grnId: string,
  items: Array<{ grnItemId: string; qtyAccepted: number; qtyRejected: number }>,
  userId: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const role = user?.role || '';
  const isAccounts = role === 'ACCOUNTS' || role === 'ACCOUNTING_OFFICER' || role === 'ACCOUNTING_CLERK' || role === 'ADMIN';

  if (!isAccounts) {
    throw new Error('Unauthorized: Only Accounts or Admin can verify GRNs');
  }

  const grn = await prisma.goodsReceivedNote.findUnique({
    where: { id: grnId },
    include: { items: true, purchaseOrder: { include: { items: true } } },
  });
  if (!grn) throw new Error('GRN not found');
  if (grn.status !== 'PENDING') throw new Error('GRN already verified');

  // Update GRN items and status
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.goodsReceivedNoteItem.update({
        where: { id: item.grnItemId },
        data: {
          qtyAccepted: item.qtyAccepted,
          qtyRejected: item.qtyRejected,
        },
      });
    }

    await tx.goodsReceivedNote.update({
      where: { id: grnId },
      data: {
        status: 'VERIFIED',
        verifiedById: userId,
        verifiedAt: new Date(),
      },
    });

    // Recalculate PO status
    const allGRNs = await tx.goodsReceivedNote.findMany({
      where: { purchaseOrderId: grn.purchaseOrderId, status: 'VERIFIED' },
      include: { items: true },
    });

    const receivedByItem = new Map<string, number>();
    allGRNs.forEach((g) => {
      g.items.forEach((grnItem) => {
        if (grnItem.poItemId) {
          const current = receivedByItem.get(grnItem.poItemId) ?? 0;
          receivedByItem.set(grnItem.poItemId, current + grnItem.qtyAccepted);
        }
      });
    });

    let allReceived = true;
    let anyReceived = false;
    for (const poItem of grn.purchaseOrder.items) {
      const received = receivedByItem.get(poItem.id) ?? 0;
      if (received < poItem.qty) {
        allReceived = false;
      }
      if (received > 0) {
        anyReceived = true;
      }
    }

    const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'PURCHASED';
    await tx.purchaseOrder.update({
      where: { id: grn.purchaseOrderId },
      data: { status: newStatus },
    });

    // UPSERT INVENTORY for this GRN
    for (const item of items) {
      if (item.qtyAccepted > 0) {
        // Find description/unit from GRN item (we need to fetch it or rely on passed data if sufficient, better to fetch)
        // We can fetch from database since we are in transaction and just updated it? Or rely on `grn` loaded earlier
        // `grn.items` has the OLD data before update.
        // Let's refetch or lookup from `grn.items` array since descriptions don't change.
        const originalItem = grn.items.find(i => i.id === item.grnItemId);
        if (originalItem) {
          const invName = originalItem.description;
          const invUnit = originalItem.unit;
          await addAcceptedInventory(tx, invName, invUnit, item.qtyAccepted);
        }
      }
    }
  });

  revalidatePath('/inventory');

  revalidatePath(`/procurement/purchase-orders/${grn.purchaseOrderId}`);
  revalidatePath(`/projects/${grn.purchaseOrder.projectId}`);
}


export async function verifyMultipleGRNs(
  items: Array<{ grnItemId: string; grnId: string; qtyAccepted: number; qtyRejected: number }>,
  userId: string
) {
  if (items.length === 0) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const role = user?.role || '';
  const isAccounts = role === 'ACCOUNTS' || role === 'ACCOUNTING_OFFICER' || role === 'ACCOUNTING_CLERK' || role === 'ADMIN';
  if (!isAccounts) {
    throw new Error('Unauthorized: Only Accounts or Admin can verify GRNs');
  }

  // 1. Group items by GRN ID
  const itemsByGrn = new Map<string, typeof items>();
  items.forEach(item => {
    if (!itemsByGrn.has(item.grnId)) {
      itemsByGrn.set(item.grnId, []);
    }
    itemsByGrn.get(item.grnId)!.push(item);
  });

  const grnIds = Array.from(itemsByGrn.keys());

  // We need the PO ID to revalidate and update status. 
  // Assume all items belong to same PO (enforced by UI), but valid to fetch from first GRN.
  const grns = await prisma.goodsReceivedNote.findMany({
    where: { id: { in: grnIds } },
    include: { items: true, purchaseOrder: { select: { projectId: true } } },
  });
  const firstGrn = grns.find((grn) => grn.id === grnIds[0]);
  if (!firstGrn) throw new Error('GRN not found');

  if (grns.length !== grnIds.length || grns.some((grn) => grn.status !== 'PENDING')) {
    throw new Error('One or more receipts have already been verified');
  }

  if (grns.some((grn) => grn.purchaseOrderId !== firstGrn.purchaseOrderId)) {
    throw new Error('Receipts must belong to the same purchase order');
  }

  for (const item of items) {
    const grn = grns.find((candidate) => candidate.id === item.grnId);
    const grnItem = grn?.items.find((candidate) => candidate.id === item.grnItemId);
    if (!grnItem) throw new Error('Receipt item not found');
    validateGrnQuantities(grnItem.qtyDelivered, item.qtyAccepted, item.qtyRejected);
  }

  await prisma.$transaction(async (tx) => {
    // 2. Process each GRN
    for (const [grnId, groupItems] of itemsByGrn.entries()) {
      // Update items
      for (const item of groupItems) {
        await tx.goodsReceivedNoteItem.update({
          where: { id: item.grnItemId },
          data: {
            qtyAccepted: item.qtyAccepted,
            qtyRejected: item.qtyRejected,
          },
        });
      }

      // Check if this GRN is fully verified (simple logic: Mark verified if we pushed updates)
      // In a partial verification scenario, we might needs logic to see if *all* items in that GRN were handled.
      // For now, assuming the UI sends *all* items for the GRNs being touched.
      await tx.goodsReceivedNote.update({
        where: { id: grnId },
        data: {
          status: 'VERIFIED',
          verifiedById: userId,
          verifiedAt: new Date(),
        },
      });
    }

    // 3. Recalculate PO status (Shared logic)
    // Fetch ALL verified GRNs for this PO to check totals
    const allVerifiedGRNs = await tx.goodsReceivedNote.findMany({
      where: { purchaseOrderId: firstGrn.purchaseOrderId, status: 'VERIFIED' },
      include: { items: true },
    });

    // Also fetch the PO items to know what was ordered
    const po = await tx.purchaseOrder.findUnique({
      where: { id: firstGrn.purchaseOrderId },
      include: { items: true }
    });
    if (!po) return; // Should not happen

    const receivedByItem = new Map<string, number>();
    allVerifiedGRNs.forEach((g) => {
      g.items.forEach((grnItem) => {
        if (grnItem.poItemId) {
          const current = receivedByItem.get(grnItem.poItemId) ?? 0;
          receivedByItem.set(grnItem.poItemId, current + grnItem.qtyAccepted);
        }
      });
    });

    let allReceived = true;
    let anyReceived = false;
    for (const poItem of po.items) {
      const received = receivedByItem.get(poItem.id) ?? 0;
      if (received < poItem.qty) {
        allReceived = false;
      }
      if (received > 0) {
        anyReceived = true;
      }
    }

    const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'PURCHASED';
    await tx.purchaseOrder.update({
      where: { id: firstGrn.purchaseOrderId },
      data: { status: newStatus },
    });

    // UPSERT INVENTORY for all processed items
    for (const [grnId, groupItems] of itemsByGrn.entries()) {
      const grnItemsDb = await tx.goodsReceivedNoteItem.findMany({
        where: { grnId, id: { in: groupItems.map(i => i.grnItemId) } }
      });

      for (const item of groupItems) {
        if (item.qtyAccepted > 0) {
          const dbItem = grnItemsDb.find(i => i.id === item.grnItemId);
          if (dbItem) {
            const invName = dbItem.description;
            const invUnit = dbItem.unit;
            await addAcceptedInventory(tx, invName, invUnit, item.qtyAccepted);
          }
        }
      }
    }

  }, { timeout: 10000 });

  revalidatePath('/inventory');

  revalidatePath(`/procurement/purchase-orders/${firstGrn?.purchaseOrderId}`);
  revalidatePath(`/projects/${firstGrn?.purchaseOrder?.projectId}`);
  revalidatePath('/dashboard');
}
