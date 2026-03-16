// lib/pdf/reactPdf.tsx
import React from 'react';
import fs from 'fs';
import path from 'path';
import { pdf } from '@react-pdf/renderer';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { prisma } from '@/lib/db';
import QuoteDoc from './QuoteDoc';
import { BARMLO_LOGO_BASE64 } from './logo';
import type { PdfRenderer, PdfRequest, PdfResult } from './index';

/** Coerce any DB scalar to a plain number (no BigInt leaks into React-PDF). */
function asNumber(x: unknown, fallback = 0): number {
  if (x == null) return fallback;
  if (typeof x === 'number') return Number.isFinite(x) ? x : fallback;
  if (typeof x === 'bigint') return Number(x);
  if (typeof x === 'string') {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Safe, flat line DTO for PDF (numbers only). */
function toPdfLine(l: any) {
  return {
    id: String(l.id),
    description: String(l.description ?? ''),
    unit: String(l.unit ?? ''),
    quantity: asNumber(l.quantity, 0),
    unitPriceMinor: asNumber(l.unitPriceMinor, 0),
    lineSubtotalMinor: asNumber(l.lineSubtotalMinor, 0),
    lineDiscountMinor: asNumber(l.lineDiscountMinor, 0),
    lineTaxMinor: asNumber(l.lineTaxMinor, 0),
    lineTotalMinor: asNumber(l.lineTotalMinor, 0),
    // stringify meta to avoid objects inside <Text>
    meta: l.metaJson ? String(l.metaJson) : '',
    section: String(l.section || 'Items'),
    itemType: String(l.itemType || 'MATERIAL'),
  };
}

/** Safe, flat quote DTO for PDF (no Prisma proxies / BigInt). */
function toPdfQuote(q: any) {
  return {
    id: String(q.id),
    number: q.number ? String(q.number) : null,
    currency: String(q.currency ?? 'USD'),
    vatBps: asNumber(q.vatBps, 0),
    status: String(q.status ?? ''),
    pgRate: asNumber(q.pgRate, 0),
    contingencyRate: asNumber(q.contingencyRate, 0),
    assumptions: q.assumptions ? String(q.assumptions) : '[]',
    exclusions: q.exclusions ? String(q.exclusions) : '[]',
    customer: q.customer
      ? { displayName: q.customer.displayName ? String(q.customer.displayName) : '' }
      : null,
    metaJson: q.metaJson ? String(q.metaJson) : '',
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : String(q.createdAt ?? ''),
    updatedAt: q.updatedAt instanceof Date ? q.updatedAt.toISOString() : String(q.updatedAt ?? ''),
  };
}

export async function renderReactPdf(quoteId: string): Promise<PdfResult> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { customer: true },
  });
  if (!quote) throw new Error('Quote not found');

  const linesRaw = await prisma.quoteLine.findMany({
    where: { quoteId: quote.id },
    orderBy: { createdAt: 'asc' },
  });

  const lines = linesRaw.map(toPdfLine);
  const q = toPdfQuote(quote);

  let logoData: string = BARMLO_LOGO_BASE64;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'barmlo_logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (e) {
    console.error('Failed to read logo for PDF', e);
  }

  // Valid React-PDF element
  const element = <QuoteDoc quote={q} lines={lines} logoData={logoData} />;

  // DEBUG: check symbol compatibility
  console.log('[QuotePDF] element.$$typeof:', String(element.$$typeof));
  console.log('[QuotePDF] Symbol.for react.element:', String(Symbol.for('react.element')));
  console.log('[QuotePDF] match:', element.$$typeof === Symbol.for('react.element'));
  console.log('[QuotePDF] element keys:', Object.keys(element));

  // Return Buffer as required by PdfResult
  const instance = pdf(element);
  const buffer = await instance.toBuffer();
  const filename = `${q.number || q.id}.pdf`;

  return { buffer, filename };
}

// Class export so getPdfRenderer() can `new ReactPdfRenderer()`
export class ReactPdfRenderer implements PdfRenderer {
  async render(req: PdfRequest): Promise<PdfResult> {
    return renderReactPdf(req.quoteId);
  }
}

