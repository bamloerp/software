
'use server';

import { prisma } from '@/lib/db';
import { fromMinor } from '@/helpers/money';

export type ReportData = {
    deliveries: DeliveryItem[];
    quoteLines: QuoteLineData[];
};

export type DeliveryItem = {
    id: string;
    description: string;
    unit: string | null;
    qtyDelivered: number;
    qtyUsed: number;
    qtyBalance: number;
    avgRate: number;
    totalAmount: number;
    quoteLineIds: string[];
    section?: string; // Derived from quote line
};

export type QuoteLineData = {
    id: string;
    description: string;
    unit: string | null;
    quantity: number;
    unitPrice: number;
    amount: number;
    section: string;
    itemType: string;
};

// Helper for sorting sections if we knew the order, but for now specific order:
// Helper for sorting sections if we knew the order, but for now specific order:
const SECTION_ORDER = [
    "PRELIMINARIES", "SUBSTRUCTURE", "SUPERSTRUCTURE", "ROOFING", "PLUMBING", "ELECTRICAL", "FINISHES", "EXTERNAL WORKS"
]; // approximate standard

function normalizeSection(section: string | null | undefined): string {
    if (!section) return 'General';
    const upper = section.toUpperCase().trim();

    // Map variations to standard sections
    if (upper.includes('FOUNDATION') || upper.includes('SUBSTRUCTURE')) return 'SUBSTRUCTURE';
    if (upper.includes('SUPERSTRUCTURE') || upper.includes('WALLS')) return 'SUPERSTRUCTURE';
    if (upper.includes('ROOF')) return 'ROOFING';
    if (upper.includes('PLUMBING')) return 'PLUMBING';
    if (upper.includes('ELECTRICAL')) return 'ELECTRICAL';
    if (upper.includes('FINISH')) return 'FINISHES';
    if (upper.includes('EXTERNAL')) return 'EXTERNAL WORKS';
    if (upper.includes('PRELIM')) return 'PRELIMINARIES';

    return section.trim(); // Return original if no match, but trimmed
}

function getSectionRank(section: string | undefined) {
    if (!section) return 999;
    // Normalize first so we match the order array
    const normalized = normalizeSection(section);
    const idx = SECTION_ORDER.findIndex(s => normalized.toUpperCase() === s);
    return idx === -1 ? 100 : idx;
}

