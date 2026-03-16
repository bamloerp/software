'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDispatch } from '../../dispatch-actions';
import { toast } from 'sonner';

interface DispatchableItem {
  id: string;
  description: string;
  unit: string | null;
  remaining: number;
  estPriceMinor: string;
}

export default function DispatchSelector({ 
  projectId, 
  availableItems,
  drivers = [],
  userRole = ''
}: { 
  projectId: string; 
  availableItems: DispatchableItem[];
  drivers?: Array<{ id: string; name: string | null; email: string | null }>;
  userRole?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<Array<{ id: string; qty: number }>>([]);
  
  // Local inventory tracking to allow continuous batching without refresh
  const [localItems, setLocalItems] = useState(availableItems);
  
  // Driver Allocation
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');

  const showDriverAllocation = userRole !== 'PROJECT_OPERATIONS_OFFICER';

  const getQty = (id: string) => {
    return selectedItems.find(i => i.id === id)?.qty || 0;
  };

  const updateQty = (id: string, qty: number) => {
    const item = localItems.find(i => i.id === id);
    if (!item) return;

    // Ensure qty is within bounds
    const safeQty = isNaN(qty) ? 0 : Math.max(0, Math.min(qty, item.remaining));

    setSelectedItems(prev => {
      const existing = prev.find(i => i.id === id);
      if (safeQty === 0) {
        return prev.filter(i => i.id !== id);
      }
      if (existing) {
        return prev.map(i => i.id === id ? { ...i, qty: safeQty } : i);
      }
      return [...prev, { id, qty: safeQty }];
    });
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      toast.error('Enter a quantity for at least one item');
      return;
    }

    setLoading(true);
    try {
      const items = selectedItems.map(si => {
        const item = availableItems.find(i => i.id === si.id)!;
        return {
          requisitionItemId: item.id,
          description: item.description,
          unit: item.unit,
          qty: si.qty,
          estPriceMinor: item.estPriceMinor
        };
      });

      const res = await createDispatch(projectId, { 
        note, 
        items,
        driverId: selectedDriverId === 'other' ? null : (selectedDriverId || null),
        driverName: selectedDriverId === 'other' ? driverName : (drivers.find(d => d.id === selectedDriverId)?.name || null),
        vehicleReg: vehicleReg || null
      });

      if (res.ok) {
        toast.success(`Dispatch created for ${selectedDriverId ? 'Driver' : 'Draft'}. You can continue batching.`);
        
        // Update local items to reflect what was just dispatched
        setLocalItems(prev => prev.map(item => {
          const dispatched = selectedItems.find(si => si.id === item.id);
          if (dispatched) {
            return { ...item, remaining: item.remaining - dispatched.qty };
          }
          return item;
        }).filter(item => item.remaining > 0)); // Remove items that are finished

        // Reset form for next batch
        setSelectedItems([]);
        setSelectedDriverId('');
        setDriverName('');
        setVehicleReg('');
        setNote('');
        
      } else {
        toast.error(res.error || 'Failed to create dispatch');
      }
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">New Dispatch Tool</h2>
        <button
          onClick={() => router.push('/dispatches')}
          className="text-sm font-bold text-green-600 hover:text-green-700 bg-green-50 px-4 py-2 rounded-lg border border-green-100"
        >
          Finish & View History
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {localItems.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500 text-sm italic">No items currently available for dispatch.</p>
            <p className="text-gray-400 text-xs mt-1">Items become available after they are received via GRN.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">
                    Unit
                  </th>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">
                    Available
                  </th>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-40">
                    Dispatch Qty
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {localItems.map(item => {
                  const currentQty = getQty(item.id);
                  const isSelected = currentQty > 0;
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`transition-colors ${isSelected ? 'bg-green-50/30' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">{item.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{item.unit || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {item.remaining}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.remaining}
                          step="any"
                          value={currentQty || ''}
                          placeholder="0"
                          onChange={(e) => updateQty(item.id, parseFloat(e.target.value))}
                          className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2 border text-center font-bold ${
                            isSelected ? 'bg-white border-green-300 text-green-700' : 'bg-gray-50'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Driver Allocation */}
        {showDriverAllocation && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">
            Driver Allocation
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Select Driver</label>
              <select 
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all text-sm"
              >
                <option value="">-- No Driver (Draft Only) --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name || d.email}</option>
                ))}
                <option value="other">Other / Manual Entry</option>
              </select>
            </div>

            {selectedDriverId === 'other' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Driver Name</label>
                <input 
                  type="text" 
                  placeholder="Full Name"
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all text-sm"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />
              </div>
            )}

            {(selectedDriverId !== '') && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Vehicle Registration</label>
                <input 
                  type="text" 
                  placeholder="Reg No."
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all text-sm"
                  value={vehicleReg}
                  onChange={(e) => setVehicleReg(e.target.value)}
                />
              </div>
            )}
            
            {selectedDriverId && (
              <p className="text-[10px] text-orange-600 font-medium bg-orange-50 p-2 rounded border border-orange-100 italic">
                Note: Assigning a driver will automatically mark the dispatch as "DISPATCHED" and finalize the items.
              </p>
            )}
          </div>
        </div>
        )}

        {/* Note Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">
            Additional Info
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Dispatch Note (Optional)</label>
              <textarea 
                placeholder="e.g. Dispatched to site for Phase 1..." 
                rows={4}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all placeholder:text-gray-400 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4">
        <button 
          onClick={handleSubmit}
          disabled={loading || selectedItems.length === 0}
          className={`
            w-full flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-base font-bold text-white shadow-md transition-all
            ${loading || selectedItems.length === 0
              ? "bg-gray-300 cursor-not-allowed shadow-none"
              : "bg-green-600 hover:bg-green-700 hover:shadow-lg hover:shadow-green-200"
            }
          `}
        >
          {loading ? 'Processing...' : selectedDriverId ? 'Dispatch & Allocate Driver' : 'Create Dispatch Draft'}
        </button>
      </div>
    </div>
  );
}
