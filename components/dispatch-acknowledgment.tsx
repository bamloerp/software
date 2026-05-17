'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dispatch, DispatchItem } from '@prisma/client';
import { acknowledgeDispatch, markDispatchArrived, confirmDispatchPickup } from '@/app/(protected)/projects/actions';
import { CheckCircleIcon, TruckIcon, KeyIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  dispatch: Dispatch & { items: DispatchItem[] };
  userId: string;
  userRole: string; // 'DRIVER' | 'PROJECT_OPERATIONS_OFFICER' | 'ADMIN' etc
};

export default function DispatchAcknowledgment({ dispatch, userId, userRole }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showAckForm, setShowAckForm] = useState(false);
  const [showConfirmPickupModal, setShowConfirmPickupModal] = useState(false);
  const [showMarkArrivedModal, setShowMarkArrivedModal] = useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);

  // Initialize quantities with sent amounts
  useState(() => {
    const initial: Record<string, number> = {};
    dispatch.items.forEach(item => {
      initial[item.id] = item.qty;
    });
    setQuantities(initial);
  });

  const handleConfirmPickup = () => {
    setShowConfirmPickupModal(true);
  };

  const confirmPickupAction = async () => {
    setLoading(true);
    try {
        await confirmDispatchPickup(dispatch.id);
        router.refresh();
        setShowConfirmPickupModal(false);
    } catch (e: any) {
        alert(e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleMarkArrived = () => {
    setShowMarkArrivedModal(true);
  };

  const markArrivedAction = async () => {
    setLoading(true);
    try {
      await markDispatchArrived(dispatch.id);
      router.refresh();
      router.push('/dashboard');
      setShowMarkArrivedModal(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = () => {
    setShowAcknowledgeModal(true);
  };

  const acknowledgeAction = async () => {
    setLoading(true);
    try {
      const items = dispatch.items.map(it => ({
        itemId: it.id,
        acceptedQty: quantities[it.id] ?? it.qty,
        note: notes[it.id]
      }));
      
      await acknowledgeDispatch(dispatch.id, items);
      router.refresh();
      setShowAckForm(false);
      setShowAcknowledgeModal(false);
    } catch (e: any) {
        alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Logic:
  // 1. If Driver & Status = DISPATCHED -> Show "Confirm Pickup" (New Status: IN_TRANSIT)
  // 2. If Driver & Status = IN_TRANSIT -> Show "Mark Arrived" (New Status: ARRIVED)
  // 3. If Site Manager & Status = ARRIVED -> Show "Acknowledge" (New Status: DELIVERED)

  const isDriver = (userRole === 'DRIVER' || userRole === 'ADMIN');
  const isSiteManager = (['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN', 'FOREMAN', 'CLERK'].includes(userRole));

  const canConfirmPickup = isDriver && (dispatch.status === 'DISPATCHED');
  const canMarkArrived = isDriver && (['IN_TRANSIT', 'DISPATCHED'].includes(dispatch.status)); // Allow fallback if pickup skipped? Maybe block it if strict.
  
  const canAcknowledge = isSiteManager && ['ARRIVED', 'IN_TRANSIT'].includes(dispatch.status);

  if (!canConfirmPickup && !canMarkArrived && !canAcknowledge) {
      return null; 
  }

  return (
    <div className="mt-6 w-full bg-white p-6 rounded-lg shadow-sm border border-gray-200">
       {canConfirmPickup && (
         <button 
           onClick={handleConfirmPickup}
           disabled={loading}
           className="w-full flex justify-center items-center gap-2 bg-green-500 text-white px-6 py-6 rounded-2xl hover:bg-green-600 disabled:opacity-50 text-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
         >
            {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
                <CheckCircleIcon className="h-7 w-7" />
            )}
            {loading ? 'Confirming...' : 'Confirm Receipt'}
         </button>
       )}

       {canMarkArrived && !canConfirmPickup && (
         <button 
           onClick={handleMarkArrived}
           disabled={loading}
           className="w-full flex justify-center items-center gap-2 bg-green-500 text-white px-6 py-6 rounded-2xl hover:bg-green-600 disabled:opacity-50 text-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
         >
           <TruckIcon className="h-7 w-7" />
           {loading ? 'Updating...' : 'Mark as Arrived at Site'}
         </button>
       )}

       {canAcknowledge && !showAckForm && (
         <button 
           onClick={() => setShowAckForm(true)}
           className="w-full flex justify-center items-center gap-2 bg-green-500 text-white px-6 py-6 rounded-2xl hover:bg-green-600 text-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
         >
           <CheckCircleIcon className="h-7 w-7" />
           Accept Delivery
         </button>
       )}

       {showAckForm && (
         <div className="mt-4 space-y-4 border-t pt-4">
            <h4 className="font-semibold text-gray-800">Verify Quantities Received</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Received (Editable)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dispatch.items.map(item => {
                    const diff = (quantities[item.id] || 0) - item.qty;
                    return (
                        <tr key={item.id}>
                            <td className="px-3 py-2 text-sm text-gray-900">{item.description}</td>
                            <td className="px-3 py-2 text-sm text-gray-500">{item.qty} {item.unit}</td>
                            <td className="px-3 py-2">
                                <input 
                                  type="number" 
                                  min="0"
                                  max={item.qty}
                                  value={quantities[item.id] || 0}
                                  onChange={(e) => setQuantities({...quantities, [item.id]: Number(e.target.value)})}
                                  className="w-24 rounded border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm"
                                />
                            </td>
                            <td className="px-3 py-2 text-sm font-medium">
                                {diff < 0 ? <span className="text-red-600">{diff} (Return)</span> : <span className="text-green-600">match</span>}
                            </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="grid w-full gap-3 sm:grid-cols-2">
                <button 
                  onClick={() => setShowAckForm(false)}
                  className="w-full px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAcknowledge}
                  disabled={loading}
                  className="w-full px-4 py-3 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Confirm & Sign'}
                </button>
              </div>
            </div>
         </div>
       )}

      <AnimatePresence>
        {showConfirmPickupModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                onClick={() => !loading && setShowConfirmPickupModal(false)}
            />
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md z-10 overflow-hidden"
            >
                <div className="flex flex-col items-center text-center">
                    <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center mb-4">
                        <ExclamationTriangleIcon className="h-6 w-6 text-orange-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Pickup</h3>
                    <p className="text-gray-500 mb-6">
                        Are you sure you have picked up all items and are ready to leave? This action cannot be undone.
                    </p>
                    <div className="flex gap-3 w-full">
                        <button
                            onClick={() => setShowConfirmPickupModal(false)}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            No
                        </button>
                        <button
                            onClick={confirmPickupAction}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading && (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            )}
                            {loading ? 'Confirming...' : 'Yes'}
                        </button>
                    </div>
                </div>
            </motion.div>
            </div>
        )}
       </AnimatePresence>

       <AnimatePresence>
         {showMarkArrivedModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                 onClick={() => !loading && setShowMarkArrivedModal(false)}
             />
             <motion.div
                 initial={{ scale: 0.95, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 exit={{ scale: 0.95, opacity: 0 }}
                 className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md z-10 overflow-hidden"
             >
                 <div className="flex flex-col items-center text-center">
                     <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                         <TruckIcon className="h-6 w-6 text-blue-600" />
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Arrival</h3>
                     <p className="text-gray-500 mb-6">
                         Are you sure you have arrived at the site? This will notify the site manager that the delivery is ready for inspection.
                     </p>
                     <div className="flex gap-3 w-full">
                         <button
                             onClick={() => setShowMarkArrivedModal(false)}
                             disabled={loading}
                             className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                         >
                             No
                         </button>
                         <button
                            onClick={markArrivedAction}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                             {loading && (
                                 <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                             )}
                             {loading ? 'Updating...' : 'Yes'}
                         </button>
                     </div>
                 </div>
             </motion.div>
             </div>
         )}
       </AnimatePresence>

       <AnimatePresence>
         {showAcknowledgeModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                 onClick={() => !loading && setShowAcknowledgeModal(false)}
             />
             <motion.div
                 initial={{ scale: 0.95, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 exit={{ scale: 0.95, opacity: 0 }}
                 className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md z-10 overflow-hidden"
             >
                 <div className="flex flex-col items-center text-center">
                     <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                         <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 mb-2">Finalize Delivery</h3>
                     <p className="text-gray-500 mb-6">
                         Confirm receipt of these items? Any missing items flagged in the table will be recorded.
                     </p>
                     <div className="flex gap-3 w-full">
                         <button
                             onClick={() => setShowAcknowledgeModal(false)}
                             disabled={loading}
                             className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                         >
                             No
                         </button>
                         <button
                            onClick={acknowledgeAction}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                             {loading && (
                                 <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                             )}
                             {loading ? 'Processing...' : 'Yes'}
                         </button>
                     </div>
                 </div>
             </motion.div>
             </div>
         )}
       </AnimatePresence>
     </div>
   );
}
