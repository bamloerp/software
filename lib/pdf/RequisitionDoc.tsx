// lib/pdf/RequisitionDoc.tsx
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937' },

  // Header
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#166534',
  },
  companyInfo: { alignItems: 'flex-end', flex: 1 },
  companyText: { fontSize: 8, color: '#166534', marginBottom: 2 },

  // Title
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
    textAlign: 'right',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Info blocks
  infoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
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
  infoLabel: { fontSize: 8, fontWeight: 'bold', color: '#374151', width: 55 },
  infoValue: { fontSize: 8, color: '#374151', flex: 1 },
  infoCellRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d1d5db' },
  infoCellHeader: {
    flex: 1,
    padding: 4,
    backgroundColor: '#eff6ff',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    alignItems: 'center',
  },
  infoCellHeaderLast: { flex: 1, padding: 4, backgroundColor: '#eff6ff', alignItems: 'center' },
  infoCellValue: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    alignItems: 'center',
  },
  infoCellValueLast: { flex: 1, padding: 4, alignItems: 'center' },

  // Section
  sectionRow: {
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: '#f9fafb',
    padding: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionText: { fontSize: 10, fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingVertical: 4,
    alignItems: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 4,
    alignItems: 'flex-start',
  },

  // Columns
  colDesc: { flexGrow: 1, paddingLeft: 6, paddingRight: 5 },
  colUnit: { width: 60, textAlign: 'center' },
  colQty: { width: 60, textAlign: 'right', paddingRight: 6 },

  th: { fontSize: 8, fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },
  td: { fontSize: 9 },

  // Status
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: 9, fontWeight: 'bold' },

  // Footer
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

export type PdfRequisitionItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  section: string;
};

export type PdfRequisition = {
  id: string;
  refNumber: string;
  status: string;
  createdAt: string;
  submittedByName: string | null;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  projectName: string;
  quoteNumber: string;
  customerId: string;
  validUntil: string;
};

export default function RequisitionDoc({
  requisition,
  items,
  logoData,
}: {
  requisition: PdfRequisition;
  items: PdfRequisitionItem[];
  logoData?: string;
}) {
  // Group items by section
  const groups = new Map<string, PdfRequisitionItem[]>();
  for (const item of items) {
    const section = item.section || 'Uncategorized';
    const bucket = groups.get(section) || [];
    bucket.push(item);
    groups.set(section, bucket);
  }

  const generatedDate = new Date().toLocaleDateString('en-GB');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={{ width: 180 }}>
            {logoData && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoData} style={{ width: 190, height: 112, objectFit: 'contain' }} />
            )}
          </View>
          <View style={styles.companyInfo}>
            <Text style={[styles.companyText, { fontWeight: 'bold' }]}>BARMLO CONSTRUCTION</Text>
            <Text style={styles.companyText}>3294, Light Industry, Mberengwa</Text>
            <Text style={styles.companyText}>info@barmlo.co.zw</Text>
            <Text style={styles.companyText}>www.barmlo.co.zw</Text>
            <Text style={styles.title}>Purchase Requisition</Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.infoContainer}>
          {/* Customer Info */}
          <View style={[styles.infoBlock, styles.infoBox]}>
            <View style={styles.infoBoxHeader}>
              <Text style={styles.infoBoxHeaderText}>Customer Info</Text>
            </View>
            <View style={{ padding: 6 }}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>{String(requisition.customerName)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Address:</Text>
                <Text style={styles.infoValue}>{String(requisition.customerAddress)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone:</Text>
                <Text style={styles.infoValue}>{String(requisition.customerPhone)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ref:</Text>
                <Text style={styles.infoValue}>{String(requisition.projectName)}</Text>
              </View>
            </View>
          </View>

          {/* Quote / Requisition Details */}
          <View style={[styles.infoBlock, styles.infoBox]}>
            <View style={styles.infoCellRow}>
              <View style={styles.infoCellHeader}>
                <Text style={styles.infoBoxHeaderText}>Quote #</Text>
              </View>
              <View style={styles.infoCellHeaderLast}>
                <Text style={styles.infoBoxHeaderText}>Date</Text>
              </View>
            </View>
            <View style={styles.infoCellRow}>
              <View style={styles.infoCellValue}>
                <Text style={{ fontSize: 8 }}>{String(requisition.quoteNumber)}</Text>
              </View>
              <View style={styles.infoCellValueLast}>
                <Text style={{ fontSize: 8 }}>{String(requisition.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.infoCellRow}>
              <View style={styles.infoCellHeader}>
                <Text style={styles.infoBoxHeaderText}>Customer ID</Text>
              </View>
              <View style={styles.infoCellHeaderLast}>
                <Text style={styles.infoBoxHeaderText}>Valid Until</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={styles.infoCellValue}>
                <Text style={{ fontSize: 8 }}>{String(requisition.customerId)}</Text>
              </View>
              <View style={styles.infoCellValueLast}>
                <Text style={{ fontSize: 8 }}>{String(requisition.validUntil)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Status */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#374151', marginRight: 6 }}>
            {'Status: '}
          </Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  requisition.status === 'DRAFT'
                    ? '#fef3c7'
                    : requisition.status === 'SUBMITTED'
                      ? '#dbeafe'
                      : '#dcfce7',
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    requisition.status === 'DRAFT'
                      ? '#92400e'
                      : requisition.status === 'SUBMITTED'
                        ? '#1e40af'
                        : '#166534',
                },
              ]}
            >
              {String(requisition.status)}
            </Text>
          </View>
          {requisition.submittedByName ? (
            <Text style={{ fontSize: 8, color: '#6b7280', marginLeft: 6 }}>
              {'Submitted by: '}
              {String(requisition.submittedByName)}
            </Text>
          ) : null}
        </View>

        {/* Items Table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colDesc, styles.th]}>Description</Text>
          <Text style={[styles.colUnit, styles.th]}>Unit</Text>
          <Text style={[styles.colQty, styles.th]}>Qty</Text>
        </View>

        {[...groups.entries()].map(([section, sectionItems]) => (
          <View key={section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionText}>{String(section)}</Text>
            </View>
            {sectionItems.map((item) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={[styles.colDesc, styles.td]}>{String(item.description)}</Text>
                <Text style={[styles.colUnit, styles.td]}>{String(item.unit)}</Text>
                <Text style={[styles.colQty, styles.td]}>{String(item.quantity)}</Text>
              </View>
            ))}
          </View>
        ))}

        {items.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: '#6b7280' }}>No items in this requisition.</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          {'Requisition Ref: '}
          {String(requisition.refNumber)}
          {' | Generated '}
          {generatedDate}
        </Text>
      </Page>
    </Document>
  );
}