/* ── Requisition PDF ── */
import RequisitionDoc from './RequisitionDoc';
import type { PdfRequisition, PdfRequisitionItem } from './RequisitionDoc';

export async function renderRequisitionPdf(requisitionId: string): Promise<PdfResult> {
  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    include: {
      items: { include: { quoteLine: { select: { metaJson: true } } } },
      project: {
        include: {
          quote: { include: { customer: true, project: true } },
        },
      },
      submittedBy: { select: { name: true } },
    },
  });
  if (!req) throw new Error('Requisition not found');

  const quote = req.project.quote;
  const customer = quote.customer;
  const project = quote.project;

  const validUntil = new Date(quote.createdAt);
  validUntil.setDate(validUntil.getDate() + 30);

  const getItemSection = (item: (typeof req.items)[number]) => {
    const rawMeta = item.quoteLine?.metaJson;
    if (typeof rawMeta === 'string' && rawMeta.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawMeta) as { section?: string; category?: string };
        const fromMeta =
          (typeof parsed?.section === 'string' && parsed.section.trim().length > 0
            ? parsed.section
            : typeof parsed?.category === 'string' && parsed.category.trim().length > 0
              ? parsed.category
              : null) ?? null;
        if (fromMeta) return fromMeta.trim();
      } catch {
        /* ignore */
      }
    }
    return 'Uncategorized';
  };

  const pdfRequisition: PdfRequisition = {
    id: req.id,
    refNumber: project?.name ? `${project.name}` : req.id.slice(0, 10),
    status: req.status,
    createdAt: new Date(quote.createdAt).toLocaleDateString('en-GB'),
    submittedByName: req.submittedBy?.name ?? null,
    customerName: customer.displayName ?? 'Customer',
    customerAddress:
      customer.city ||
      (customer.addressJson as any)?.city ||
      (customer.addressJson as any)?.address ||
      'N/A',
    customerPhone: customer.phone || customer.email || 'N/A',
    projectName: project?.name ?? 'N/A',
    quoteNumber: quote.number || quote.id.slice(0, 8),
    customerId: customer.id.slice(0, 10),
    validUntil: validUntil.toLocaleDateString('en-GB'),
  };

  const pdfItems: PdfRequisitionItem[] = req.items.map((it) => ({
    id: it.id,
    description: it.description ?? '',
    unit: it.unit ?? '-',
    quantity: Number(it.qtyRequested ?? 0),
    section: getItemSection(it),
  }));

  let logoData: string = BARMLO_LOGO_BASE64;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'barmlo_logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (e) {
    console.error('Failed to read logo for PDF', e);
  }

  // ── DEBUG: minimal doc to test pipeline ──
  console.log('[ReqPDF] start – items:', pdfItems.length);
  let buffer: Buffer;
  try {
    const element = (
      <RequisitionDoc requisition={pdfRequisition} items={pdfItems} logoData={logoData} />
    );
    const instance = pdf(element);
    buffer = await instance.toBuffer();
    console.log('[ReqPDF] success, bytes:', buffer.length);
  } catch (err: any) {
    console.error('[ReqPDF] RENDER FAILED:', err?.message ?? err);
    // Fallback: try a tiny inline doc so we know the pipeline works
    console.log('[ReqPDF] Trying minimal fallback doc …');
    const fallback = (
      <Document>
        <Page size="A4" style={{ padding: 40 }}>
          <View>
            <Text style={{ fontSize: 14 }}>Requisition PDF – render error</Text>
          </View>
          <View>
            <Text style={{ fontSize: 10 }}>
              {String(err?.message ?? 'unknown error')}
            </Text>
          </View>
        </Page>
      </Document>
    );
    const inst2 = pdf(fallback);
    buffer = await inst2.toBuffer();
    console.log('[ReqPDF] fallback ok, bytes:', buffer.length);
  }
  const filename = `Requisition-${pdfRequisition.refNumber}.pdf`;

  return { buffer, filename };
}

/* ── Dispatch PDF ── */
import DispatchDoc from './DispatchDoc';
import type { PdfDispatch, PdfDispatchItem } from './DispatchDoc';

