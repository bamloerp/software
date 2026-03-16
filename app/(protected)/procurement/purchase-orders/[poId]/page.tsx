import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { placeOrder, receiveGoods } from '../actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SubmitButton from '@/components/SubmitButton';
import Link from 'next/link';
import Money from '@/components/Money';
import { ArrowLeftIcon, PaperAirplaneIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
import PurchaseOrderHeader from '@/components/PurchaseOrderHeader';
import PrintButton from '@/components/PrintButton';
import DownloadPdfButton from '@/components/DownloadPdfButton';
import { generatePurchaseOrderPdf } from './pdf-actions';
import PurchaseOrderApproval from './PurchaseOrderApproval';
import VerifyGrnForm from '../VerifyGrnForm';
import VerifyPoGrnsForm from '../VerifyPoGrnsForm';
import VerifiedGrnsList from '../VerifiedGrnsList';
import CollapsibleOrderItems from '../CollapsibleOrderItems';

function POStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-red-100 text-red-800',
    PURCHASED: 'bg-purple-100 text-purple-800',
    PARTIAL: 'bg-orange-100 text-orange-800',
    RECEIVED: 'bg-green-100 text-green-800',
    COMPLETE: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default async function POPage(props: { params: Promise<{ poId: string }> }) {
  const params = await props.params;
  const { poId } = params;
  const me = await getCurrentUser();
  if (!me) return <div className="p-6">Auth required.</div>;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { 
      items: { include: { quoteLine: { include: { product: true } } } }, 
      requisition: { 
        include: { 
          project: { 
            include: { 
              quote: { 
                include: { customer: true } 
              } 
            } 
          } 
        } 
      },
      project: {
        include: {
          quote: {
            include: { customer: true }
          }
        }
      },
      goodsReceivedNotes: { 
        include: { 
            items: true,
            receivedBy: { select: { name: true, email: true } }
        }, 
        orderBy: { createdAt: 'desc' } 
      },
      purchases: true, 
      createdBy: { select: { id: true, name: true, email: true } },
      decidedBy: { select: { name: true, email: true } },
    },
  });
  if (!po) return <div className="p-6">PO not found.</div>;

  const isProcurement = me.role === 'PROCUREMENT' || me.role === 'SENIOR_PROCUREMENT' || me.role === 'ADMIN';
  const isAccounts = me.role === 'SALES_ACCOUNTS' || (me.role as string).startsWith('ACCOUNT') || me.role === 'ADMIN' || me.role === 'ACCOUNTS';
  const isSecurity = me.role === 'SECURITY' || me.role === 'ADMIN';
  const isSecurityUser = me.role === 'SECURITY';

  const receivedByItem = new Map<string, number>();
  po.goodsReceivedNotes.forEach((grn) => {
    grn.items.forEach((grnItem) => {
      if (grnItem.poItemId) {
        const current = receivedByItem.get(grnItem.poItemId) ?? 0;
        const used = grn.status === 'PENDING' ? grnItem.qtyDelivered : grnItem.qtyAccepted;
        receivedByItem.set(grnItem.poItemId, current + used);
      }
    });
  });

  const isPOFullyReceived = po.items.every((item) => {
    const used = receivedByItem.get(item.id) ?? 0;
    return used >= item.qty;
  });

  const project = po.requisition?.project || po.project;
  const customer = project?.quote?.customer;
  const displayCustomer = customer || { displayName: 'Unknown Customer', city: '', email: '', phone: '' };

  const vendorName = po.vendor || 'Unknown Vendor';
  const vendorPhone = po.purchases?.[0]?.vendorPhone || '';
  const vendorDisplay = {
    displayName: vendorName,
    phone: vendorPhone,
    email: '', 
    city: '',
    addressJson: null
  };

  const creatorName = po.createdBy?.name || po.createdBy?.email || 'Unknown';

  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-[90rem] space-y-6 print:max-w-none">
        
        {/* Navigation and Toolbar */}
        {!isSecurityUser && (
        <div className="flex items-center justify-between print:hidden">
            <Link
              href="/procurement/purchase-orders"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to POs
            </Link>
            <div className="flex items-center gap-3">
               <POStatusBadge status={po.status} />
               <DownloadPdfButton quoteId={poId} generatePdf={generatePurchaseOrderPdf} />
               <PrintButton />
            </div>
        </div>
        )}

        {/* Main PO Document */}
        <div className="bg-white p-8 shadow-sm rounded-xl border border-gray-200 print:shadow-none print:border-none print:p-0">
            <PurchaseOrderHeader 
              customer={vendorDisplay}
              project={project}
              requisition={{
                id: po.id,
                createdAt: po.createdAt,
                submittedBy: po.createdBy || { name: 'Unknown', email: '' }
              }}
              title={isSecurityUser ? "Goods Delivery Note" : "Goods Received Note"}
              recipientLabel="Vendor"
              recipientIdLabel="Vendor Ref"
              recipientId={po.supplierId || po.vendor}
            />

            {!isSecurityUser && po.goodsReceivedNotes.length > 0 && (
              <div className="mt-8 space-y-12">
                
                {isAccounts && po.goodsReceivedNotes.some(g => g.status === 'PENDING') && (
                  <div className="mb-8">
                     <VerifyPoGrnsForm 
                        poId={po.id}
                        verifierId={me.id!}
                        items={po.goodsReceivedNotes
                            .filter(g => g.status === 'PENDING')
                            .flatMap(grn => grn.items.map(item => ({
                                grnId: grn.id,
                                grnItemId: item.id,
                                description: item.description,
                                qtyDelivered: item.qtyDelivered,
                                priceMinor: Number(item.priceMinor || 0),
                                varianceMinor: Number(item.varianceMinor || 0),
                                receiptNumber: grn.receiptNumber || 'N/A',
                                vendorName: grn.vendorName || vendorName,
                                receivedAt: grn.receivedAt.toISOString()
                            })))}
                     />
                  </div>
                )}

                {/* Verified GRNs List */}
                {po.goodsReceivedNotes.some(g => g.status === 'VERIFIED') && (
                  <VerifiedGrnsList 
                    items={po.goodsReceivedNotes
                      .filter(g => g.status === 'VERIFIED')
                      .flatMap(grn => grn.items.map(item => ({
                        grnId: grn.id,
                        grnItemId: item.id,
                        description: item.description,
                        qtyDelivered: item.qtyDelivered,
                        qtyAccepted: item.qtyAccepted,
                        qtyRejected: item.qtyRejected,
                        priceMinor: Number(item.priceMinor || 0),
                        varianceMinor: Number(item.varianceMinor || 0),
                        receiptNumber: grn.receiptNumber || 'N/A',
                        vendorName: grn.vendorName || vendorName,
                        receivedAt: grn.receivedAt.toISOString(),
                        receivedBy: (grn as any).receivedBy?.name || 'Unknown'
                      })))
                    }
                  />
                )}

                {po.goodsReceivedNotes.map((grn, idx) => {
                  if (grn.status === 'VERIFIED') return null;

                  const isPendingVerification = grn.status === 'PENDING';
                  
                  // If accounts user, pending GRNs are shown in the consolidated form above
                  if (isAccounts && isPendingVerification) return null;

                  const showVerifyForm = false;

                  return (
                    <div key={grn.id} className={`p-6 rounded-xl border ${isPendingVerification ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200 bg-white shadow-sm'}`}>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-bold text-gray-900">Receipt #{grn.receiptNumber || 'N/A'}</h3>
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              grn.status === 'VERIFIED' 
                                ? 'bg-green-50 text-green-700 ring-green-600/20' 
                                : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                            }`}>
                              {grn.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">
                            Received by <span className="font-medium text-gray-700">{creatorName}</span> on {formatDateTime(grn.receivedAt)}
                          </p>
                        </div>
                        <div className="text-sm text-gray-600 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                          <span className="font-semibold">{grn.vendorName || vendorName}</span>
                          <span className="mx-2 text-gray-300">|</span>
                          <span>{grn.vendorPhone || vendorPhone || 'No Phone'}</span>
                        </div>
                      </div>

                      {showVerifyForm ? (
                        <VerifyGrnForm 
                          grnId={grn.id}
                          receivedBy={creatorName}
                          receivedAt={grn.receivedAt?.toISOString() || new Date().toISOString()}
                          vendorName={grn.vendorName || vendorName}
                          vendorPhone={grn.vendorPhone || vendorPhone || 'N/A'}
                          receiptNumber={grn.receiptNumber || 'N/A'}
                          verifierId={me.id!}
                          items={grn.items.map(gi => ({
                            id: gi.id,
                            description: gi.description || 'Item',
                            qtyDelivered: gi.qtyDelivered,
                            priceMinor: Number(gi.priceMinor || 0n),
                            varianceMinor: Number(gi.varianceMinor || 0n)
                          }))}
                        />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                              <tr className="bg-gray-50/50">
                                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Delivered</th>
                                {grn.status === 'VERIFIED' && (
                                  <>
                                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Accepted</th>
                                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rejected</th>
                                  </>
                                )}
                                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                {grn.status === 'VERIFIED' && <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider text-emerald-600">Variance</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 italic">
                              {grn.items.map((gi) => {
                                const unitPriceMinor = gi.priceMinor ?? 0n;
                                const qty = grn.status === 'VERIFIED' ? gi.qtyAccepted : gi.qtyDelivered;
                                const amountMinor = BigInt(Math.round(Number(unitPriceMinor) * qty));
                                return (
                                  <tr key={gi.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{gi.description}</td>
                                    <td className="px-4 py-3 text-right text-sm text-gray-500">{gi.qtyDelivered}</td>
                                    {grn.status === 'VERIFIED' && (
                                      <>
                                        <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600">{gi.qtyAccepted}</td>
                                        <td className="px-4 py-3 text-right text-sm font-semibold text-rose-600">{gi.qtyRejected}</td>
                                      </>
                                    )}
                                    <td className="px-4 py-3 text-right text-sm text-gray-500"><Money minor={unitPriceMinor} /></td>
                                    <td className="px-4 py-3 text-right text-sm text-gray-900 font-semibold"><Money minor={amountMinor} /></td>
                                    {grn.status === 'VERIFIED' && (
                                      <td className={`px-4 py-3 text-right text-sm font-bold ${Number(gi.varianceMinor || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {Number(gi.varianceMinor || 0) > 0 ? '+' : ''}<Money minor={gi.varianceMinor || 0n} />
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50/30">
                              <tr>
                                <th scope="row" colSpan={grn.status === 'VERIFIED' ? 5 : 3} className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                                  Total
                                </th>
                                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                                  <Money minor={grn.items.reduce((sum, gi) => {
                                    const qty = grn.status === 'VERIFIED' ? gi.qtyAccepted : gi.qtyDelivered;
                                    return sum + BigInt(Math.round(Number(gi.priceMinor ?? 0n) * qty));
                                  }, 0n)} />
                                </td>
                                {grn.status === 'VERIFIED' && (
                                  <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700 bg-emerald-50/50">
                                    <Money minor={grn.items.reduce((sum, gi) => sum + (gi.varianceMinor || 0n), 0n)} />
                                  </td>
                                )}
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      {grn.note && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Security Note:</h4>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{grn.note}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!isSecurityUser && (
              <CollapsibleOrderItems 
                items={po.items}
                totalMinor={po.totalMinor > 0n ? po.totalMinor : po.requestedMinor}
              />
            )}

            {!isSecurityUser && po.note && (
                <div className="mt-8 border-t pt-4">
                    <h3 className="text-sm font-semibold text-gray-900">Notes:</h3>
                    <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{po.note}</p>
                </div>
            )}
        </div>

        {/* Action Cards (Hidden in Print) */}
        <div className="space-y-6 print:hidden">
            {isAccounts && po.status === 'SUBMITTED' && (
              <PurchaseOrderApproval 
                poId={poId} 
                userId={me.id!} 
                items={po.items.map(i => ({
                  id: i.id,
                  description: i.description,
                  qty: i.qty,
                  unit: i.unit,
                  unitPriceMinor: i.unitPriceMinor,
                  totalMinor: i.totalMinor
                }))} 
              />
            )}
            {isProcurement && po.status === 'APPROVED' && (
              <Card className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <CardHeader className="border-b border-gray-200 bg-gray-50/60 px-6 py-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-800">
                    Place Order
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-500">
                    Mark this PO as purchased after placing the order with the vendor.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 py-4">
                  <form
                    action={async () => {
                      'use server';
                      await placeOrder(poId, me.id!);
                      revalidatePath(`/procurement/purchase-orders/${poId}`);
                    }}
                  >
                    {/* Submit Button */}
                    <div className="flex justify-end pt-6 border-t border-gray-100">
                        <SubmitButton className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2">
                            <PaperAirplaneIcon className="h-5 w-5" />
                            Submit Order
                        </SubmitButton>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {isSecurity && !isPOFullyReceived && (
              <Card className="rounded-2xl border border-emerald-200 bg-white shadow-md">
                <CardHeader className="flex flex-col gap-1 border-b border-emerald-100/60 bg-emerald-50/60 px-6 py-4">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-800">
                    <span>Receive Goods</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 py-6">
                  <form
                    action={async (fd) => {
                      'use server';

                      const rawItems = po.items
                        .map((item) => {
                          const qty = Number(fd.get(`delivered-${item.id}`) || 0);
                          return {
                            poItemId: item.id,
                            qtyDelivered: qty,
                            vendorName: String(fd.get(`vendor-${item.id}`) || '').trim(),
                            receiptNumber: String(fd.get(`receipt-${item.id}`) || '').trim(),
                            vendorPhone: String(fd.get(`phone-${item.id}`) || '').trim(),
                            unitPriceMajor: Number(fd.get(`price-${item.id}`) || 0),
                          };
                        })
                        .filter((i) => i.qtyDelivered > 0);

                      if (rawItems.length === 0) throw new Error('Enter at least one delivery quantity');

                      for (const item of rawItems) {
                        if (!item.vendorName) throw new Error('Vendor Name is required for all delivered items');
                        if (!item.receiptNumber) throw new Error('Receipt Number is required for all delivered items');
                      }

                      const details = {
                        receivedAt: String(fd.get('receivedAt') || new Date().toISOString()),
                        note: String(fd.get('note') || ''),
                      };
                      
                      await receiveGoods(poId, rawItems, me.id!, details);
                      revalidatePath(`/procurement/purchase-orders/${poId}`);
                      redirect('/dashboard');
                    }}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                        <label htmlFor="receivedAt" className="block text-base font-semibold text-gray-700 mb-1">Received Date</label>
                        <input type="datetime-local" name="receivedAt" id="receivedAt" defaultValue={new Date().toISOString().slice(0, 16)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-3 px-4" />
                        </div>
                        <div>
                        <label htmlFor="note" className="block text-base font-semibold text-gray-700 mb-1">Note</label>
                        <input type="text" name="note" id="note" className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-3 px-4" />
                        </div>
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                        <h3 className="text-sm font-medium text-gray-900 mb-4">Items to Receive</h3>
                        
                        {isSecurityUser ? (
                          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-300">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Item</th>
                                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Supplier</th>
                                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Contact</th>
                                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Quantity</th>
                                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Price</th>
                                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Receipt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 bg-white">
                                {po.items.map((item) => {
                                  const purchase = po.purchases.find(p => p.requisitionItemId === item.requisitionItemId);
                                  const unitPrice = purchase && purchase.qty > 0 ? (Number(purchase.priceMinor) / 100) / purchase.qty : (Number(item.unitPriceMinor) / 100);
                                  
                                  return (
                                    <tr key={item.id}>
                                      <td className="py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                        {item.description}
                                        <div className="mt-1 text-xs text-gray-500">Ordered: {item.qty} {item.unit}</div>
                                      </td>
                                      <td className="px-3 py-4 text-sm text-gray-500 align-top space-y-3">
                                        <input 
                                          type="text" 
                                          name={`vendor-${item.id}`} 
                                          className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2.5 px-3" 
                                          placeholder="Vendor Name *" 
                                          defaultValue={purchase?.vendor || po.vendor || ''}
                                          required 
                                        />
                                      </td>
                                      <td className="px-3 py-4 text-sm text-gray-500 align-top space-y-3">
                                        <input 
                                          type="text" 
                                          name={`phone-${item.id}`} 
                                          className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2.5 px-3" 
                                          placeholder="Phone" 
                                          defaultValue={purchase?.vendorPhone || ''}
                                        />
                                      </td>
                                      <td className="px-3 py-4 text-sm text-gray-500 align-top">
                                        <input 
                                          type="number" 
                                          step="any" 
                                          name={`delivered-${item.id}`} 
                                          className="block w-32 rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2.5 px-3" 
                                          placeholder="0" 
                                          defaultValue={item.qty}
                                        />
                                      </td>
                                      <td className="px-3 py-4 text-sm text-gray-500 align-top">
                                        <div className="relative rounded-lg shadow-sm">
                                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                            <span className="text-gray-500 sm:text-base">$</span>
                                          </div>
                                          <input 
                                            type="number" 
                                            step="0.01" 
                                            name={`price-${item.id}`} 
                                            className="block w-full rounded-lg border-gray-300 pl-8 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2.5 px-3" 
                                            placeholder="Price" 
                                            defaultValue={unitPrice.toFixed(2)}
                                          />
                                        </div>
                                      </td>
                                      <td className="px-3 py-4 text-sm text-gray-500 align-top space-y-3">
                                        <input 
                                          type="text" 
                                          name={`receipt-${item.id}`} 
                                          className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2.5 px-3" 
                                          placeholder="Receipt # *" 
                                          required 
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                        <div className="space-y-6">
                        {po.items.map((item) => {
                             const purchase = po.purchases.find(p => p.requisitionItemId === item.requisitionItemId);
                             const unitPrice = purchase && purchase.qty > 0 ? (Number(purchase.priceMinor) / 100) / purchase.qty : (Number(item.unitPriceMinor) / 100);

                             return (
                            <div key={item.id} className="grid grid-cols-1 gap-4 sm:grid-cols-6 bg-gray-50 p-4 rounded-lg">
                            <div className="sm:col-span-6 font-medium text-sm text-gray-900">{item.description} (Ordered: {item.qty} {item.unit})</div>
                            
                            <div className="sm:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Qty Delivered</label>
                                <input type="number" step="any" name={`delivered-${item.id}`} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2 px-3" placeholder="0" defaultValue={item.qty} />
                            </div>
                            
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                                <input type="text" name={`vendor-${item.id}`} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2 px-3" defaultValue={purchase?.vendor || po.vendor || ''} required />
                            </div>

                            <div className="sm:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Receipt #</label>
                                <input type="text" name={`receipt-${item.id}`} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2 px-3" required />
                            </div>

                            <div className="sm:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Phone</label>
                                <input type="text" name={`phone-${item.id}`} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2 px-3" defaultValue={purchase?.vendorPhone || ''} />
                            </div>

                            <div className="sm:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
                                <input type="number" step="0.01" name={`price-${item.id}`} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 text-base py-2 px-3" defaultValue={unitPrice.toFixed(2)} />
                            </div>
                            </div>
                             );
                        })}
                        </div>
                        )}
                    </div>

                    <div className="pt-4">
                        <SubmitButton className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                        Goods Received
                        </SubmitButton>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
        </div>
      </div>
    </div>
  );
}
