'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface ActionResult<T> {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: string;
}

interface DownloadPdfButtonProps {
  className?: string;
  quoteId: string;
  generatePdf: (quoteId: string) => Promise<ActionResult<{ base64: string; filename: string }>>;
  size?: 'default' | 'xs';
  label?: string;
  loadingLabel?: string;
}

export default function DownloadPdfButton({
  className,
  quoteId,
  generatePdf,
  size = 'default',
  label,
  loadingLabel,
}: DownloadPdfButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    try {
      setLoading(true);
      const result = await generatePdf(quoteId);
      
      const isSuccess = result.ok || result.success;
      if (!isSuccess || !result.data) {
        throw new Error(result.error || 'Failed to generate PDF');
      }

      const { base64, filename } = result.data;
      
      // Decode base64 and download
      const binaryString = window.atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = size === 'xs'
    ? 'rounded border border-blue-500 px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20'
    : 'rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 min-w-[200px]';

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-1.5 transition-all ${sizeClasses} ${className || ''} ${loading ? 'opacity-70 cursor-wait' : ''}`}
    >
      {loading ? (
        <span className={`animate-spin rounded-full border-2 border-current border-t-transparent ${size === 'xs' ? 'h-3 w-3' : 'h-5 w-5'}`} />
      ) : (
        <ArrowDownTrayIcon className={size === 'xs' ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
      )}
      {loading
        ? (loadingLabel ?? (size === 'xs' ? '...' : 'Generating...'))
        : (label ?? (size === 'xs' ? 'PDF' : 'Download PDF'))}
    </button>
  );
}
