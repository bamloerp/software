import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

const toMinor = (amount: number, scale = 2) => BigInt(Math.round(Number(amount ?? 0) * Math.pow(10, scale)));

async function upsertUser({ email, name, role, office, password }: any) {
    console.log(`> Upserting user: ${email}`);
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    return prisma.user.upsert({
        where: { email },
        update: {
            name,
            role,
            office,
            ...(passwordHash ? { passwordHash } : {}),
        },
        create: {
            email,
            name,
            role,
            office: office ?? null,
            passwordHash,
        },
    });
}

export async function GET() {
    try {
        console.log('[API/SEED] Starting seed...');

        // Connectivity probe
        await prisma.$queryRaw`SELECT 1`;
        console.log('[API/SEED] Database connection successful.');

        const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'Password01';
        const sharedPassword = DEFAULT_PASSWORD;

        // Users
        console.log('[API/SEED] Upserting System user...');
        const system = await upsertUser({ email: 'system@local', name: 'System', role: 'ADMIN', office: 'HQ', password: null });
        console.log('[API/SEED] System user upserted.');

        console.log('[API/SEED] Upserting other users...');
        await Promise.all([
            upsertUser({ email: 'qs@example.com', name: 'QS User', role: 'QS', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'senior@example.com', name: 'Senior QS', role: 'SENIOR_QS', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'sales@example.com', name: 'Sales User', role: 'SALES', office: 'Office A', password: sharedPassword }),
            // upsertUser({ email: 'pm@example.com', name: 'Project Manager', role: 'PROJECT_MANAGER', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'teamlead@example.com', name: 'Project Team Lead', role: 'PROJECT_TEAM', office: 'Office A', password: sharedPassword }),
            // upsertUser({ email: 'seniorpm@example.com', name: 'Senior PM', role: 'SENIOR_PM', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'ops1@example.com', name: 'Operations Officer 1', role: 'PROJECT_OPERATIONS_OFFICER', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'ops2@example.com', name: 'Operations Officer 2', role: 'PROJECT_OPERATIONS_OFFICER', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'projectcoordinator@example.com', name: 'Project Coordinator', role: 'PROJECT_COORDINATOR', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'ops@example.com', name: 'Operations', role: 'PROJECT_OPERATIONS_OFFICER', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'hr@example.com', name: 'HR', role: 'HUMAN_RESOURCE', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'hr@example.com', name: 'HR', role: 'HUMAN_RESOURCE', office: 'Office A', password: sharedPassword }),

            upsertUser({ email: 'admin@example.com', name: 'Admin', role: 'ADMIN', office: 'HQ', password: sharedPassword }),
            upsertUser({ email: 'client@example.com', name: 'Client', role: 'CLIENT', office: null, password: sharedPassword }),
            upsertUser({ email: 'procurement@example.com', name: 'Procurement', role: 'PROCUREMENT', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'seniorprocurement@example.com', name: 'Senior Procurement', role: 'SENIOR_PROCUREMENT', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'accounts@example.com', name: 'Accounts', role: 'ACCOUNTS', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'security@example.com', name: 'Security', role: 'SECURITY', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'driver@example.com', name: 'Driver', role: 'DRIVER', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'accounting_clerk@example.com', name: 'Accounting Clerk', role: 'ACCOUNTING_CLERK', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'accounting_officer@example.com', name: 'Accounting Officer', role: 'ACCOUNTING_OFFICER', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'accounting_auditor@example.com', name: 'Accounting Auditor', role: 'ACCOUNTING_AUDITOR', office: 'Office A', password: sharedPassword }),
            upsertUser({ email: 'salesaccount@example.com', name: 'Sales Accounts', role: 'SALES_ACCOUNTS', office: 'Office A', password: 'password123' }),
        ]);

        // Default customer
        const customer = await prisma.customer.upsert({
            where: { id: 'seed-default' },
            update: { displayName: 'Walk-in Customer', addressJson: { street: '—', city: '—' } },
            create: {
                id: 'seed-default',
                displayName: 'Walk-in Customer',
                email: null,
                phone: null,
                addressJson: { street: '—', city: '—' },
            },
        });

        // Product
        try {
            await prisma.product.upsert({
                where: { sku: 'SAMPLE-001' },
                update: { name: 'Sample Item', unit: 'ea', basePriceMinor: toMinor(100), extraJson: null },
                create: { sku: 'SAMPLE-001', name: 'Sample Item', unit: 'ea', basePriceMinor: toMinor(100), extraJson: null },
            });
        } catch (e: any) {
            const msg = (e && e.message) || '';
            if (msg.includes('Unknown arg `basePriceMinor`') || msg.includes('no such column: basePriceMinor')) {
                console.warn('[API/SEED] Falling back to legacy product schema.');
                await prisma.product.upsert({
                    where: { sku: 'SAMPLE-001' },
                    update: { name: 'Sample Item', unit: 'ea', basePrice: '100.0000', extraJson: null } as any,
                    create: { sku: 'SAMPLE-001', name: 'Sample Item', unit: 'ea', basePrice: '100.0000', extraJson: null } as any,
                });
            } else {
                throw e;
            }
        }

        return NextResponse.json({ success: true, message: 'Seeding completed successfully.' });
    } catch (error: any) {
        console.error('[API/SEED] Failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
