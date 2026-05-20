import chromium from "@sparticuz/chromium";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import type { PdfRenderer, PdfRequest, PdfResult } from "./index";
import { BARMLO_LOGO_BASE64 } from "./logo";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";
import {
  compareConstructionSummaryCategories,
  getConstructionSummaryCategory,
  type ConstructionSummaryCategory,
} from "@/lib/constructionSummary";

function money(minor: number, cur = "USD") {
  return `${cur === "USD" ? "US$" : ""}${(Number(minor || 0) / 100).toFixed(2)}`;
}

function getLocalBrowserPath(): string | undefined {
  const commonPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.CHROME_EXECUTABLE_PATH,
  ];

  if (process.env.LOCALAPPDATA) {
    commonPaths.push(`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`);
    commonPaths.push(`${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`);
  }

  for (const p of commonPaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

export class PuppeteerRenderer implements PdfRenderer {
  async render(req: PdfRequest): Promise<PdfResult> {
    const quote = await prisma.quote.findUnique({
      where: { id: req.quoteId },
      include: { customer: true, project: true, lines: { orderBy: { id: "asc" } } },
    });
    if (!quote) throw new Error("Quote not found");

    // Logic for notes
    const assumptions = quote.assumptions ? JSON.parse(quote.assumptions as string) : [];
    const exclusions = quote.exclusions ? JSON.parse(quote.exclusions as string) : [];

    const currency = quote.currency ?? "USD";

    // Read logo
    const logoPath = path.join(process.cwd(), "public", "Barmlo Logo 2026.png");
    let logoBase64 = BARMLO_LOGO_BASE64;
    if (fs.existsSync(logoPath)) {
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
      } catch (e) {
        console.error("Failed to read logo file, using fallback", e);
      }
    }

    // Ensure logoBase64 is passed correctly to the HTML template

    // Group lines
    type LineGroup = { section: string; rows: any[]; subtotal: number };
    const groups: Record<string, LineGroup> = {};
    const groupOrder: string[] = [];

    // Materials total is shown before the labour section.
    let totalMaterials = 0;

    for (const line of quote.lines) {
      let meta: any = {};
      try {
        meta = JSON.parse(line.metaJson ?? "{}");
      } catch { }

      const section = meta.section?.trim() || "Items";
      if (!groups[section]) {
        groups[section] = { section, rows: [], subtotal: 0 };
        groupOrder.push(section);
      }

      const qty = Number(line.quantity || 0);
      const amt = Number(line.lineTotalMinor || 0);
      const labourNote = typeof meta.labourNote === 'string' ? meta.labourNote : null;
      groups[section].rows.push({ ...line, qty, amt, unit: meta.unit || line.unit, labourNote });
      groups[section].subtotal += amt;

      const itemType = line.itemType || 'MATERIAL';
      if (itemType !== 'LABOUR') {
        totalMaterials += amt;
      }

    }

    // Split each original group into material-only and labour-only groups
    type PdfGroup = { section: string; label: string; isLabour: boolean; rows: any[]; subtotal: number; summaryCategory: ConstructionSummaryCategory };
    const matGroups: Map<string, PdfGroup> = new Map();
    const labGroups: Map<string, PdfGroup> = new Map();

    for (const section of groupOrder) {
      const g = groups[section];
      for (const row of g.rows) {
        const itemType = (row as any).itemType || 'MATERIAL';
        const summaryCategory = getConstructionSummaryCategory({
          section,
          description: row.description,
          itemType,
        });
        const groupKey = `${section}:${summaryCategory.key}`;
        if (itemType === 'LABOUR') {
          if (!labGroups.has(groupKey)) labGroups.set(groupKey, { section, label: `LABOUR - ${summaryCategory.detailLabel}`, isLabour: true, rows: [], subtotal: 0, summaryCategory });
          const lg = labGroups.get(groupKey)!;
          lg.rows.push(row);
          lg.subtotal += (row as any).amt;
        } else {
          if (!matGroups.has(groupKey)) matGroups.set(groupKey, { section, label: summaryCategory.detailLabel, isLabour: false, rows: [], subtotal: 0, summaryCategory });
          const mg = matGroups.get(groupKey)!;
          mg.rows.push(row);
          mg.subtotal += (row as any).amt;
        }
      }
    }

    const sortByOrder = (a: PdfGroup, b: PdfGroup) => {
      const categoryOrder = compareConstructionSummaryCategories(a.summaryCategory, b.summaryCategory);
      if (categoryOrder !== 0) return categoryOrder;
      return a.label.localeCompare(b.label);
    };
    // Enforce intra-section ordering: SUPERSTRUCTURE TO RING BEAM must have Brickwork above Door Frame Fittings.
    const rowPriority = (section: string, description: string): number => {
      const d = (description || '').toLowerCase();
      if (section === 'SUPERSTRUCTURE TO RING BEAM') {
        if (d.startsWith('brickwork')) return 0;
        if (d.includes('door frame')) return 1;
      }
      return 100;
    };
    for (const g of matGroups.values()) g.rows.sort((a: any, b: any) => rowPriority(g.section, a.description) - rowPriority(g.section, b.description));
    for (const g of labGroups.values()) g.rows.sort((a: any, b: any) => rowPriority(g.section, a.description) - rowPriority(g.section, b.description));
    const sortedMat = [...matGroups.values()].sort(sortByOrder);
    const sortedLab = [...labGroups.values()].sort(sortByOrder);
    const allGroups: PdfGroup[] = [...sortedMat, ...sortedLab];
    const summaryGroups = new Map<
      string,
      { category: ConstructionSummaryCategory; subtotal: number }
    >();
    for (const group of allGroups) {
      const existing = summaryGroups.get(group.summaryCategory.key);
      summaryGroups.set(group.summaryCategory.key, {
        category: group.summaryCategory,
        subtotal: (existing?.subtotal ?? 0) + group.subtotal,
      });
    }
    const summaryRows = [...summaryGroups.values()].sort((a, b) =>
      compareConstructionSummaryCategories(a.category, b.category)
    );
    const totalMeasuredWorks = summaryRows.reduce((total, row) => total + row.subtotal, 0);
    const pgAmount = (totalMeasuredWorks * (Number(quote.pgRate) || 0)) / 100;
    const contingencyAmount = (pgAmount * (Number(quote.contingencyRate) || 0)) / 100;
    const subtotalBeforeVat = totalMeasuredWorks + pgAmount + contingencyAmount;
    const rawVatBps = Number(quote.vatBps || 0);
    const effectiveVatBps = rawVatBps > 0 && rawVatBps < 100 ? rawVatBps * 100 : rawVatBps;
    const vatPercent = effectiveVatBps / 100;
    const vatAmount = subtotalBeforeVat * (vatPercent / 100);
    const grandTotal = subtotalBeforeVat + vatAmount;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quote ${quote.number || quote.id}</title>
  <style>
    @page { margin: 15mm 15mm; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 12px; color: #1f2937; margin: 0; }

    /* Utilities */
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .flex-row { flex-direction: row; }
    .items-center { align-items: center; }
    .items-start { align-items: flex-start; }
    .justify-between { justify-content: space-between; }
    .justify-end { justify-content: flex-end; }
    .gap-2 { gap: 0.5rem; }
    .gap-4 { gap: 1rem; }
    .gap-8 { gap: 2rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mt-4 { margin-top: 1rem; }
    .p-2 { padding: 0.5rem; }
    .p-4 { padding: 1rem; }
    .p-8 { padding: 2rem; }
    .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
    
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    
    .font-bold { font-weight: 700; }
    .font-medium { font-weight: 500; }
    .italic { font-style: italic; }
    .uppercase { text-transform: uppercase; }
    
    .text-xs { font-size: 0.75rem; line-height: 1rem; }
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }

    /* Colors */
    .text-white { color: #fff; }
    .text-gray-500 { color: #6b7280; }
    .text-gray-700 { color: #374151; }
    .text-blue-900 { color: #1e3a8a; }
    .text-orange-500 { color: #f97316; }
    
    .bg-white { background-color: #fff; }
    .bg-gray-50 { background-color: #f9fafb; }
    .bg-blue-50 { background-color: #eff6ff; }
    .bg-blue-100 { background-color: #dbeafe; }
    .bg-blue-900 { background-color: #1e3a8a; }
    
    .border { border-width: 1px; border-style: solid; }
    .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
    .border-r { border-right-width: 1px; border-right-style: solid; }
    .border-gray-200 { border-color: #e5e7eb; }
    .border-gray-300 { border-color: #d1d5db; }
    .border-blue-100 { border-color: #dbeafe; }
    
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-xl { border-radius: 0.75rem; }
    
    .w-full { width: 100%; }
    .w-64 { width: 16rem; }
    .h-32 { height: 8rem; }
    .h-0.5 { height: 0.125rem; }
    .w-10 { width: 2.5rem; }
    .w-16 { width: 4rem; }
    .w-24 { width: 6rem; }
    .w-28 { width: 7rem; }
    
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    
    .object-contain { object-fit: contain; }

    /* Table specific */
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; font-weight: 500; letter-spacing: 0.05em; }

    /* Helpers */
    .logo-img { max-width: 100%; max-height: 100%; }
    
    /* Notes */
    .notes-container { margin-top: 2rem; padding: 1rem; background-color: #f9fafb; border-radius: 0.5rem; }
    .note-item { display: flex; margin-bottom: 0.25rem; font-size: 0.75rem; color: #4b5563; }
    .bullet { width: 1.5rem; text-align: center; }
  </style>
</head>
<body>
  <div class="bg-white" style="border: none;">
    <!-- Top Section: Logo & Contact -->
    <div class="flex justify-between items-start mb-6">
      <div class="flex flex-col items-start">
        <div class="w-80 h-40 mb-2 relative">
          ${logoBase64 ? `<img src="${logoBase64}" class="logo-img object-contain" alt="Barmlo Logo" />` : '<div style="background:#eee;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">Logo</div>'}
        </div>
      </div>

      <div class="flex flex-col gap-2 text-sm text-blue-900 text-right items-end">
        <div class="flex items-center gap-2 justify-end">
          <span class="font-bold italic">+263 782 939 350, +263 787 555 007</span>
        </div>
        <div class="flex items-center gap-2 justify-end">
          <span class="font-bold italic">132 J Chinamano Ave Harare</span>
        </div>
        <div class="flex items-center gap-2 justify-end">
          <span class="font-bold italic">info@barmlo.co.zw</span>
        </div>
        <div class="flex items-center gap-2 justify-end">
          <span class="font-bold italic">www.barmlo.co.zw</span>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="w-full h-0.5 bg-blue-900 mb-4"></div>

    <!-- TIN / Vendor & Title -->
    <div class="flex justify-between items-start mb-8">
      <div class="text-sm font-bold text-gray-700">
        <p style="margin:0 0 4px">TIN NO: 2000873176</p>
        <p style="margin:0">VENDOR NO: 718689</p>
      </div>
      <div>
        <h2 class="text-3xl font-bold text-gray-500 uppercase" style="letter-spacing: 0.05em; margin: 0;">QUOTATION</h2>
      </div>
    </div>

    <!-- Info Boxes -->
    <div class="grid grid-cols-2 gap-8 mb-8">
      <!-- Customer Info -->
      <div class="border border-gray-300">
        <div class="bg-blue-100 px-2 py-1 border-b border-gray-300 font-bold text-gray-700 text-sm" style="background-color: rgba(219, 234, 254, 0.5);">CUSTOMER INFO</div>
        <div class="p-2 text-sm">
          <p style="margin:0 0 4px"><span class="font-bold text-gray-700">Name:</span> ${quote.customer?.displayName || ""}</p>
          <p style="margin:0 0 4px"><span class="font-bold text-gray-700">Address:</span> ${quote.customer?.city || 'Harare'}</p>
          <p style="margin:0 0 4px"><span class="font-bold text-gray-700">Phone/Email:</span> ${quote.customer?.phone || quote.customer?.email || '-'}</p>
          <p style="margin:0"><span class="font-bold text-gray-700">Ref:</span> ${(quote as any).project?.name || 'PROPOSED HOUSE'}</p>
        </div>
      </div>

      <!-- Quote Details -->
      <div class="border border-gray-300">
        <div class="grid grid-cols-2 border-b border-gray-300 text-center font-bold text-gray-700 text-sm" style="background-color: rgba(219, 234, 254, 0.5);">
          <div class="px-2 py-1 border-r border-gray-300">QUOTE #</div>
          <div class="px-2 py-1">DATE</div>
        </div>
        <div class="grid grid-cols-2 border-b border-gray-300 text-center text-sm">
          <div class="px-2 py-1 border-r border-gray-300">${quote.number || quote.id.slice(0, 8)}</div>
          <div class="px-2 py-1">${new Date(quote.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="grid grid-cols-2 border-b border-gray-300 text-center font-bold text-gray-700 text-sm" style="background-color: rgba(219, 234, 254, 0.5);">
          <div class="px-2 py-1 border-r border-gray-300">CUSTOMER ID</div>
          <div class="px-2 py-1">VALID UNTIL</div>
        </div>
        <div class="grid grid-cols-2 text-center text-sm">
          <div class="px-2 py-1 border-r border-gray-300">${quote.customer?.id.slice(0, 5) || 'CUST01'}</div>
          <div class="px-2 py-1">${new Date(new Date(quote.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</div>
        </div>
      </div>
    </div>

    <!-- Line Items -->
    <div style="display: flex; flex-direction: column; gap: 2rem;">
      ${allGroups.map((group, gIdx) => {
      const firstLabourIdx = allGroups.findIndex(g => g.isLabour);
      const materialsTotalBanner = gIdx === firstLabourIdx && firstLabourIdx > 0
        ? `<div class="flex justify-end mb-4">
             <div style="background:#dbeafe; border-radius:0.5rem; padding:0.75rem 1.5rem;">
               <span class="font-bold text-sm" style="color:#1e3a5f;">TOTAL MATERIALS: ${money(totalMaterials, currency)}</span>
             </div>
           </div>
           <div style="background:#fffbeb; border:2px solid #fbbf24; border-radius:0.75rem; padding:1rem; margin-bottom:1rem;" class="flex items-center gap-3">
             <h2 class="font-bold uppercase text-sm" style="color:#78350f; letter-spacing:0.05em; margin:0;">LABOUR</h2>
           </div>`
        : '';
      return `
        ${materialsTotalBanner}
        <div>
          <div class="rounded-xl bg-blue-50 p-4 border border-blue-100 flex items-center gap-3 mb-4">
             <h3 class="font-bold text-blue-900 uppercase text-sm" style="letter-spacing: 0.05em; margin:0;">${group.label}</h3>
          </div>
          
          <div class="border border-gray-200 rounded-xl overflow-hidden">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-2 py-3 text-left w-10">#</th>
                  <th class="px-2 py-3 text-left">Description</th>
                  <th class="px-2 py-3 text-center w-16">Unit</th>
                  <th class="px-2 py-3 text-right w-16">Qty</th>
                  <th class="px-2 py-3 text-right w-24">Rate</th>
                  <th class="px-2 py-3 text-right w-28">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${group.rows.map((row: any, idx: number) => {
                  return `
                <tr style="border-top: 1px solid #e5e7eb;">
                  <td class="px-2 py-3 text-sm text-gray-500">${idx + 1}</td>
                  <td class="px-2 py-3 text-sm font-medium text-gray-700">
                    <div>${row.description || ""}</div>
                    ${row.labourNote ? `<div style="font-style:italic; font-weight:normal; color:#6b7280; font-size:0.75rem; margin-top:2px; line-height:1.3;">${row.labourNote}</div>` : ''}
                  </td>
                  <td class="px-2 py-3 text-center text-sm text-gray-500">${row.unit || ""}</td>
                  <td class="px-2 py-3 text-right text-sm text-gray-900">${row.qty.toFixed(2)}</td>
                  <td class="px-2 py-3 text-right text-sm text-gray-900">
                    ${money(row.unitPriceMinor || 0, currency)}
                  </td>
                  <td class="px-2 py-3 text-right text-sm font-bold text-gray-900">
                    ${money(row.amt, currency)}
                  </td>
                </tr>
                `;
                }).join("")}
              </tbody>
            </table>
            <!-- Section subtotal outside tfoot so it only appears once at the end of the section, not on every page break -->
            <div style="display:flex; justify-content:flex-end; background:#f9fafb; border-top:1px solid #e5e7eb; padding:0.75rem 0.5rem; break-inside:avoid; page-break-inside:avoid;">
              <span class="text-sm font-medium text-gray-900" style="margin-right:1rem;">Section Subtotal</span>
              <span class="text-sm font-bold text-gray-900" style="width:7rem; text-align:right;">
                ${money(group.subtotal, currency)}
              </span>
            </div>
          </div>
        </div>
        `;
    }).join("")}
    </div>

    <!-- Construction Cost Summary & Notes -->
    <div class="mt-8">
      <div class="mb-8 page-break-inside-avoid">
        <h4 class="font-bold text-gray-900 text-sm mb-3 uppercase">CONSTRUCTION COST SUMMARY</h4>
        <table class="w-full border border-gray-300">
          <thead>
            <tr class="text-gray-700" style="background:#eff6ff;">
              <th class="px-3 py-2 text-center border-r border-gray-300 w-12">#</th>
              <th class="px-3 py-2 text-left border-r border-gray-300">DESCRIPTION</th>
              <th class="px-3 py-2 text-right w-40">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-gray-300">
              <td class="px-3 py-2 border-r border-gray-300"></td>
              <td class="px-3 py-2 border-r border-gray-300 font-bold uppercase">Builder's Work</td>
              <td class="px-3 py-2"></td>
            </tr>
            ${summaryRows.map(({ category, subtotal }, index) => `
              <tr class="border-b border-gray-200">
                <td class="px-3 py-2 text-center border-r border-gray-300 text-gray-600">${index + 1}</td>
                <td class="px-3 py-2 border-r border-gray-300 font-semibold uppercase text-gray-800">${category.label}</td>
                <td class="px-3 py-2 text-right font-semibold" style="background:#eff6ff;">${money(subtotal, currency)}</td>
              </tr>
            `).join("")}
            <tr class="border-t-2 border-gray-400 border-b border-gray-300">
              <td class="px-3 py-2 border-r border-gray-300"></td>
              <td class="px-3 py-2 border-r border-gray-300 font-bold uppercase">TOTAL MEASURED WORKS</td>
              <td class="px-3 py-2 text-right font-bold" style="background:#eff6ff;">${money(totalMeasuredWorks, currency)}</td>
            </tr>
            <tr class="border-b border-gray-300">
              <td class="px-3 py-2 border-r border-gray-300"></td>
              <td class="px-3 py-2 border-r border-gray-300">ADD P&Gs (${Number(quote.pgRate || 0)}%)</td>
              <td class="px-3 py-2 text-right font-semibold" style="background:#eff6ff;">${money(pgAmount, currency)}</td>
            </tr>
            <tr class="border-b border-gray-300">
              <td class="px-3 py-2 border-r border-gray-300"></td>
              <td class="px-3 py-2 border-r border-gray-300">ADD CONTINGENCIES (${Number(quote.contingencyRate || 0)}%)</td>
              <td class="px-3 py-2 text-right font-semibold" style="background:#eff6ff;">${money(contingencyAmount, currency)}</td>
            </tr>
            <tr class="border-b border-gray-300">
              <td class="px-3 py-2 border-r border-gray-300"></td>
              <td class="px-3 py-2 border-r border-gray-300">${vatPercent > 0 ? `ADD VAT (${vatPercent}%)` : 'VAT MISSING'}</td>
              <td class="px-3 py-2 text-right font-semibold" style="background:#eff6ff;">${money(vatAmount, currency)}</td>
            </tr>
            <tr class="font-bold text-white" style="background:#1e3a8a;">
              <td class="px-3 py-2 border-r border-blue-800"></td>
              <td class="px-3 py-2 border-r border-blue-800 uppercase">GRAND TOTAL</td>
              <td class="px-3 py-2 text-right">${money(grandTotal, currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

    <!-- Notes Section -->
    ${(assumptions.length > 0 || exclusions.length > 0) ? `
    <div class="notes-container border-0 bg-white p-0 mt-4 page-break-inside-avoid">
      <h4 class="font-bold text-gray-700 text-sm mb-4 uppercase underline">NOTES</h4>
      
      ${assumptions.length > 0 ? `
        <div class="mb-4">
          <div class="flex gap-2 mb-2">
            <span class="font-bold text-sm text-gray-700">1)</span>
            <span class="font-bold text-sm text-gray-700 uppercase">Assumptions & Conditions:</span>
          </div>
          <div class="pl-6 text-sm text-gray-600">
            ${assumptions.map((n: string) => `
              <div class="mb-2 leading-relaxed">
                ${n
        .replace(/(\s|^)(\d+\))/g, '<br/><br/><span class="font-bold text-gray-700">$2</span>')
        .replace(/(\s|^)([a-z]\))/g, '<br/><span style="display:inline-block; margin-left: 24px;">$2</span>')
        .replace(/(\s|^)(\d+\.\s)/g, '<br/><span style="display:inline-block; margin-left: 24px;">$2</span>')
      }
              </div>
            `).join("")}
          </div>
        </div>
      ` : ''}

      ${exclusions.length > 0 ? `
        <div>
          <div class="flex gap-2 mb-2">
            <span class="font-bold text-sm text-gray-700">${assumptions.length > 0 ? '2' : '1'})</span>
            <span class="font-bold text-sm text-gray-700 uppercase">Exclusions:</span>
          </div>
           <div class="pl-6 text-sm text-gray-600">
            ${exclusions.map((n: string) => `
              <div class="mb-2 leading-relaxed">
                ${n
          .replace(/(\s|^)(\d+\))/g, '<br/><br/><span class="font-bold text-gray-700">$2</span>')
          .replace(/(\s|^)([a-z]\))/g, '<br/><span style="display:inline-block; margin-left: 24px;">$2</span>')
          .replace(/(\s|^)(\d+\.\s)/g, '<br/><span style="display:inline-block; margin-left: 24px;">$2</span>')
        }
              </div>
            `).join("")}
          </div>
        </div>
      ` : ''}
    </div>
    ` : ''}
    </div>

    <div class="mt-8 mb-8"></div>
  </div>
</body>
</html>`;

    // Launch Chromium (works locally & on Vercel)
    const isServerless = !!process.env.VERCEL;
    let executablePath = isServerless
      ? await chromium.executablePath()
      : getLocalBrowserPath();

    if (!executablePath && !isServerless) {
      console.warn("Could not find local Chrome/Edge. PDF generation might fail. Please install Chrome or set CHROME_EXECUTABLE_PATH.");
    }

    const browser: Browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      headless: true,
      executablePath,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" });

      const pdfUint8 = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
      });
      const buffer = Buffer.from(pdfUint8);

      const customerName = quote.customer?.displayName || "Customer";
      const sanitizedCustomerName = customerName.replace(/[^a-z0-9\-_]/gi, '_');

      let filename = `${sanitizedCustomerName}_Quotation`;
      if (quote.number) {
        filename += `_${quote.number}`;
      }
      filename += ".pdf";

      return { buffer, filename };
    } finally {
      await browser.close();
    }
  }
}

/* ── Shared helpers ── */

function loadLogo(): string {
  const logoPath = path.join(process.cwd(), "public", "Barmlo Logo 2026.png");
  try {
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      return `data:image/png;base64,${buf.toString("base64")}`;
    }
  } catch { /* ignore */ }
  return BARMLO_LOGO_BASE64;
}

async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL;
  const executablePath = isServerless
    ? await chromium.executablePath()
    : getLocalBrowserPath();

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1920, height: 1080 },
    headless: true,
    executablePath,
  });
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdfUint8 = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
    });
    return Buffer.from(pdfUint8);
  } finally {
    await browser.close();
  }
}

/** Escape HTML entities */
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const BASE_STYLES = `
  @page { margin: 15mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 12px; color: #1f2937; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 0.7rem; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.04em; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #166534; }
  .logo-img { width: 230px; height: 105px; object-fit: contain; }
  .company-info { text-align: right; font-size: 10px; color: #166534; }
  .company-info .title { font-size: 18px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; }
  .info-grid { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .info-box { width: 48%; border: 1px solid #d1d5db; }
  .info-box-header { background: #eff6ff; padding: 4px 6px; border-bottom: 1px solid #d1d5db; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #1f2937; }
  .info-row { display: flex; padding: 3px 6px; }
  .info-label { font-size: 10px; font-weight: 700; color: #374151; width: 70px; flex-shrink: 0; }
  .info-value { font-size: 10px; color: #374151; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .section-title { margin-top: 12px; margin-bottom: 4px; padding: 4px 6px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 11px; font-weight: 700; color: #374151; text-transform: uppercase; }
  .tbl-header { background: #f3f4f6; }
  .tbl-header th { padding: 5px 6px; }
  .tbl-row td { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding: 10px 0; }
  .note-box { margin-top: 12px; padding: 8px; background: #f9fafb; border-radius: 4px; border: 1px solid #e5e7eb; }
  .note-title { font-size: 10px; font-weight: 700; color: #374151; margin-bottom: 4px; }
  .note-text { font-size: 10px; color: #4b5563; }
`;

function companyHeader(logoBase64: string, title: string): string {
  return `<div class="header">
    <div>${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
    </div>
    <div class="company-info">
      <div style="font-weight:700">BARMLO CONSTRUCTION</div>
      <div>3294, Light Industry, Mberengwa</div>
      <div>info@barmlo.co.zw</div>
      <div>www.barmlo.co.zw</div>
      <div class="title">${esc(title)}</div>
    </div>
  </div>`;
}

/* ── Requisition PDF ── */

export async function renderRequisitionPdf(requisitionId: string): Promise<PdfResult> {
  const req = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    include: {
      items: { include: { quoteLine: { select: { metaJson: true } } } },
      project: { include: { quote: { include: { customer: true, project: true } } } },
      submittedBy: { select: { name: true } },
    },
  });
  if (!req) throw new Error("Requisition not found");

  const quote = req.project.quote;
  const customer = quote.customer;
  const project = quote.project;
  const validUntil = new Date(quote.createdAt);
  validUntil.setDate(validUntil.getDate() + 30);

  const getSection = (item: (typeof req.items)[number]) => {
    const raw = item.quoteLine?.metaJson;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const p = JSON.parse(raw) as { section?: string; category?: string };
        const s = p?.section?.trim() || p?.category?.trim() || null;
        if (s) return s;
      } catch { /* ignore */ }
    }
    return "Uncategorized";
  };

  // Group items by section
  const groups = new Map<string, (typeof req.items)>();
  for (const item of req.items) {
    const sec = getSection(item);
    const bucket = groups.get(sec) ?? [];
    bucket.push(item);
    groups.set(sec, bucket);
  }

  const logoBase64 = loadLogo();
  const statusColors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: "#fef3c7", text: "#92400e" },
    SUBMITTED: { bg: "#dbeafe", text: "#1e40af" },
    APPROVED: { bg: "#dcfce7", text: "#166534" },
  };
  const sc = statusColors[req.status] ?? statusColors.DRAFT;

  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_STYLES}</style></head><body>
    ${companyHeader(logoBase64, "Purchase Requisition")}
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-header">Customer Info</div>
        <div style="padding:6px">
          <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${esc(customer.displayName)}</span></div>
          <div class="info-row"><span class="info-label">Address:</span><span class="info-value">${esc(customer.city || (customer.addressJson as any)?.city || "N/A")}</span></div>
          <div class="info-row"><span class="info-label">Phone:</span><span class="info-value">${esc(customer.phone || customer.email || "N/A")}</span></div>
          <div class="info-row"><span class="info-label">Ref:</span><span class="info-value">${esc(project?.name)}</span></div>
        </div>
      </div>
      <div class="info-box">
        <div class="info-box-header">Requisition Details</div>
        <div style="padding:6px">
          <div class="info-row"><span class="info-label">Quote #:</span><span class="info-value">${esc(quote.number || quote.id.slice(0, 8))}</span></div>
          <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${new Date(quote.createdAt).toLocaleDateString("en-GB")}</span></div>
          <div class="info-row"><span class="info-label">Valid Until:</span><span class="info-value">${validUntil.toLocaleDateString("en-GB")}</span></div>
          <div class="info-row"><span class="info-label">Status:</span><span class="badge" style="background:${sc.bg};color:${sc.text}">${esc(req.status)}</span></div>
        </div>
      </div>
    </div>

    ${req.submittedBy?.name ? `<div style="margin-bottom:10px;font-size:10px;color:#6b7280;">Submitted by: ${esc(req.submittedBy.name)}</div>` : ""}

    <table>
      <thead class="tbl-header"><tr>
        <th style="text-align:left;padding:5px 6px">Description</th>
        <th style="text-align:center;padding:5px 6px;width:60px">Unit</th>
        <th style="text-align:right;padding:5px 6px;width:60px">Qty</th>
      </tr></thead>
      <tbody>
      ${[...groups.entries()].map(([section, items]) => `
        <tr><td colspan="3" class="section-title">${esc(section)}</td></tr>
        ${items.map(it => `<tr class="tbl-row">
          <td>${esc(it.description)}</td>
          <td class="text-center">${esc(it.unit || "-")}</td>
          <td class="text-right">${Number(it.qtyRequested ?? 0)}</td>
        </tr>`).join("")}
      `).join("")}
      </tbody>
    </table>

    ${req.items.length === 0 ? '<div style="padding:20px;text-align:center;color:#6b7280;font-size:11px">No items in this requisition.</div>' : ""}

    <div class="footer">Requisition Ref: ${esc(project?.name || req.id.slice(0, 10))} | Generated ${new Date().toLocaleDateString("en-GB")}</div>
  </body></html>`;

  const buffer = await htmlToPdf(html);
  return { buffer, filename: `Requisition-${project?.name || req.id.slice(0, 10)}.pdf` };
}

/* ── Dispatch PDF ── */

export async function renderDispatchPdf(dispatchId: string): Promise<PdfResult> {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: {
      items: { orderBy: { id: "asc" } },
      project: { include: { quote: { include: { customer: true, project: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  if (!dispatch) throw new Error("Dispatch not found");

  const project = dispatch.project;
  const quote = project?.quote;
  const customer = quote?.customer;

  const statusColors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: "#f3f4f6", text: "#374151" },
    SUBMITTED: { bg: "#dbeafe", text: "#1e40af" },
    APPROVED: { bg: "#dcfce7", text: "#166534" },
    DISPATCHED: { bg: "#e0e7ff", text: "#3730a3" },
    IN_TRANSIT: { bg: "#fef3c7", text: "#92400e" },
    DELIVERED: { bg: "#dcfce7", text: "#166534" },
  };
  const sc = statusColors[dispatch.status] || statusColors.DRAFT;
  const logoBase64 = loadLogo();

  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_STYLES}</style></head><body>
    ${companyHeader(logoBase64, "Dispatch Form")}
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-header">Customer Info</div>
        <div style="padding:6px">
          <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${esc(customer?.displayName)}</span></div>
          <div class="info-row"><span class="info-label">Address:</span><span class="info-value">${esc(customer?.city || (customer?.addressJson as any)?.city || "N/A")}</span></div>
          <div class="info-row"><span class="info-label">Phone:</span><span class="info-value">${esc(customer?.phone || customer?.email || "N/A")}</span></div>
          <div class="info-row"><span class="info-label">Project:</span><span class="info-value">${esc(project?.name ?? quote?.project?.name)}</span></div>
        </div>
      </div>
      <div class="info-box">
        <div class="info-box-header">Dispatch Details</div>
        <div style="padding:6px">
          <div class="info-row"><span class="info-label">Quote #:</span><span class="info-value">${esc(quote?.number || quote?.id?.slice(0, 8))}</span></div>
          <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${new Date(dispatch.createdAt).toLocaleDateString("en-GB")}</span></div>
          <div class="info-row"><span class="info-label">Created by:</span><span class="info-value">${esc(dispatch.createdBy?.name)}</span></div>
          <div class="info-row"><span class="info-label">Status:</span><span class="badge" style="background:${sc.bg};color:${sc.text}">${esc(dispatch.status)}</span></div>
        </div>
      </div>
    </div>

    <table>
      <thead class="tbl-header"><tr>
        <th style="text-align:left;padding:5px 6px">Description</th>
        <th style="text-align:center;padding:5px 6px;width:55px">Unit</th>
        <th style="text-align:right;padding:5px 6px;width:55px">Qty</th>
        <th style="text-align:center;padding:5px 6px;width:75px">Handed Out</th>
      </tr></thead>
      <tbody>
      ${dispatch.items.map(it => `<tr class="tbl-row">
        <td>${esc(it.description)}</td>
        <td class="text-center">${esc(it.unit || "-")}</td>
        <td class="text-right">${Number(it.qty ?? 0)}</td>
        <td class="text-center">${it.handedOutAt ? "Yes" : "-"}</td>
      </tr>`).join("")}
      </tbody>
    </table>

    ${dispatch.items.length === 0 ? '<div style="padding:20px;text-align:center;color:#6b7280;font-size:11px">No items.</div>' : ""}

    ${dispatch.note ? `<div class="note-box"><div class="note-title">Note:</div><div class="note-text">${esc(dispatch.note)}</div></div>` : ""}

    <div class="footer">Dispatch Ref: ${esc(dispatch.id.slice(0, 10))} | Generated ${new Date().toLocaleDateString("en-GB")}</div>
  </body></html>`;

  const buffer = await htmlToPdf(html);
  return { buffer, filename: `Dispatch-${dispatch.id.slice(0, 10)}.pdf` };
}

/* ── Purchase Order PDF ── */

export async function renderPurchaseOrderPdf(poId: string): Promise<PdfResult> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      items: { include: { quoteLine: true } },
      requisition: { include: { project: { include: { quote: { include: { customer: true } } } } } },
      project: { include: { quote: { include: { customer: true } } } },
      purchases: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!po) throw new Error("Purchase order not found");

  const project = po.requisition?.project || po.project;
  const customer = project?.quote?.customer;
  const vendorName = po.vendor || "Unknown Vendor";
  const vendorPhone = po.purchases?.[0]?.vendorPhone || "";

  const totalMinor = po.items.reduce(
    (acc, it) => acc + Number(it.unitPriceMinor ?? 0) * Number(it.qty ?? 0), 0,
  );

  const statusColors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: "#f3f4f6", text: "#374151" },
    SUBMITTED: { bg: "#dbeafe", text: "#1e40af" },
    APPROVED: { bg: "#dcfce7", text: "#166534" },
    REJECTED: { bg: "#fee2e2", text: "#991b1b" },
    PURCHASED: { bg: "#e9d5ff", text: "#6b21a8" },
    RECEIVED: { bg: "#dcfce7", text: "#166534" },
    COMPLETE: { bg: "#dcfce7", text: "#166534" },
  };
  const sc = statusColors[po.status] || statusColors.DRAFT;
  const logoBase64 = loadLogo();

  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_STYLES}</style></head><body>
    ${companyHeader(logoBase64, "Purchase Order")}
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-header">Vendor Info</div>
        <div style="padding:6px">
          <div class="info-row"><span class="info-label">Vendor:</span><span class="info-value">${esc(vendorName)}</span></div>
          <div class="info-row"><span class="info-label">Phone:</span><span class="info-value">${esc(vendorPhone || "N/A")}</span></div>
          <div class="info-row"><span class="info-label">Customer:</span><span class="info-value">${esc(customer?.displayName)}</span></div>
          <div class="info-row"><span class="info-label">Project:</span><span class="info-value">${esc(project?.name)}</span></div>
        </div>
      </div>
      <div class="info-box">
        <div class="info-box-header">Order Details</div>
        <div style="padding:6px">
          <div class="info-row"><span class="info-label">PO ID:</span><span class="info-value">${esc(po.id.slice(0, 12))}</span></div>
          <div class="info-row"><span class="info-label">Quote #:</span><span class="info-value">${esc(project?.quote?.number || project?.quote?.id?.slice(0, 8))}</span></div>
          <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${new Date(po.createdAt).toLocaleDateString("en-GB")}</span></div>
          <div class="info-row"><span class="info-label">Status:</span><span class="badge" style="background:${sc.bg};color:${sc.text}">${esc(po.status)}</span></div>
        </div>
      </div>
    </div>

    <table>
      <thead class="tbl-header"><tr>
        <th style="text-align:left;padding:5px 6px">Description</th>
        <th style="text-align:center;padding:5px 6px;width:45px">Unit</th>
        <th style="text-align:right;padding:5px 6px;width:45px">Qty</th>
        <th style="text-align:right;padding:5px 6px;width:70px">Unit Price</th>
        <th style="text-align:right;padding:5px 6px;width:75px">Total</th>
      </tr></thead>
      <tbody>
      ${po.items.map(it => {
        const qty = Number(it.qty ?? 0);
        const price = Number(it.unitPriceMinor ?? 0);
        const lineTotal = qty * price;
        return `<tr class="tbl-row">
          <td>${esc(it.description)}</td>
          <td class="text-center">${esc(it.unit || "-")}</td>
          <td class="text-right">${qty}</td>
          <td class="text-right">${money(price)}</td>
          <td class="text-right">${money(lineTotal)}</td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>

    ${po.items.length === 0 ? '<div style="padding:20px;text-align:center;color:#6b7280;font-size:11px">No items.</div>' : ""}

    <div style="border-top:2px solid #166534;margin-top:10px;padding-top:8px;display:flex;justify-content:flex-end">
      <div style="display:flex;gap:10px;font-size:12px;font-weight:700">
        <span>TOTAL:</span>
        <span style="color:#166534">${money(totalMinor)}</span>
      </div>
    </div>

    ${po.note ? `<div class="note-box"><div class="note-title">Note:</div><div class="note-text">${esc(po.note)}</div></div>` : ""}

    <div class="footer">PO Ref: ${esc(po.id.slice(0, 12))} | Generated ${new Date().toLocaleDateString("en-GB")}</div>
  </body></html>`;

  const buffer = await htmlToPdf(html);
  return { buffer, filename: `PurchaseOrder-${po.id.slice(0, 10)}.pdf` };
}
