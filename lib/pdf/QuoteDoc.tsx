// lib/pdf/QuoteDoc.tsx
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Image, Svg, Path, Font } from '@react-pdf/renderer';
import {
  compareConstructionSummaryCategories,
  getConstructionSummaryCategory,
  type ConstructionSummaryCategory,
} from '@/lib/constructionSummary';

// Register a nice font if possible, otherwise default
// Font.register({ family: 'Inter', src: '...' });

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937' },
  
  // Header
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 2, borderBottomColor: '#166534' },
  logoContainer: { width: 150 },
  companyInfo: { alignItems: 'flex-end', flex: 1 },
  companyText: { fontSize: 8, color: '#166534', marginBottom: 2 },
  
  // Quote Info
  infoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  infoBlock: { width: '48%' },
  infoLabel: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 10, fontWeight: 'bold' },
  
  // Section
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#166534', marginTop: 15, marginBottom: 5, textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 2 },
  
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#d1d5db', paddingVertical: 4, alignItems: 'center' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 4, alignItems: 'flex-start' },
  
  // Columns - Fixed widths for numbers to align right perfectly, Flex for description
  colIdx: { width: 25, textAlign: 'center' },
  colDesc: { flexGrow: 1, paddingRight: 5 }, 
  colUnit: { width: 35, textAlign: 'center' },
  colQty: { width: 45, textAlign: 'right' },
  colRate: { width: 60, textAlign: 'right' },
  colAmt: { width: 70, textAlign: 'right', paddingRight: 4 },
  
  // Cells
  th: { fontSize: 8, fontWeight: 'bold', color: '#374151' },
  td: { fontSize: 9 },
  
  // Subtotal
  sectionSubtotal: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 4, marginTop: 2 },
  subtotalLabel: { fontSize: 9, fontWeight: 'bold', marginRight: 10 },
  subtotalValue: { fontSize: 9, fontWeight: 'bold', width: 70, textAlign: 'right', paddingRight: 4 },
  
  // Summary
  summaryContainer: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10, marginLeft: 'auto', width: '50%' },
  summaryTitle: { fontSize: 10, fontWeight: 'bold', color: '#166534', marginBottom: 8, textTransform: 'uppercase' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 9, color: '#374151' },
  summaryValue: { fontSize: 9, fontWeight: 'bold' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, borderTopWidth: 2, borderTopColor: '#166534', paddingTop: 4 },
  grandTotalLabel: { fontSize: 11, fontWeight: 'bold', color: '#166534' },
  grandTotalValue: { fontSize: 11, fontWeight: 'bold', color: '#166534' },
  
  // Notes
  notesContainer: { marginTop: 20, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 },
  noteTitle: { fontSize: 10, fontWeight: 'bold', marginBottom: 4, color: '#374151' },
  noteItem: { fontSize: 8, marginBottom: 2, color: '#4b5563', flexDirection: 'row' },
  bullet: { width: 10, textAlign: 'center' },
  
  // Footer
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', fontSize: 8, color: '#9ca3af', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10 },
});

type PdfLine = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  lineTotalMinor: number;
  section: string;
  itemType: string;
};

type PdfQuote = {
  id: string;
  number: string | null;
  currency: string;
  vatBps: number;
  status: string;
  pgRate: number;
  contingencyRate: number;
  assumptions: string;
  exclusions: string;
  customer: { displayName: string } | null;
  createdAt: string;
};

