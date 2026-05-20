import React from 'react';
import Image from 'next/image';
import { Customer, Project } from '@prisma/client';

type PurchaseOrderHeaderProps = {
  customer: Partial<Customer> & { displayName?: string | null };
  project?: Partial<Project> | null;
  requisition: {
    id: string;
    createdAt: Date;
    submittedBy?: { name: string | null; email?: string | null } | null;
  };
  title?: string;
  recipientLabel?: string;
  recipientIdLabel?: string;
  recipientId?: string | null;
};

export default function PurchaseOrderHeader({ 
  customer, 
  project, 
  requisition,
  title = 'Purchase Order',
  recipientLabel = 'Customer Info',
  recipientIdLabel = 'Customer ID',
  recipientId
}: PurchaseOrderHeaderProps) {
  // Calculate valid until date (30 days from created at) - or maybe not needed for PO?
  // Usually POs don't have "Valid Until" in the same way Quotes do, but maybe "Delivery Date"?
  // For now, I'll keep it as Created Date + 30 or just hide it.
  // User asked to "Add top details, logo, company details, customer details".
  // I will keep the structure similar to QuoteHeader.
  
  const validUntil = new Date(requisition.createdAt);
  validUntil.setDate(validUntil.getDate() + 30);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:bg-gray-800 dark:border-gray-700 mb-6 print:border-none print:shadow-none print:p-0 print:mb-4">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start mb-8 border-b-2 border-orange-500 pb-6 print:mb-4 print:pb-4">
        <div className="flex flex-col items-start">
          <div className="relative mb-2 h-32 w-72 max-w-full">
            <Image 
              src="/Barmlo%20Logo%202026.png"
              alt="Barmlo Logo" 
              fill 
              className="object-contain object-left" 
            />
          </div>
          
          <div className="mt-6 text-sm font-bold text-gray-700 dark:text-gray-300">
            <p>TIN NO: 2000873176</p>
            <p>VENDOR NO: 718689</p>
          </div>
        </div>

        <div className="flex flex-col items-end text-right gap-1 text-sm text-blue-900 dark:text-blue-200 mt-4 md:mt-0">
          <p className="font-bold text-lg">+263782939250, +263787555007</p>
          <p className="font-bold italic">132 J Chinamano Ave Harare</p>
          <p className="font-bold italic">info@barmlo.co.zw</p>
          <p className="font-bold italic">www.barmlo.co.zw</p>
          
          <h1 className="text-3xl font-bold text-gray-500 mt-8 uppercase tracking-widest">{title}</h1>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Customer Info Box */}
        <div className="border border-gray-300 dark:border-gray-600">
          <div className="bg-blue-50 dark:bg-blue-900/30 p-2 border-b border-gray-300 dark:border-gray-600">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 uppercase text-sm">{recipientLabel}</h3>
          </div>
          <div className="p-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="font-bold">Name:</span>
              <span>{customer.displayName || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="font-bold">Address:</span>
              <span>{customer.city || (customer.addressJson as any)?.city || (customer.addressJson as any)?.address || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="font-bold">Phone:</span>
              <span>{customer.phone || customer.email || 'N/A'}</span>
            </div>
            {project?.name && (
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <span className="font-bold">Ref:</span>
                <span className="uppercase">{project.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* PO Details Box */}
        <div className="border border-gray-300 dark:border-gray-600">
          <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-center font-bold text-gray-800 dark:text-gray-100 uppercase text-sm border-r border-gray-300 dark:border-gray-600">
              PO #
            </div>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-center font-bold text-gray-800 dark:text-gray-100 uppercase text-sm">
              Date
            </div>
          </div>
          <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
            <div className="p-2 text-center text-sm text-gray-700 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600">
              {requisition.id.slice(0, 8).toUpperCase()}
            </div>
            <div className="p-2 text-center text-sm text-gray-700 dark:text-gray-300">
              {requisition.createdAt.toLocaleDateString('en-GB')}
            </div>
          </div>
          <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-center font-bold text-gray-800 dark:text-gray-100 uppercase text-sm border-r border-gray-300 dark:border-gray-600">
              {recipientIdLabel}
            </div>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-center font-bold text-gray-800 dark:text-gray-100 uppercase text-sm">
              Submitted By
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-2 text-center text-sm text-gray-700 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600">
              {recipientId || (customer.id ? customer.id.slice(0, 8) : 'N/A')}
            </div>
            <div className="p-2 text-center text-sm text-gray-700 dark:text-gray-300">
              {requisition.submittedBy?.name || requisition.submittedBy?.email || 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
