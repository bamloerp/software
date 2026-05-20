// lib/pdf/DispatchDoc.tsx
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
  colUnit: { width: 50, textAlign: 'center' },
  colQty: { width: 50, textAlign: 'right' },
  colStatus: { width: 70, textAlign: 'center' },
  th: { fontSize: 8, fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },
  td: { fontSize: 9 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 8, fontWeight: 'bold' },
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

export type PdfDispatchItem = {
  id: string;
  description: string;
  unit: string;
  qty: number;
  handedOut: boolean;
};

export type PdfDispatch = {
  id: string;
  status: string;
  createdAt: string;
  createdByName: string;
  projectName: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  quoteNumber: string;
  note: string;
};

export default function DispatchDoc({
  dispatch,
  items,
  logoData,
}: {
  dispatch: PdfDispatch;
  items: PdfDispatchItem[];
  logoData?: string;
}) {
  const generatedDate = new Date().toLocaleDateString('en-GB');
  const statusColors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: '#f3f4f6', text: '#374151' },
    SUBMITTED: { bg: '#dbeafe', text: '#1e40af' },
    APPROVED: { bg: '#dcfce7', text: '#166534' },
    DISPATCHED: { bg: '#e0e7ff', text: '#3730a3' },
    IN_TRANSIT: { bg: '#fef3c7', text: '#92400e' },
    DELIVERED: { bg: '#dcfce7', text: '#166534' },
  };
  const sc = statusColors[dispatch.status] || statusColors.DRAFT;

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
            <Text style={s.title}>Dispatch Form</Text>
          </View>
        </View>

        {/* Info */}
        <View style={s.infoContainer}>
          <View style={[s.infoBlock, s.infoBox]}>
            <View style={s.infoBoxHeader}>
              <Text style={s.infoBoxHeaderText}>Customer Info</Text>
            </View>
            <View style={{ padding: 6 }}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Name:</Text>
                <Text style={s.infoValue}>{String(dispatch.customerName)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Address:</Text>
                <Text style={s.infoValue}>{String(dispatch.customerAddress)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Phone:</Text>
                <Text style={s.infoValue}>{String(dispatch.customerPhone)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Project:</Text>
                <Text style={s.infoValue}>{String(dispatch.projectName)}</Text>
              </View>
            </View>
          </View>

          <View style={[s.infoBlock, s.infoBox]}>
            <View style={s.infoBoxHeader}>
              <Text style={s.infoBoxHeaderText}>Dispatch Details</Text>
            </View>
            <View style={{ padding: 6 }}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Quote #:</Text>
                <Text style={s.infoValue}>{String(dispatch.quoteNumber)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Date:</Text>
                <Text style={s.infoValue}>{String(dispatch.createdAt)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Created by:</Text>
                <Text style={s.infoValue}>{String(dispatch.createdByName)}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Status:</Text>
                <View style={[s.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[s.badgeText, { color: sc.text }]}>{String(dispatch.status)}</Text>
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
          <Text style={[s.colStatus, s.th]}>Handed Out</Text>
        </View>

        {items.map((item) => (
          <View key={item.id} style={s.tableRow}>
            <Text style={[s.colDesc, s.td]}>{String(item.description)}</Text>
            <Text style={[s.colUnit, s.td]}>{String(item.unit)}</Text>
            <Text style={[s.colQty, s.td]}>{String(item.qty)}</Text>
            <Text style={[s.colStatus, s.td]}>{item.handedOut ? 'Yes' : '-'}</Text>
          </View>
        ))}

        {items.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: '#6b7280' }}>No items.</Text>
          </View>
        )}

        {/* Note */}
        {dispatch.note ? (
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
            <Text style={{ fontSize: 8, color: '#4b5563' }}>{String(dispatch.note)}</Text>
          </View>
        ) : null}

        <Text style={s.footer}>
          {'Dispatch Ref: '}
          {String(dispatch.id.slice(0, 10))}
          {' | Generated '}
          {generatedDate}
        </Text>
      </Page>
    </Document>
  );
}