const formatMoney = (minor: number, currency: string) => {
  const val = minor / 100;
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function QuoteDoc({ quote, lines, logoData }: { quote: PdfQuote; lines: PdfLine[]; logoData?: string }) {
  const currency = quote.currency || 'USD';
  const currencySymbol = currency === 'USD' ? '$' : currency;
  const totalMaterials = lines
    .filter((line) => line.itemType !== 'LABOUR')
    .reduce((acc, line) => acc + line.lineTotalMinor, 0);
  const totalLabour = lines
    .filter((line) => line.itemType === 'LABOUR')
    .reduce((acc, line) => acc + line.lineTotalMinor, 0);
  const totalFixAndSupply = totalMaterials + totalLabour;

  // Group lines
  const groups: Record<string, { section: string; lines: PdfLine[]; subtotal: number }> = {};
  
  lines.forEach(l => {
    const section = l.section || 'Items';
    if (!groups[section]) {
      groups[section] = { section, lines: [], subtotal: 0 };
    }
    groups[section].lines.push(l);
    groups[section].subtotal += l.lineTotalMinor;
  });
  
  type DocGroup = { section: string; label: string; isLabour: boolean; lines: PdfLine[]; subtotal: number; summaryCategory: ConstructionSummaryCategory };
  const matGroups: Map<string, DocGroup> = new Map();
  const labGroups: Map<string, DocGroup> = new Map();

  Object.values(groups).forEach(g => {
    for (const line of g.lines) {
      const itemType = line.itemType || 'MATERIAL';
      const summaryCategory = getConstructionSummaryCategory({
        section: g.section,
        description: line.description,
        itemType,
      });
      const groupKey = `${g.section}:${summaryCategory.key}`;
      if (itemType === 'LABOUR') {
        if (!labGroups.has(groupKey)) labGroups.set(groupKey, { section: g.section, label: summaryCategory.detailLabel, isLabour: true, lines: [], subtotal: 0, summaryCategory });
        const lg = labGroups.get(groupKey)!;
        lg.lines.push(line);
        lg.subtotal += line.lineTotalMinor;
      } else {
        if (!matGroups.has(groupKey)) matGroups.set(groupKey, { section: g.section, label: summaryCategory.detailLabel, isLabour: false, lines: [], subtotal: 0, summaryCategory });
        const mg = matGroups.get(groupKey)!;
        mg.lines.push(line);
        mg.subtotal += line.lineTotalMinor;
      }
    }
  });

  const sortByOrder = (a: DocGroup, b: DocGroup) => {
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
  for (const g of matGroups.values()) g.lines.sort((a, b) => rowPriority(g.section, a.description) - rowPriority(g.section, b.description));
  for (const g of labGroups.values()) g.lines.sort((a, b) => rowPriority(g.section, a.description) - rowPriority(g.section, b.description));
  const sortedMat = [...matGroups.values()].sort(sortByOrder);
  const sortedLab = [...labGroups.values()].sort(sortByOrder);
  const allDocGroups: DocGroup[] = [...sortedMat, ...sortedLab];

  const summaryGroups = new Map<string, { category: ConstructionSummaryCategory; subtotal: number }>();
  for (const group of allDocGroups) {
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
  const pgAmount = (totalMeasuredWorks * quote.pgRate) / 100;
  const contingencyAmount = (pgAmount * quote.contingencyRate) / 100;
  const subtotalBeforeVat = totalMeasuredWorks + pgAmount + contingencyAmount;
  const effectiveVatBps = quote.vatBps > 0 && quote.vatBps < 100 ? quote.vatBps * 100 : quote.vatBps;
  const vatPercent = effectiveVatBps / 100;
  const vatAmount = subtotalBeforeVat * (vatPercent / 100);
  const grandTotal = subtotalBeforeVat + vatAmount;

  const assumptions = quote.assumptions ? JSON.parse(quote.assumptions) as string[] : [];
  const exclusions = quote.exclusions ? JSON.parse(quote.exclusions) as string[] : [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={{ width: 240, height: 112 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logoData && <Image src={logoData} style={{ width: 240, height: 112, objectFit: 'contain' }} />}
          </View>
          <View style={styles.companyInfo}>
             <Text style={[styles.companyText, { fontWeight: 'bold' }]}>BARMLO CONSTRUCTION</Text>
             <Text style={styles.companyText}>3294, Light Industry, Mberengwa</Text>
             <Text style={styles.companyText}>info@barmlo.co.zw</Text>
             <Text style={styles.companyText}>www.barmlo.co.zw</Text>
          </View>
        </View>

        {/* Quote Info */}
        <View style={styles.infoContainer}>
          <View style={styles.infoBlock}>
             <Text style={styles.infoLabel}>To</Text>
             <Text style={styles.infoValue}>{quote.customer?.displayName || 'Customer'}</Text>
          </View>
          <View style={[styles.infoBlock, { alignItems: 'flex-end' }]}>
             <Text style={styles.infoLabel}>Quotation #{quote.number || quote.id.slice(0, 8)}</Text>
             <Text style={styles.infoValue}>Date: {new Date(quote.createdAt).toLocaleDateString()}</Text>
             <Text style={styles.infoValue}>Currency: {currency}</Text>
          </View>
        </View>
        
        {/* Line Items by Group */}
        {(() => {
          const firstLabourIdx = allDocGroups.findIndex(g => g.isLabour);
          return allDocGroups.map((group, gIdx) => (
            <View key={`${group.section}-${group.isLabour ? 'L' : 'M'}`}>
              {/* Materials total banner before first labour group */}
              {gIdx === firstLabourIdx && firstLabourIdx > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <View style={{ backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e3a5f' }}>TOTAL MATERIALS: {currencySymbol} {formatMoney(totalMaterials, currency)}</Text>
                  </View>
                </View>
              )}
              {gIdx === firstLabourIdx && firstLabourIdx > 0 && (
                <View style={{ backgroundColor: '#fffbeb', borderWidth: 2, borderColor: '#fbbf24', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: '#78350f', letterSpacing: 0.5 }}>LABOUR</Text>
                </View>
              )}

              <View>
                <Text style={styles.sectionTitle}>{group.label}</Text>
            
                {/* Table Header */}
                <View style={styles.tableHeader}>
                  <Text style={[styles.colIdx, styles.th]}>#</Text>
                  <Text style={[styles.colDesc, styles.th]}>Description</Text>
                  <Text style={[styles.colUnit, styles.th]}>Unit</Text>
                  <Text style={[styles.colQty, styles.th]}>Qty</Text>
                  <Text style={[styles.colRate, styles.th]}>Rate</Text>
                  <Text style={[styles.colAmt, styles.th]}>Amount</Text>
                </View>
            
                {/* Rows */}
                {group.lines.map((line, idx) => (
                  <View key={line.id} style={styles.tableRow}>
                    <Text style={[styles.colIdx, styles.td]}>{idx + 1}</Text>
                    <Text style={[styles.colDesc, styles.td]}>{line.description}</Text>
                    <Text style={[styles.colUnit, styles.td]}>{line.unit}</Text>
                    <Text style={[styles.colQty, styles.td]}>{line.quantity}</Text>
                    <Text style={[styles.colRate, styles.td]}>{formatMoney((line.lineTotalMinor / (line.quantity || 1)), '')}</Text>
                    <Text style={[styles.colAmt, styles.td]}>{formatMoney(line.lineTotalMinor, '')}</Text>
                  </View>
                ))}
            
                {/* Group Subtotal */}
                <View style={styles.sectionSubtotal} wrap={false}>
                  <Text style={styles.subtotalLabel}>Subtotal {group.label}</Text>
                  <Text style={styles.subtotalValue}>{currencySymbol} {formatMoney(group.subtotal, currency)}</Text>
                </View>
              </View>
            </View>
          ));
        })()}

        <View style={{ marginTop: 14, alignItems: 'flex-end', gap: 6 }}>
          {totalLabour > 0 && (
            <View style={{ backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6, minWidth: 170 }}>
              <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#78350f', textAlign: 'right' }}>
                TOTAL LABOUR: {currencySymbol} {formatMoney(totalLabour, currency)}
              </Text>
            </View>
          )}
          <View style={{ backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6, minWidth: 170 }}>
            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#1e3a5f', textAlign: 'right' }}>
              TOTAL MATERIALS: {currencySymbol} {formatMoney(totalMaterials, currency)}
            </Text>
          </View>
          <View style={{ backgroundColor: '#dcfce7', borderRadius: 4, borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 12, paddingVertical: 8, minWidth: 170 }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#166534', textAlign: 'right' }}>
              TOTAL FIX & SUPPLY: {currencySymbol} {formatMoney(totalFixAndSupply, currency)}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 20, borderWidth: 1, borderColor: '#d1d5db' }} wrap={false}>
          <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>Construction Cost Summary</Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: '#eff6ff', borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
            <Text style={{ width: 30, padding: 6, fontSize: 8, fontWeight: 'bold', textAlign: 'center', borderRightWidth: 1, borderRightColor: '#d1d5db' }}>#</Text>
            <Text style={{ flex: 1, padding: 6, fontSize: 8, fontWeight: 'bold', borderRightWidth: 1, borderRightColor: '#d1d5db' }}>DESCRIPTION</Text>
            <Text style={{ width: 90, padding: 6, fontSize: 8, fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</Text>
          </View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
            <Text style={{ width: 30, padding: 6, borderRightWidth: 1, borderRightColor: '#d1d5db' }} />
            <Text style={{ flex: 1, padding: 6, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', borderRightWidth: 1, borderRightColor: '#d1d5db' }}>Builder&apos;s Work</Text>
            <Text style={{ width: 90, padding: 6 }} />
          </View>
          {summaryRows.map(({ category, subtotal }, index) => (
            <View key={category.key} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
              <Text style={{ width: 30, padding: 6, fontSize: 8, textAlign: 'center', borderRightWidth: 1, borderRightColor: '#d1d5db' }}>{index + 1}</Text>
              <Text style={{ flex: 1, padding: 6, fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', borderRightWidth: 1, borderRightColor: '#d1d5db' }}>{category.label}</Text>
              <Text style={{ width: 90, padding: 6, fontSize: 8, fontWeight: 'bold', textAlign: 'right', backgroundColor: '#eff6ff' }}>{currencySymbol} {formatMoney(subtotal, currency)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#6b7280', borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
            <Text style={{ width: 30, padding: 6, borderRightWidth: 1, borderRightColor: '#d1d5db' }} />
            <Text style={{ flex: 1, padding: 6, fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', borderRightWidth: 1, borderRightColor: '#d1d5db' }}>Total Measured Works</Text>
            <Text style={{ width: 90, padding: 6, fontSize: 8, fontWeight: 'bold', textAlign: 'right', backgroundColor: '#eff6ff' }}>{currencySymbol} {formatMoney(totalMeasuredWorks, currency)}</Text>
          </View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
            <Text style={{ width: 30, padding: 6, borderRightWidth: 1, borderRightColor: '#d1d5db' }} />
            <Text style={{ flex: 1, padding: 6, fontSize: 8, borderRightWidth: 1, borderRightColor: '#d1d5db' }}>Add P&amp;Gs ({quote.pgRate}%)</Text>
            <Text style={{ width: 90, padding: 6, fontSize: 8, textAlign: 'right', backgroundColor: '#eff6ff' }}>{currencySymbol} {formatMoney(pgAmount, currency)}</Text>
          </View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
            <Text style={{ width: 30, padding: 6, borderRightWidth: 1, borderRightColor: '#d1d5db' }} />
            <Text style={{ flex: 1, padding: 6, fontSize: 8, borderRightWidth: 1, borderRightColor: '#d1d5db' }}>Add Contingencies ({quote.contingencyRate}%)</Text>
            <Text style={{ width: 90, padding: 6, fontSize: 8, textAlign: 'right', backgroundColor: '#eff6ff' }}>{currencySymbol} {formatMoney(contingencyAmount, currency)}</Text>
          </View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d1d5db' }}>
            <Text style={{ width: 30, padding: 6, borderRightWidth: 1, borderRightColor: '#d1d5db' }} />
            <Text style={{ flex: 1, padding: 6, fontSize: 8, borderRightWidth: 1, borderRightColor: '#d1d5db' }}>{vatPercent > 0 ? `Add VAT (${vatPercent}%)` : 'VAT Missing'}</Text>
            <Text style={{ width: 90, padding: 6, fontSize: 8, textAlign: 'right', backgroundColor: '#eff6ff' }}>{currencySymbol} {formatMoney(vatAmount, currency)}</Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: '#1e3a8a' }}>
            <Text style={{ width: 30, padding: 6, borderRightWidth: 1, borderRightColor: '#1e40af' }} />
            <Text style={{ flex: 1, padding: 6, fontSize: 9, fontWeight: 'bold', color: '#ffffff', textTransform: 'uppercase', borderRightWidth: 1, borderRightColor: '#1e40af' }}>Grand Total</Text>
            <Text style={{ width: 90, padding: 6, fontSize: 9, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>{currencySymbol} {formatMoney(grandTotal, currency)}</Text>
          </View>
        </View>

        {/* Notes */}
        {(assumptions.length > 0 || exclusions.length > 0) && (
          <View style={styles.notesContainer} wrap={false}>
            {/* Treat assumptions[0] as the full notes text if it exists and looks like the new format */}
            {assumptions.length > 0 && (
              <View>
                {assumptions.length === 1 && assumptions[0].includes('\n') ? (
                   // New format: Single block of text
                   <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.5 }}>
                     {assumptions[0]}
                   </Text>
                ) : (
                  // Fallback: Legacy list format
                  <View>
                    <Text style={styles.noteTitle}>Assumptions & Conditions:</Text>
                    {assumptions.map((note, i) => (
                      <View key={i} style={styles.noteItem}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={{ flex: 1 }}>{note}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            
            {/* Legacy Exclusions support (if any exist independently) */}
            {exclusions.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.noteTitle}>Exclusions:</Text>
                {exclusions.map((note, i) => (
                  <View key={i} style={styles.noteItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={{ flex: 1 }}>{note}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <Text style={styles.footer} fixed>
          This is a computer-generated document. No signature is required. | Barmlo Construction | {new Date().getFullYear()}
        </Text>
        
      </Page>
    </Document>
  );
}

