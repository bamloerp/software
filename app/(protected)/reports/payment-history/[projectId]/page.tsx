import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import Money from '@/components/Money';
import Link from 'next/link';
import PrintHeader from '@/components/PrintHeader';
import PrintButton from '@/components/PrintButton';
import { readQuoteGrandTotal } from '@/lib/accounting';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectPaymentHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!['PROJECT_COORDINATOR', 'ACCOUNTS', 'ACCOUNTING_CLERK', 'ACCOUNTING_OFFICER', 'ACCOUNTING_AUDITOR'].includes(user.role)) redirect('/dashboard');

  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      projectNumber: true,
      quote: {
        select: {
          id: true,
          metaJson: true,
          pgRate: true,
          contingencyRate: true,
          vatBps: true,
          lines: { select: { lineTotalMinor: true } },
          customer: {
            select: {
              displayName: true,
              city: true,
              phone: true,
              addressJson: true,
            },
          },
        },
      },
      clientPayments: {
        orderBy: { receivedAt: 'asc' },
        select: {
          id: true,
          type: true,
          amountMinor: true,
          receivedAt: true,
          receiptNo: true,
          method: true,
          description: true,
          recordedById: true,
        },
      },
      payments: {
        orderBy: { receivedAt: 'asc' },
        select: {
          id: true,
          type: true,
          amountMinor: true,
          receivedAt: true,
          receivedBy: { select: { name: true } },
          receiptNo: true,
          ref: true,
          paidOn: true,
        },
      },
    },
  });
  if (!project) return notFound();

  const quotedMinor = project.quote ? BigInt(Math.round(readQuoteGrandTotal(project.quote as any) * 100)) : 0n;

  // Map recordedById on client payments to user names (for "Received by" column)
  const clientRecordedIds = Array.from(
    new Set(
      (project.clientPayments || [])
        .map((p) => p.recordedById)
        .filter((id): id is string => !!id),
    ),
  );

  let recordedByMap: Record<string, string> = {};
  if (clientRecordedIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: clientRecordedIds } },
      select: { id: true, name: true },
    });
    recordedByMap = Object.fromEntries(
      users.map((u) => [u.id, u.name || '']),
    );
  }

  const allPayments = [
    ...(project.clientPayments || []).map((p) => ({
      id: `c_${p.id}`,
      date: p.receivedAt,
      description: p.description || p.type || 'Payment',
      invoiceNo: p.receiptNo || '',
      receivedBy: (p.recordedById && recordedByMap[p.recordedById]) || '',
      amountMinor: BigInt(p.amountMinor),
    })),
    ...(project.payments || []).map((p) => ({
      id: `p_${p.id}`,
      date: p.receivedAt || p.paidOn,
      description: p.ref || p.type || 'Payment',
      invoiceNo: p.receiptNo || '',
      receivedBy: p.receivedBy?.name || '',
      amountMinor: BigInt(p.amountMinor),
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalPaidMinor = allPayments.reduce(
    (acc, p) => acc + BigInt(p.amountMinor),
    0n,
  );
  const balanceMinor = quotedMinor - totalPaidMinor;

  const customer = project.quote?.customer;
  const address =
    (customer?.addressJson as any)?.address ||
    (customer?.addressJson as any)?.city ||
    customer?.city ||
    '';
  const phone = customer?.phone || '';
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-GB');

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-8 pt-6 pb-4 border-b border-gray-300 bg-white">
          <PrintHeader showOnScreen />
        </div>

        <div className="px-8 py-6 text-sm leading-6">
          <div className="grid grid-cols-[120px_1fr] gap-y-1 text-gray-900">
            <span className="font-bold">CLIENT</span>
            <span>{customer?.displayName || project.name}</span>

            <span className="font-bold">ADDRESS</span>
            <span>{address}</span>

            <span className="font-bold">PHONE</span>
            <span>{phone}</span>

            <span className="font-bold">DATE</span>
            <span className="font-bold">{formattedDate}</span>
          </div>

          <div className="mt-6">
            <p className="font-extrabold text-sm text-gray-900 uppercase underline">
              PAYMENT HISTORY
            </p>
          </div>

          <div className="mt-6 flex items-baseline justify-between text-sm">
            <span className="font-bold uppercase">
              QUOTATION AMOUNT
            </span>
            <span className="font-bold tabular-nums">
              <Money minor={quotedMinor} />
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between text-sm">
            <span className="font-bold uppercase">
              PROJECT TOTAL AMOUNT
            </span>
            <span className="font-bold tabular-nums">
              <Money minor={quotedMinor} />
            </span>
          </div>

          <div className="mt-6 font-bold uppercase text-sm text-gray-900">
            PAYMENTS
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full border border-black border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1 text-left font-bold">Date</th>
                  <th className="border border-black px-2 py-1 text-left font-bold">Description</th>
                  <th className="border border-black px-2 py-1 text-left font-bold">Invoice No</th>
                  <th className="border border-black px-2 py-1 text-left font-bold">Received by</th>
                  <th className="border border-black px-2 py-1 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {allPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="border border-black px-2 py-1">
                      {new Date(p.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="border border-black px-2 py-1">
                      {p.description}
                    </td>
                    <td className="border border-black px-2 py-1">
                      {p.invoiceNo}
                    </td>
                    <td className="border border-black px-2 py-1">
                      {p.receivedBy}
                    </td>
                    <td className="border border-black px-2 py-1 text-right">
                      <Money minor={BigInt(p.amountMinor)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] items-center text-sm">
            <span className="font-bold uppercase underline">
              TOTAL PAID
            </span>
            <span className="font-bold tabular-nums">
              <Money minor={totalPaidMinor} />
            </span>
          </div>

          <div className="mt-2 grid grid-cols-[1fr_auto] items-center text-sm">
            <span className="font-bold uppercase underline">
              TOTAL BALANCE FOR ACCOUNT
            </span>
            <span className="font-bold tabular-nums">
              <Money minor={balanceMinor} />
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <PrintButton className="mr-3" />
        <Link
          href="/reports/payment-history"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Back to list
        </Link>
      </div>
    </div>
  );
}
