import React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import DailyProjectReport from './DailyProjectReport';

// We reuse the DailyProjectReport Logic but wrap it
// Actually DailyProjectReport renders a <Document>
// We need to extract the <Page> part or refactor DailyProjectReport to export a Page component.
// Let's modify DailyProjectReport to export the Content/Page so we can reuse it here.
// Or we can just copy the styles/structure if it's easier to avoid refactoring now.
// Refactoring is cleaner. Let's check DailyProjectReport content first.
// It exports: const DailyProjectReport = ({ data }) => ( <Document> <Page ...> ... </Page> </Document> );
// I should probably duplicate the Page logic here to avoid breaking the single report if I mess up exports.
// Given the complexity of refactoring in one go without seeing the file, I'll duplicate the Page content logic here 
// but wrapped in a map.

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937' },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#166534',
    paddingBottom: 10,
  },
  titleBlock: {
    flexDirection: 'column',
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#166534',
    textTransform: 'uppercase',
  },
  reportDate: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  logo: {
    width: 150,
    height: 70,
    objectFit: 'contain',
  },
  
  // Project Info
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 5,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 2,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoItem: {
    width: '48%',
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 70,
    fontWeight: 'bold',
    color: '#4b5563',
  },
  value: {
    flex: 1,
    color: '#111827',
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 4,
    marginBottom: 15,
  },
  statItem: {
    marginRight: 20,
  },
  statLabel: {
    fontSize: 8,
    color: '#166534',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#15803d',
  },

  // Table
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    padding: 6,
    alignItems: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    padding: 6,
    minHeight: 30,
  },
  colTask: { width: '25%', paddingRight: 5 },
  colActivity: { width: '30%', paddingRight: 5 },
  colQty: { width: '15%', textAlign: 'right', paddingRight: 5 },
  colStatus: { width: '15%', textAlign: 'center' },
  colWorkers: { width: '15%', paddingLeft: 5 },
  
  // Table Text
  th: { fontSize: 8, fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' },
  td: { fontSize: 9 },
  tdSmall: { fontSize: 8, color: '#6b7280' },
  
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  signatureBlock: {
    width: '40%',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    height: 30,
    marginBottom: 5,
  },
  signatureLabel: {
    fontSize: 8,
    textAlign: 'center',
    color: '#6b7280',
  }
});

interface GlobalDailyReportProps {
  reports: Array<{
    project: {
      name: string;
      number: string | null;
      customer: string | undefined;
      location: string | null;
      status: string;
    };
    date: string;
    tasks: Array<{
      id: string;
      title: string;
      unit: string | null;
      reports: Array<{
        id: string;
        activity: string | null;
        usedQty: number | null;
        reporter: string;
      }>;
      totalUsed: number;
      status: string;
      assignees: Array<{
        givenName: string;
        surname: string | null;
      }>;
    }>;
    stats: {
      totalMen: number;
      totalTasksReported: number;
    };
  }>;
  logoData?: string;
}

const GlobalDailyReport = ({ reports, logoData }: GlobalDailyReportProps) => (
  <Document>
    {reports.map((data, index) => (
        <Page key={index} size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
            <View style={styles.titleBlock}>
            <Text style={styles.reportTitle}>Site Daily Report</Text>
            <Text style={styles.reportDate}>{new Date(data.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            </View>
            {logoData && (
              // eslint-disable-next-line jsx-a11y/alt-text
                <Image 
                src={logoData} 
                style={styles.logo} 
                />
            )}
        </View>

        {/* Project Info */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Project Details</Text>
            <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
                <Text style={styles.label}>Project Name:</Text>
                <Text style={styles.value}>{data.project.name}</Text>
            </View>
            <View style={styles.infoItem}>
                <Text style={styles.label}>Ref Number:</Text>
                <Text style={styles.value}>{data.project.number || '-'}</Text>
            </View>
            <View style={styles.infoItem}>
                <Text style={styles.label}>Client:</Text>
                <Text style={styles.value}>{data.project.customer || '-'}</Text>
            </View>
            <View style={styles.infoItem}>
                <Text style={styles.label}>Location:</Text>
                <Text style={styles.value}>{data.project.location || '-'}</Text>
            </View>
            </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
            <View style={styles.statItem}>
            <Text style={styles.statLabel}>Men on Site</Text>
            <Text style={styles.statValue}>{data.stats.totalMen}</Text>
            </View>
            <View style={styles.statItem}>
            <Text style={styles.statLabel}>Tasks Reported</Text>
            <Text style={styles.statValue}>{data.stats.totalTasksReported}</Text>
            </View>
        </View>

        {/* Tasks Table */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Task Progress</Text>
            <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.colTask]}>Task</Text>
                <Text style={[styles.th, styles.colActivity]}>Activity Log</Text>
                <Text style={[styles.th, styles.colQty]}>Qty Done</Text>
                <Text style={[styles.th, styles.colStatus]}>Status</Text>
                <Text style={[styles.th, styles.colWorkers]}>Assigned</Text>
            </View>

            {/* Table Rows */}
            {data.tasks.map((task) => (
                <View key={task.id} style={styles.tableRow} wrap={false}>
                    <View style={[styles.colTask]}>
                    <Text style={[styles.td, { fontWeight: 'bold' }]}>{task.title}</Text>
                    </View>
                    
                    <View style={[styles.colActivity]}>
                    {task.reports.map((r, i) => (
                        <Text key={i} style={styles.td}>
                            {r.activity || '-'}
                        </Text>
                    ))}
                    </View>

                    <View style={[styles.colQty]}>
                    <Text style={[styles.td, { fontWeight: 'bold' }]}>
                        {task.totalUsed > 0 ? `+${task.totalUsed}` : '-'}
                    </Text>
                    <Text style={styles.tdSmall}>{task.unit}</Text>
                    </View>

                    <View style={[styles.colStatus]}>
                    <Text style={{
                        fontSize: 8, 
                        backgroundColor: task.status === 'DONE' ? '#dcfce7' : task.status === 'ACTIVE' ? '#dbeafe' : '#f3f4f6',
                        paddingHorizontal: 4,
                        paddingVertical: 2,
                        borderRadius: 2,
                        textAlign: 'center'
                    }}>
                        {task.status}
                    </Text>
                    </View>

                    <View style={[styles.colWorkers]}>
                    <Text style={styles.tdSmall}>
                        {task.assignees.map(a => a.givenName).join(', ')}
                    </Text>
                    </View>
                </View>
            ))}
            
            {data.tasks.length === 0 && (
                <View style={{ padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#6b7280', fontSize: 10 }}>No activity reported for this date.</Text>
                </View>
            )}
            </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
            <View style={styles.signatureBlock}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureLabel}>Site Supervisor Signature</Text>
            </View>
            <View style={styles.signatureBlock}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureLabel}>Client Representative Signature</Text>
            </View>
        </View>
        <Text render={({ pageNumber, totalPages }) => (
            `${pageNumber} / ${totalPages}`
        )} fixed style={{ position: 'absolute', bottom: 10, right: 30, fontSize: 8, color: '#9ca3af' }} />
        </Page>
    ))}
  </Document>
);

export default GlobalDailyReport;