export async function renderDispatchPdf(dispatchId: string): Promise<PdfResult> {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: {
      items: { orderBy: { id: 'asc' } },
      project: {
        include: {
          quote: { include: { customer: true, project: true } },
        },
      },
      createdBy: { select: { name: true } },
    },
  });
  if (!dispatch) throw new Error('Dispatch not found');

  const project = dispatch.project;
  const quote = project?.quote;
  const customer = quote?.customer;

  const pdfDispatch: PdfDispatch = {
    id: dispatch.id,
    status: dispatch.status,
    createdAt: new Date(dispatch.createdAt).toLocaleDateString('en-GB'),
    createdByName: dispatch.createdBy?.name ?? 'Unknown',
    projectName: project?.name ?? quote?.project?.name ?? 'N/A',
    customerName: customer?.displayName ?? 'N/A',
    customerAddress: customer?.city || (customer?.addressJson as any)?.city || 'N/A',
    customerPhone: customer?.phone || customer?.email || 'N/A',
    quoteNumber: quote?.number || quote?.id?.slice(0, 8) || 'N/A',
    note: dispatch.note ?? '',
  };

  const pdfItems: PdfDispatchItem[] = dispatch.items.map((it) => ({
    id: it.id,
    description: it.description ?? '',
    unit: it.unit ?? '-',
    qty: Number(it.qty ?? 0),
    handedOut: !!it.handedOutAt,
  }));

  let logoData: string = BARMLO_LOGO_BASE64;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'barmlo_logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (e) {
    console.error('Failed to read logo for PDF', e);
  }

  const element = <DispatchDoc dispatch={pdfDispatch} items={pdfItems} logoData={logoData} />;
  const instance = pdf(element);
  const buffer = await instance.toBuffer();
  const filename = `Dispatch-${dispatch.id.slice(0, 10)}.pdf`;

  return { buffer, filename };
}

/* ── Purchase Order PDF ── */
import PurchaseOrderDoc from './PurchaseOrderDoc';
import type { PdfPurchaseOrder, PdfPOItem } from './PurchaseOrderDoc';

export async function renderPurchaseOrderPdf(poId: string): Promise<PdfResult> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      items: { include: { quoteLine: true } },
      requisition: {
        include: {
          project: { include: { quote: { include: { customer: true } } } },
        },
      },
      project: { include: { quote: { include: { customer: true } } } },
      purchases: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!po) throw new Error('Purchase order not found');

  const project = po.requisition?.project || po.project;
  const customer = project?.quote?.customer;
  const vendorName = po.vendor || 'Unknown Vendor';
  const vendorPhone = po.purchases?.[0]?.vendorPhone || '';

  const totalMinor = po.items.reduce(
    (acc, it) => acc + Number(it.unitPriceMinor ?? 0) * Number(it.qty ?? 0),
    0,
  );

  const pdfPO: PdfPurchaseOrder = {
    id: po.id,
    status: po.status,
    createdAt: new Date(po.createdAt).toLocaleDateString('en-GB'),
    createdByName: po.createdBy?.name ?? 'Unknown',
    vendorName,
    vendorPhone: vendorPhone || 'N/A',
    projectName: project?.name ?? 'N/A',
    customerName: customer?.displayName ?? 'N/A',
    quoteNumber: project?.quote?.number || project?.quote?.id?.slice(0, 8) || 'N/A',
    totalMinor,
    note: po.note ?? '',
  };

  const pdfItems: PdfPOItem[] = po.items.map((it) => ({
    id: it.id,
    description: it.description ?? '',
    unit: it.unit ?? '-',
    qty: Number(it.qty ?? 0),
    unitPriceMinor: Number(it.unitPriceMinor ?? 0),
    totalMinor: Number(it.unitPriceMinor ?? 0) * Number(it.qty ?? 0),
  }));

  let logoData: string = BARMLO_LOGO_BASE64;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'barmlo_logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (e) {
    console.error('Failed to read logo for PDF', e);
  }

  const element = <PurchaseOrderDoc po={pdfPO} items={pdfItems} logoData={logoData} />;
  const instance = pdf(element);
  const buffer = await instance.toBuffer();
  const filename = `PurchaseOrder-${po.id.slice(0, 10)}.pdf`;

  return { buffer, filename };
}
