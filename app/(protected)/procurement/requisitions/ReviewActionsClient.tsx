'use client';

import { useState } from 'react';
import { toast } from 'sonner';

type Props = {
  reviewFormId: string;
  sendForReviewAction: (fd: FormData) => Promise<void>;
};

export default function ReviewActionsClient({ reviewFormId, sendForReviewAction }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  const handleInitialUnsubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setPendingFormData(new FormData(form));
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    if (!pendingFormData) return;
    setShowConfirm(false);
    setIsLoading(true);
    try {
      await sendForReviewAction(pendingFormData);
      toast.success('Requisition sent for review');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send for review');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <form
        id={reviewFormId}
        onSubmit={handleInitialUnsubmit}
        className="flex items-center gap-3"
      >
        <span>
          Items are marked for review. Send them to Senior Procurement for approval.
        </span>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {isLoading ? 'Sending...' : 'Send to Senior Procurement'}
        </button>
      </form>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
            onClick={() => setShowConfirm(false)}
          ></div>

          {/* Modal Panel */}
          <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  Send for Senior Procurement Review
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Are you sure you want to send these items for review?
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-gray-500 space-y-1">
                    <li>Items will be removed from this requisition.</li>
                    <li>A new requisition will be created for Senior Procurement approval.</li>
                    <li>The approved funding amount for this requisition will be adjusted naturally.</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                className="inline-flex w-full justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 sm:ml-3 sm:w-auto"
                onClick={confirmSend}
              >
                Yes
              </button>
              <button
                type="button"
                className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                onClick={() => setShowConfirm(false)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
