import { prisma } from '@/lib/db';
import { readQuoteGrandTotal } from '@/lib/accounting';
import { Prisma } from '@prisma/client';

export type PnLSummary = {
    contractValueMinor: bigint;
    negotiationVarianceMinor: bigint;
    procurementVarianceMinor: bigint;
    usageVarianceMinor: bigint;
    returnsValueMinor: bigint;
    netProfitLossMinor: bigint;
};

export type VarianceItem = {
    id: string; // quoteLineId or similar
    description: string;
    category: 'NEGOTIATION' | 'PROCUREMENT' | 'USAGE' | 'RETURNS';
    varianceMinor: bigint; // Positive = Profit/Savings, Negative = Loss
    details: string; // Keep for backward compatibility or simple view
    projectName?: string; // Optional context
    projectId?: string; // Optional context for linking

    // New structured data for tables
    structuredDetails?: {
        estUnitPriceMinor?: bigint;
        actualUnitPriceMinor?: bigint;
        quantity?: number;
        // For Usage
        quotedQty?: number;
        usedQty?: number;
        unitPriceMinor?: bigint;
    };
};

/**
 * Core P&L Calculation Logic for a single hydrated project.
 */
function calculatePnL(project: any): { summary: PnLSummary; items: VarianceItem[] } {
    const items: VarianceItem[] = [];
    let negotiationVarianceMinor = 0n;
    let procurementVarianceMinor = 0n;
    let usageVarianceMinor = 0n;
    let returnsValueMinor = 0n;

    // --- 1. Negotiation Variance ---
    const negotiation = project.quote?.negotiations?.[0];
    if (negotiation && negotiation.originalVersion && negotiation.proposedVersion) {
        try {
            const originalData = JSON.parse(negotiation.originalVersion.snapshotJson);
            const proposedData = JSON.parse(negotiation.proposedVersion.snapshotJson);

            // Safe BigInt parser helper
            const toBigInt = (val: any) => {
                if (!val) return 0n;
                return BigInt(val);
            };

            const originalLines = (Array.isArray(originalData.lines) ? originalData.lines : []) as any[];
            const proposedLines = (Array.isArray(proposedData.lines) ? proposedData.lines : []) as any[];

            // Calculate Totals
            const originalTotal = originalLines.reduce((acc: bigint, l: any) => acc + toBigInt(l.lineTotalMinor), 0n);
            const proposedTotal = proposedLines.reduce((acc: bigint, l: any) => acc + toBigInt(l.lineTotalMinor), 0n);

            const variance = originalTotal - proposedTotal;
            negotiationVarianceMinor += variance;

            // Generate Detailed Items
            const originalMap = new Map(originalLines.map((l: any) => [l.id, l]));

            for (const propLine of proposedLines) {
                const origLine = originalMap.get(propLine.id);
                const propTotal = toBigInt(propLine.lineTotalMinor);
                const origTotal = origLine ? toBigInt(origLine.lineTotalMinor) : 0n;

                const lineVariance = origTotal - propTotal;

                if (lineVariance !== 0n) {
                    items.push({
                        id: propLine.id,
                        description: `Negotiation: ${propLine.description || 'Item'}`,
                        category: 'NEGOTIATION',
                        varianceMinor: lineVariance,
                        details: `Original: ${Number(origTotal) / 100}, Final: ${Number(propTotal) / 100}`,
                        structuredDetails: {
                            estUnitPriceMinor: origTotal, // Using total context for simplicity in this distinct view
                            actualUnitPriceMinor: propTotal,
                            quantity: 1 // Abstract quantity for line total diff
                        }
                    });
                }

                if (origLine) originalMap.delete(propLine.id); // Handled
            }

            // Handle deleted lines (in original but not in proposed)
            for (const [id, origLine] of originalMap) {
                const origTotal = toBigInt(origLine.lineTotalMinor);
                const lineVariance = origTotal; // Removal of a line is a saving in cost!

                items.push({
                    id: origLine.id,
                    description: `Negotiation (Removed): ${origLine.description}`,
                    category: 'NEGOTIATION',
                    varianceMinor: lineVariance,
                    details: `Removed. Original Value: ${Number(origTotal) / 100}`,
                    structuredDetails: {
                        estUnitPriceMinor: origTotal,
                        actualUnitPriceMinor: 0n,
                        quantity: 1
                    }
                });
            }

        } catch (e) {
            console.error('Error calculating negotiation variance for project ' + project.id, e);
        }
    }

    // --- 2. Procurement Variance ---
    if (project.requisitions) {
        for (const req of project.requisitions) {
            for (const item of req.items) {
                // Ensure purchases exist
                if (item.purchases) {
                    for (const purch of item.purchases) {
                        if (purch.qty > 0) {
                            let baselineUnitPrice: bigint = (item.estPriceMinor ?? 0n) > 0n ? BigInt(item.estPriceMinor as any) : 0n;
                            if (item.quoteLineId && project.quote?.lines) {
                                const ql = project.quote.lines.find((l: any) => l.id === item.quoteLineId);
                                if (ql) baselineUnitPrice = BigInt(ql.unitPriceMinor as any);
                            }
                            const actualUnitPrice = purch.priceMinor;
                            const diff = baselineUnitPrice - actualUnitPrice;
                            const variance = diff * BigInt(Math.floor(purch.qty));

                            if (variance !== 0n) {
                                procurementVarianceMinor += variance;
                                items.push({
                                    id: purch.id,
                                    description: `Procurement: ${item.description || 'Item'} (${purch.vendor})`,
                                    category: 'PROCUREMENT',
                                    varianceMinor: variance,
                                    details: `Est: ${Number(baselineUnitPrice) / 100}, Paid: ${Number(actualUnitPrice) / 100} x ${purch.qty}`,
                                    structuredDetails: {
                                        estUnitPriceMinor: baselineUnitPrice,
                                        actualUnitPriceMinor: actualUnitPrice,
                                        quantity: purch.qty
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // --- 3. Usage Variance ---
    if (project.quote?.lines && project.requisitions) {
        const reqsByQuoteLine = new Map<string, { qty: number; items: any[] }>();
        for (const req of project.requisitions) {
            for (const item of req.items) {
                if (item.quoteLineId) {
                    const e = reqsByQuoteLine.get(item.quoteLineId) || { qty: 0, items: [] };
                    e.qty += (item.qtyRequested || 0);
                    e.items.push(item);
                    reqsByQuoteLine.set(item.quoteLineId, e);
                }
            }
        }

        for (const line of project.quote.lines) {
            const usage = reqsByQuoteLine.get(line.id);
            if (usage) {
                if (usage.qty > line.quantity) {
                    const over = usage.qty - line.quantity;
                    const loss = BigInt(Math.round(over)) * line.unitPriceMinor * -1n;
                    usageVarianceMinor += loss;

                    items.push({
                        id: line.id,
                        description: `Over-usage: ${line.description}`,
                        category: 'USAGE',
                        varianceMinor: loss,
                        details: `Quoted: ${line.quantity}, Requested: ${usage.qty} (Total), Over: ${over}`,
                        structuredDetails: {
                            quotedQty: line.quantity,
                            usedQty: usage.qty,
                            quantity: over, // Over amount
                            unitPriceMinor: line.unitPriceMinor
                        }
                    });
                }
            }
        }
    }

    // --- 4. Returns ---
    if (project.dispatches) {
        for (const d of project.dispatches) {
            if (d.items) {
                for (const item of d.items) {
                    if ((item.returnedQty ?? 0) > 0) {
                        let price = 0n;
                        if (item.purchase) price = item.purchase.priceMinor;
                        if (price > 0n) {
                            const val = price * (BigInt(Math.round(item.returnedQty || 0)));
                            returnsValueMinor += val;
                            items.push({
                                id: item.id,
                                description: `Return: ${item.description}`,
                                category: 'RETURNS',
                                varianceMinor: val,
                                details: `Returned ${item.returnedQty} @ ${Number(price) / 100}`,
                                structuredDetails: {
                                    quantity: item.returnedQty,
                                    actualUnitPriceMinor: price
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    // Revenue
    const contractValueMinor = project.quote ? BigInt(Math.round(readQuoteGrandTotal(project.quote) * 100)) : 0n;

    const netProfitLossMinor =
        negotiationVarianceMinor +
        procurementVarianceMinor +
        usageVarianceMinor +
        returnsValueMinor;

    return {
        summary: {
            contractValueMinor,
            negotiationVarianceMinor,
            procurementVarianceMinor,
            usageVarianceMinor,
            returnsValueMinor,
            netProfitLossMinor
        },
        items
    };
}

const pnlQueryInclude = {
    quote: {
        include: {
            lines: true,
            negotiations: {
                where: { status: 'CLOSED_WON' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: { originalVersion: true, proposedVersion: true }
            }
        },
    },
    requisitions: {
        where: { status: { in: ['APPROVED', 'ORDERED', 'PURCHASED', 'PARTIAL', 'RECEIVED'] } },
        include: { items: { include: { purchases: true } } },
    },
    // Include dispatches for Returns logic
    dispatches: {
        include: { items: { include: { purchase: true, inventoryItem: true } } }
    },
    // Returns via InventoryAllocation (optional per original logic, but dispatches cover it usually)
    inventoryAllocations: { where: { returnedAt: { not: null } }, include: { inventoryItem: true } },
} satisfies Prisma.ProjectInclude;


export async function getProjectPnL(projectId: string): Promise<{ summary: PnLSummary; items: VarianceItem[] }> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: pnlQueryInclude
    });

    if (!project || !project.quote) {
        throw new Error('Project or Quote not found');
    }

    return calculatePnL(project);
}

/**
 * Fetches P&L for multiple projects efficiently.
 */
export async function getBulkPnL(where: Prisma.ProjectWhereInput): Promise<{ summary: PnLSummary; items: VarianceItem[] }> {
    const projects = await prisma.project.findMany({
        where,
        include: {
            ...pnlQueryInclude,
            // Also need name context for bulk
            // name is already in Project
        }
    });

    const globalSummary: PnLSummary = {
        contractValueMinor: BigInt(0),
        negotiationVarianceMinor: BigInt(0),
        procurementVarianceMinor: BigInt(0),
        usageVarianceMinor: BigInt(0),
        returnsValueMinor: BigInt(0),
        netProfitLossMinor: BigInt(0)
    };

    let globalItems: VarianceItem[] = [];

    for (const p of projects) {
        if (!p.quote) continue; // Skip if no quote

        const res = calculatePnL(p);
        const projectName = (p.quote as any)?.customer?.displayName || p.name; // Type casting for convenience

        // Aggregate
        globalSummary.contractValueMinor += res.summary.contractValueMinor;
        globalSummary.negotiationVarianceMinor += res.summary.negotiationVarianceMinor;
        globalSummary.procurementVarianceMinor += res.summary.procurementVarianceMinor;
        globalSummary.usageVarianceMinor += res.summary.usageVarianceMinor;
        globalSummary.returnsValueMinor += res.summary.returnsValueMinor;
        globalSummary.netProfitLossMinor += res.summary.netProfitLossMinor;

        // Tag Items
        const tagged = res.items.map(item => ({
            ...item,
            projectName: projectName,
            projectId: p.id,
            itemName: item.description, // Keep original description here for table, simpler
            description: item.description // Keep original
        }));
        globalItems = [...globalItems, ...tagged];
    }

    return { summary: globalSummary, items: globalItems };
}
