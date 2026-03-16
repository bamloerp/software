import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renderRequisitionPdf, renderDispatchPdf, renderPurchaseOrderPdf } from '@/lib/pdf/puppeteer';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'requisition';

  try {
    if (type === 'requisition') {
      const req = await prisma.procurementRequisition.findFirst({ select: { id: true }, orderBy: { createdAt: 'desc' } });
      if (!req) return NextResponse.json({ error: 'No requisitions found' });
      const result = await renderRequisitionPdf(req.id);
      return new NextResponse(result.buffer, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${result.filename}"` },
      });
    } else if (type === 'dispatch') {
      const d = await prisma.dispatch.findFirst({ select: { id: true }, orderBy: { createdAt: 'desc' } });
      if (!d) return NextResponse.json({ error: 'No dispatches found' });
      const result = await renderDispatchPdf(d.id);
      return new NextResponse(result.buffer, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${result.filename}"` },
      });
    } else if (type === 'po') {
      const po = await prisma.purchaseOrder.findFirst({ select: { id: true }, orderBy: { createdAt: 'desc' } });
      if (!po) return NextResponse.json({ error: 'No POs found' });
      const result = await renderPurchaseOrderPdf(po.id);
      return new NextResponse(result.buffer, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${result.filename}"` },
      });
    }
    return NextResponse.json({ error: 'Invalid type. Use: requisition, dispatch, po' });
  } catch (err: any) {
    console.error('[TEST-PDF] Error:', err?.message);
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 });
  }
}