export async function getProjectReportData(projectId: string): Promise<ReportData> {

    // 1. Fetch Quote Lines First to build the "Section Map"
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { quoteId: true }
    });

    let quoteLines: QuoteLineData[] = [];
    const quoteLineMap = new Map<string, QuoteLineData>();

    if (project?.quoteId) {
        const lines = await prisma.quoteLine.findMany({
            where: {
                quoteId: project.quoteId,
                // Explicitly hide this section as requested by user
                NOT: { section: 'LABOUR — SUB-STRUCTURE' }
            },
            orderBy: [
                // We can't easily sort by 'section order' here, so we sort by description or insertion?
                // Let's sort by ID or just description. We will sort in JS.
                { description: 'asc' }
            ]
        });

        quoteLines = lines.map(line => ({
            id: line.id,
            description: line.description,
            unit: line.unit ?? null,
            quantity: line.quantity,
            unitPrice: line.unitPriceMinor ? fromMinor(line.unitPriceMinor) : 0,
            amount: line.lineTotalMinor ? fromMinor(line.lineTotalMinor) : 0,
            section: normalizeSection(line.section),
            itemType: line.itemType || 'MATERIAL'
        }));

        // Sort by Section Rank then Description
        quoteLines.sort((a, b) => {
            const rankA = getSectionRank(a.section);
            const rankB = getSectionRank(b.section);
            if (rankA !== rankB) return rankA - rankB;
            return a.description.localeCompare(b.description);
        });

        quoteLines.forEach(q => quoteLineMap.set(q.id, q));
    }

    // 2. Fetch Dispatches & Items
    const dispatches = await prisma.dispatch.findMany({
        where: { projectId, status: { not: 'DRAFT' } },
        include: {
            items: {
                include: {
                    purchase: true,
                    requisitionItem: {
                        select: {
                            quoteLineId: true,
                            qtyRequested: true,
                            estPriceMinor: true,
                            amountMinor: true,
                        },
                    },
                }
            }
        }
    });

    // Aggregate Delivery Items
    const deliveryMap = new Map<string, DeliveryItem>();

    for (const d of dispatches) {
        for (const item of d.items) {
            const key = `${item.description.toLowerCase().trim()}|${item.unit?.toLowerCase().trim() ?? ''}`;
            const existing = deliveryMap.get(key);

            const qty = Number(item.qty);
            const handedOut = Math.max(0, qty - Number(item.returnedQty ?? 0));
            const used = Number(item.usedOutQty ?? 0);
            const quoteLineId = item.requisitionItem?.quoteLineId;

            // Derive per-unit price. `estPriceMinor` on DispatchItem/RequisitionItem
            // actually holds the line TOTAL (qty × unit price) copied from the quote
            // line — NOT a per-unit rate. We therefore prefer the matched quote line's
            // unitPriceMinor; if none is available, fall back to dividing the
            // requisition item's total by its requested qty.
            let unitPrice = 0;
            if (quoteLineId) {
                const ql = quoteLineMap.get(quoteLineId);
                if (ql) unitPrice = ql.unitPrice;
            }
            if (!unitPrice && item.requisitionItem) {
                const reqQty = Number(item.requisitionItem.qtyRequested ?? 0);
                const reqTotalMinor =
                    item.requisitionItem.amountMinor ??
                    item.requisitionItem.estPriceMinor ??
                    0n;
                if (reqQty > 0 && reqTotalMinor) {
                    unitPrice = fromMinor(reqTotalMinor) / reqQty;
                }
            }
            if (!unitPrice && item.estPriceMinor) {
                // Last-ditch fallback: assume estPriceMinor is the line total for THIS
                // dispatch qty (best guess for items without a requisition link).
                const dispatchQty = qty || 1;
                unitPrice = fromMinor(item.estPriceMinor) / dispatchQty;
            }
            const price = unitPrice;

            // Attempt to derive section from linked quote line
            let section = 'General';
            if (quoteLineId) {
                const ql = quoteLineMap.get(quoteLineId);
                if (ql) section = ql.section;
            }

            if (existing) {
                const totalVal = (existing.avgRate * existing.qtyDelivered) + (price * handedOut);
                existing.qtyDelivered += handedOut;
                existing.qtyUsed += used;
                existing.qtyBalance = existing.qtyDelivered - existing.qtyUsed;
                existing.avgRate = existing.qtyDelivered > 0 ? totalVal / existing.qtyDelivered : 0;
                existing.totalAmount += (price * handedOut);

                if (quoteLineId && !existing.quoteLineIds.includes(quoteLineId)) {
                    existing.quoteLineIds.push(quoteLineId);
                    // Update section if we found a better one and existing was default
                    if (existing.section === 'General' && section !== 'General') {
                        existing.section = section;
                    }
                }
            } else {
                deliveryMap.set(key, {
                    id: item.id,
                    description: item.description,
                    unit: item.unit ?? null,
                    qtyDelivered: handedOut,
                    qtyUsed: used,
                    qtyBalance: handedOut - used,
                    avgRate: price,
                    totalAmount: price * handedOut,
                    quoteLineIds: quoteLineId ? [quoteLineId] : [],
                    section
                });
            }
        }
    }

    // Sort deliveries by Section then Description
    const deliveries = Array.from(deliveryMap.values()).sort((a, b) => {
        const rankA = getSectionRank(a.section);
        const rankB = getSectionRank(b.section);
        if (rankA !== rankB) return rankA - rankB;
        return a.description.localeCompare(b.description);
    });

    return {
        deliveries,
        quoteLines
    };
}
