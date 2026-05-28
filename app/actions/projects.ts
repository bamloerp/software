'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { safeAction } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { generatePaymentSchedule } from '@/app/(protected)/projects/actions';
import { readQuoteGrandTotal } from '@/lib/accounting';

const createProjectFromQuoteSchema = z.object({
    quoteId: z.string(),
    commenceOn: z.string(),
    depositMinor: z.number(),
    installmentMinor: z.number(),
    installmentDueDay: z.number(),
});

export const createProjectFromQuote = safeAction(createProjectFromQuoteSchema, async (data) => {
    const { quoteId, commenceOn, depositMinor, installmentMinor, installmentDueDay } = data;

    const user = await getCurrentUser();
    if (!user) throw new Error('Auth required');

    const commenceDate = new Date(commenceOn);
    if (Number.isNaN(commenceDate.getTime())) {
        throw new Error('Commencement date is invalid');
    }

    // Derive first installment date (same day of month, or next month if not after commence)
    const dueDate = new Date(commenceDate);
    if (Number.isFinite(installmentDueDay)) {
        dueDate.setDate(installmentDueDay);
    }
    if (dueDate <= commenceDate) {
        dueDate.setMonth(dueDate.getMonth() + 1);
    }

    // Validate against grand total
    const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        select: {
            number: true,
            metaJson: true,
            pgRate: true,
            contingencyRate: true,
            vatBps: true,
            lines: { select: { lineTotalMinor: true } },
        },
    });
    if (!quote) throw new Error('Quote not found');

    const grandTotalMinor = BigInt(Math.round(readQuoteGrandTotal(quote as any) * 100));

    const deposit = BigInt(Math.round(depositMinor || 0));
    const installment = BigInt(Math.round(installmentMinor || 0));

    if (deposit > grandTotalMinor) {
        const grandTotalDisplay = Number(grandTotalMinor) / 100;
        throw new Error(`Deposit cannot exceed the grand total of ${grandTotalDisplay.toFixed(2)}`);
    }

    if (installment > grandTotalMinor) {
        const grandTotalDisplay = Number(grandTotalMinor) / 100;
        throw new Error(`Installment cannot exceed the grand total of ${grandTotalDisplay.toFixed(2)}`);
    }

    if (deposit + installment > grandTotalMinor) {
        const grandTotalDisplay = Number(grandTotalMinor) / 100;
        throw new Error(`Deposit plus installment cannot exceed the grand total of ${grandTotalDisplay.toFixed(2)}`);
    }

    if (dueDate <= commenceDate) {
        throw new Error('Installment due date must be after the commencement date');
    }

    // Find Sales Accounts user
    const salesAccountsUser = await prisma.user.findFirst({
        where: { role: 'SALES_ACCOUNTS' },
    });

    if (!salesAccountsUser) {
        throw new Error('Sales Accounts user not found. Please create a user with role SALES_ACCOUNTS.');
    }

    // Generate project number (BM-...)
    const projectNumber = quote.number ? quote.number.replace(/^Q-/, 'BM-') : `BM-${Date.now().toString().slice(-6)}`;

    // Create project with DEPOSIT_PENDING status
    const project = await prisma.project.create({
        data: {
            quoteId,
            projectNumber,
            commenceOn: commenceDate,
            installmentDueOn: dueDate,
            depositMinor,
            installmentMinor,
            installmentDueDay,
            status: 'CREATED',
            assignedToId: salesAccountsUser.id,
        },
    });

    // Immediately generate the payment schedule (Deposit + monthly installments)
    try {
        await generatePaymentSchedule(project.id);
    } catch (error) {
        console.error('Failed to generate payment schedule on project creation', error);
    }

    try {
        revalidatePath('/projects');
        revalidatePath(`/projects/${project.id}`);
    } catch (error) {
        // Ignore revalidation errors in scripts
    }

    return { success: true, project };
});

const recordDepositSchema = z.object({
    projectId: z.string(),
    amountMinor: z.number(),
    receivedAt: z.string(),
    receiptNo: z.string().optional(),
    method: z.string().optional(),
    projectManagerId: z.string().optional().nullable(),
});

export const recordDeposit = safeAction(recordDepositSchema, async (data) => {
    const { projectId, amountMinor, receivedAt, receiptNo, method, projectManagerId } = data;

    const actor = await getCurrentUser();
    if (!actor || !['SALES_ACCOUNTS', 'ADMIN'].includes(actor.role)) {
        throw new Error('Only Sales Accounts or Admin can record client payments');
    }

    // Record the payment
    await prisma.clientPayment.create({
        data: {
            projectId,
            type: 'DEPOSIT',
            amountMinor,
            receivedAt: new Date(receivedAt),
            receiptNo,
            method,
            recordedById: actor.id as string,
        },
    });

    // Update deposit payment schedule
    const depositSchedule = await prisma.paymentSchedule.findFirst({
        where: {
            projectId,
            label: 'Deposit',
        },
    });

    if (depositSchedule) {
        const newPaidAmount = Number(depositSchedule.paidMinor) + amountMinor;
        const totalAmount = Number(depositSchedule.amountMinor);

        await prisma.paymentSchedule.update({
            where: { id: depositSchedule.id },
            data: {
                paidMinor: newPaidAmount,
                status: newPaidAmount >= totalAmount ? 'PAID' : 'PARTIAL',
            },
        });
    }

    // Update project status and assign to PM
    const project = await prisma.project.update({
        where: { id: projectId },
        data: {
            status: 'PLANNED',
            assignedToId: projectManagerId || undefined,
        },
    });

    try {
        revalidatePath('/projects');
        revalidatePath(`/projects/${projectId}`);
        revalidatePath('/payments');
        revalidatePath(`/projects/${projectId}/payments`);
    } catch (error) {
        // Ignore revalidation errors
    }

    return { success: true, project };
});

const completeScheduleSchema = z.object({
    projectId: z.string(),
});

export const completeSchedule = safeAction(completeScheduleSchema, async (data) => {
    const { projectId } = data;

    // Update project status to READY
    const project = await prisma.project.update({
        where: { id: projectId },
        data: {
            status: 'READY',
        },
    });

    try {
        revalidatePath('/projects');
        revalidatePath(`/projects/${projectId}`);
    } catch (error) {
        // Ignore revalidation errors
    }

    return { success: true, project };
});
