import React from 'react';
import Image from 'next/image';

type ReportPrintHeaderProps = {
  title: string;
  subTitle?: string;
  hideTinVendor?: boolean;
  centerTitle?: boolean;
};

export default function ReportPrintHeader({
  title,
  subTitle,
  hideTinVendor,
  centerTitle,
}: ReportPrintHeaderProps) {
  return (
    <div className="mb-8 border-b-2 border-orange-500 pb-6 print:mb-4 print:pb-4">
      <div className="flex flex-col md:flex-row justify-between items-start">
        <div className="flex flex-col items-start">
          <div className="relative mb-2 h-32 w-72 max-w-full">
            <Image
              src="/Barmlo%20Logo%202026.png"
              alt="Barmlo Logo"
              fill
              className="object-contain object-left"
            />
          </div>

          {!hideTinVendor && (
            <div className="mt-4 text-sm font-bold text-gray-700">
              <p>TIN NO: 2000873176</p>
              <p>VENDOR NO: 718689</p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end text-right gap-1 text-sm text-blue-900 mt-4 md:mt-0">
          <p className="font-bold text-lg">+263782939250, +263787555007</p>
          <p className="font-bold italic">132 J Chinamano Ave Harare</p>
          <p className="font-bold italic">info@barmlo.co.zw</p>
          <p className="font-bold italic">www.barmlo.co.zw</p>

          {!centerTitle && (
            <div className="mt-8 text-right">
              <h1 className="text-3xl font-bold text-gray-500 uppercase tracking-widest">
                {title}
              </h1>
              {subTitle && (
                <p className="text-sm text-gray-500 uppercase tracking-wide mt-1">
                  {subTitle}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {centerTitle && (
        <div className="mt-8 text-center">
          <h1 className="text-3xl font-bold text-gray-500 uppercase tracking-widest">
            {title}
          </h1>
          {subTitle && (
            <p className="text-sm text-gray-500 uppercase tracking-wide mt-1">
              {subTitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
