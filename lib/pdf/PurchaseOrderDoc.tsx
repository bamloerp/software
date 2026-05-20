// lib/pdf/PurchaseOrderDoc.tsx
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';

const s = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#166534',
  },
  companyInfo: { alignItems: 'flex-end', flex: 1 },
  companyText: { fontSize: 8, color: '#166534', marginBottom: 2 },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
    textAlign: 'right',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  infoBlock: { width: '48%' },
  infoBox: { borderWidth: 1, borderColor: '#d1d5db' },
  infoBoxHeader: {
    backgroundColor: '#eff6ff',
    padding: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  infoBoxHeaderText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#1f2937',
    textTransform: 'uppercase',
  },
  infoRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6 },
  infoLabel: { fontSize: 8, fontWeight: 'bold', color: '#374151', width: 65 },
  infoValue: { fontSize: 8, color: '#374151', flex: 1 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  colDesc: { flex: 1 },
  colUnit: { width: 40, textAlign: 'center' },
  colQty: { width: 40, textAlign: 'right' },
  colPrice: { width: 65, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  th: { fontSize: 8, fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },
  td: { fontSize: 9 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 8, fontWeight: 'bold' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  summaryLabel: { fontSize: 9, fontWeight: 'bold', marginRight: 10 },
  summaryValue: { fontSize: 9, fontWeight: 'bold', width: 70, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
});

const formatMoney = (minor: number) => {
  const val = minor / 100;
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export type PdfPOItem = {
  id: string;
  description: string;
  unit: string;
  qty: number;
  unitPriceMinor: number;
  totalMinor: number;
};

export type PdfPurchaseOrder = {
  id: string;
  status: string;
  createdAt: string;
  createdByName: string;
  vendorName: string;
  vendorPhone: string;
  projectName: string;
  customerName: string;
  quoteNumber: string;
  totalMinor: number;
  note: string;
};

export default function PurchaseOrderDoc({
  po,
  items,
  logoData,
}: {
  po: PdfPurchaseOrder;
  items: PdfPOItem[];
  logoData?: string;
}) {
  const generatedDate = new Date().toLocaleDateString('en-GB');
  const statusColors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: '#f3f4f6', text: '#374151' },
    SUBMITTED: { bg: '#dbeafe', text: '#1e40af' },
    APPROVED: { bg: '#dcfce7', text: '#166534' },
    REJECTED: { bg: '#fee2e2', text: '#991b1b' },
    PURCHASED: { bg: '#e9d5ff', text: '#6b21a8' },
    RECEIVED: { bg: '#dcfce7', text: '#166534' },
    COMPLETE: { bg: '#dcfce7', text: '#166534' },
  };
  const sc = statusColors[po.status] || statusColors.DRAFT;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ width: 180 }}>
            {logoData && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoData} style={{ width: 190, height: 112, objectFit: 'contain' }} />
            )}
          </View>
          <View style={s.companyInfo}>
            <Text style={[s.companyText, { fontWeight: 'bold' }]}>BARMLO CONSTRUCTION</Text>
            <Text style={s.companyText}>3294, Light Industry, Mberengwa</Text>
            <Text style={s.companyText}>info@barmlo.co.zw</Text>
            <Text style={s.companyText}>www.barmlo.co.zw</Text>
            <Text style={s.title}>Purchase Order</Text>
          </View>
        </View>

        {/* Info */}
        <View style={s.infoContainer}>
          <View style={[s.infoBlock, s.infoBox]}>
            <View style={s.infoBoxHeader}>
              <Text style={s.infoBoxHeaderText}>Vendor Info</Text>
            </View>
            <View style={{ padding: 6 }}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Vendor:</Text>
                <Text style={s.infoValue}>{String(po.vendorName)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Phone:</Text>
                <Text style={s.infoValue}>{String(po.vendorPhone || 'N/A')}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Customer:</Text>
                <Text style={s.infoValue}>{String(po.customerName)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Project:</Text>
                <Text style={s.infoValue}>{String(po.projectName)}</Text>
              </View>
            </View>
          </View>

          <View style={[s.infoBlock, s.infoBox]}>
            <View style={s.infoBoxHeader}>
              <Text style={s.infoBoxHeaderText}>Order Details</Text>
            </View>
            <View style={{ padding: 6 }}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>PO ID:</Text>
                <Text style={s.infoValue}>{String(po.id.slice(0, 12))}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Quote #:</Text>
                <Text style={s.infoValue}>{String(po.quoteNumber)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Date:</Text>
                <Text style={s.infoValue}>{String(po.createdAt)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Status:</Text>
                <View style={[s.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[s.badgeText, { color: sc.text }]}>{String(po.status)}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Items Table */}
        <View style={s.tableHeader}>
          <Text style={[s.colDesc, s.th]}>Description</Text>
          <Text style={[s.colUnit, s.th]}>Unit</Text>
          <Text style={[s.colQty, s.th]}>Qty</Text>
          <Text style={[s.colPrice, s.th]}>Unit Price</Text>
          <Text style={[s.colTotal, s.th]}>Total</Text>
        </View>

        {items.map((item) => (
          <View key={item.id} style={s.tableRow}>
            <Text style={[s.colDesc, s.td]}>{String(item.description)}</Text>
            <Text style={[s.colUnit, s.td]}>{String(item.unit)}</Text>
            <Text style={[s.colQty, s.td]}>{String(item.qty)}</Text>
            <Text style={[s.colPrice, s.td]}>{formatMoney(item.unitPriceMinor)}</Text>
            <Text style={[s.colTotal, s.td]}>{formatMoney(item.totalMinor)}</Text>
          </View>
        ))}

        {items.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: '#6b7280' }}>No items.</Text>
          </View>
        )}

        {/* Total */}
        <View style={{ borderTopWidth: 2, borderTopColor: '#166534', marginTop: 8 }}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>TOTAL:</Text>
            <Text style={[s.summaryValue, { color: '#166534' }]}>{formatMoney(po.totalMinor)}</Text>
          </View>
        </View>

        {/* Note */}
        {po.note ? (
          <View
            style={{
              marginTop: 12,
              padding: 8,
              backgroundColor: '#f9fafb',
              borderRadius: 4,
              borderWidth: 1,
              borderColor: '#e5e7eb',
            }}
          >
            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#374151', marginBottom: 3 }}>
              Note:
            </Text>
            <Text style={{ fontSize: 8, color: '#4b5563' }}>{String(po.note)}</Text>
          </View>
        ) : null}

        <Text style={s.footer}>
          {'PO Ref: '}
          {String(po.id.slice(0, 12))}
          {' | Generated '}
          {generatedDate}
        </Text>
      </Page>
    </Document>
  );
}
