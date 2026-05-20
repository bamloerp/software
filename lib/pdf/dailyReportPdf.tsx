import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { getDailyReportData } from '@/app/(protected)/projects/actions';
import TestDoc from './TestDoc';
import DailyProjectReport from './DailyProjectReport';
import fs from 'fs';
import path from 'path';
import { BARMLO_LOGO_BASE64 } from './logo';

export async function generateDailyReportPdf(projectId: string, date: string) {
    console.log('Generating PDF for', projectId, date);
    
    // Fetch Data
    const data = await getDailyReportData(projectId, date);
    if (!data || !data.project) {
        throw new Error('Report data not found');
    }

    // Read logo for Daily Report
    let logoData: string = BARMLO_LOGO_BASE64;
    try {
        const logoPath = path.join(process.cwd(), 'public', 'Barmlo Logo 2026.png');
        if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            logoData = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        }
    } catch (e) {
        console.error('Failed to read logo for Daily Report', e);
    }

    // Toggle here to switch between Test and Real report
    const USE_TEST_DOC = false; 

    let element;
    if (USE_TEST_DOC) {
         element = <TestDoc date={date} />;
    } else {
         element = <DailyProjectReport data={data} logoData={logoData} />;
    }

    // Generate Buffer
    const instance = pdf(element);
    const buffer = await instance.toBuffer();
    const cleanName = data.project.name.replace(/\s+/g, '_');

    return {
        buffer,
        filename: `Daily_Report_${cleanName}_${date}.pdf`
    };
}
