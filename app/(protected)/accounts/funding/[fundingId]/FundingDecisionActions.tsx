'use client';

import { useState } from 'react';
import { approveFunding, postponeFunding } from '@/app/(protected)/accounts/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';

type Props = {
  fundingId: string;
};

export default function FundingDecisionActions({ fundingId }: Props) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [postponing, setPostponing] = useState(false);
  
  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showPostponeModal, setShowPostponeModal] = useState(false);
  
  // Postpone state
  const [postponeDate, setPostponeDate] = useState('');

  const handleApprove = async () => {
    setApproving(true);
    try {
      const result = await approveFunding(fundingId, undefined);
      if (result.success) {
        toast.success('Approved successfully');
        setShowApproveModal(false);
        router.push('/dashboard');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to approve: ' + (e instanceof Error ? e.message : String(e)));
      setApproving(false);
    }
  };

  const handlePostpone = async () => {
    if (!postponeDate) {
        toast.error('Please select a date');
        return;
    }
    const selected = new Date(postponeDate);
    const now = new Date();
    now.setHours(0,0,0,0);
    if (selected <= now) {
        toast.error('Postpone date must be in the future');
        return;
    }

    setPostponing(true);
    try {
      const result = await postponeFunding(fundingId, selected, 'Postponed by user');
      if (result.success) {
        toast.success('Request postponed');
        setShowPostponeModal(false);
        router.push('/dashboard');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to postpone: ' + (e instanceof Error ? e.message : String(e)));
      setPostponing(false);
    }
  };

  return (
    <>
      <div className="flex w-full gap-4">
        <button
          onClick={() => setShowApproveModal(true)}
          disabled={approving || postponing}
          className="flex-1 justify-center rounded bg-emerald-600 px-6 py-3 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-sm"
        >
          <CheckCircleIcon className="h-5 w-5" />
          Approve
        </button>

        <button
          onClick={() => setShowPostponeModal(true)}
          disabled={approving || postponing}
          className="flex-1 justify-center rounded bg-amber-600 px-6 py-3 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-sm"
        >
          <ClockIcon className="h-5 w-5" />
          Postpone
        </button>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200 backdrop-blur-sm">
           <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-6 transform transition-all">
              <div className="flex items-center gap-3">
                 <div className="bg-emerald-100 p-2 rounded-full">
                    <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
                 </div>
                 <h3 className="text-xl font-bold text-gray-900">Confirm Approval</h3>
              </div>
              
              <p className="text-gray-600 text-sm leading-relaxed">
                Are you sure you want to approve this funding request? This action will authorize the disbursement and notify the relevant parties.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                 <button 
                    onClick={() => setShowApproveModal(false)}
                    disabled={approving}
                    className="px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
                 >
                    No
                 </button>
                 <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-2 transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                 >
                    {approving && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    )}
                    Yes
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Postpone Modal */}
      {showPostponeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200 backdrop-blur-sm">
           <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-6 transform transition-all">
              <div className="flex items-center gap-3">
                 <div className="bg-amber-100 p-2 rounded-full">
                    <ClockIcon className="h-6 w-6 text-amber-600" />
                 </div>
                 <h3 className="text-xl font-bold text-gray-900">Postpone Request</h3>
              </div>

              <p className="text-gray-600 text-sm leading-relaxed">
                Please select a future date until which this request will be postponed. The request will be hidden from the active list until then.
              </p>
              
              <div className="space-y-2">
                 <label className="block text-sm font-semibold text-gray-700">Postpone Until</label>
                 <div className="relative">
                    <input 
                        type="date" 
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border transition-colors hover:border-gray-400"
                        min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                        value={postponeDate}
                        onChange={(e) => setPostponeDate(e.target.value)}
                    />
                 </div>
                 <p className="text-xs text-gray-500 flex items-center gap-1">
                    <ClockIcon className="h-3 w-3" />
                    Request reappears automatically after this date
                 </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                 <button 
                    onClick={() => setShowPostponeModal(false)}
                    disabled={postponing}
                    className="px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
                 >
                    Cancel
                 </button>
                 <button
                    onClick={handlePostpone}
                    disabled={postponing}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center gap-2 transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                 >
                    {postponing && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    )}
                    Confirm Postpone
                 </button>
              </div>
           </div>
        </div>
      )}
    </>
  );
}
