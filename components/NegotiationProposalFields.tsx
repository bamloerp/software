'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';

export default function NegotiationProposalFields({
  lineId,
  stageKey,
  defaultIncluded,
  defaultRate,
}: {
  lineId: string;
  stageKey: string;
  defaultIncluded: boolean;
  defaultRate: number;
}) {
  const [included, setIncluded] = useState(defaultIncluded);

  useEffect(() => {
    function handleStageKeepChange(event: Event) {
      const detail = (event as CustomEvent<{ stageKey: string; included: boolean }>).detail;
      if (detail?.stageKey === stageKey) {
        setIncluded(detail.included);
      }
    }

    window.addEventListener('negotiation-stage-keep-change', handleStageKeepChange);
    return () => window.removeEventListener('negotiation-stage-keep-change', handleStageKeepChange);
  }, [stageKey]);

  return (
    <>
      <td className="px-3 py-2 text-center align-top">
        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            name={`line-${lineId}-included`}
            checked={included}
            onChange={(event) => setIncluded(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>{included ? 'Keep' : 'Delete'}</span>
        </label>
      </td>
      <td className="px-3 py-2 text-right align-top">
        <input
          type="number"
          name={`line-${lineId}-rate`}
          defaultValue={defaultRate.toFixed(2)}
          min="0"
          step="0.01"
          disabled={!included}
          className={clsx(
            'w-28 rounded border border-gray-300 px-2 py-1 text-right shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            !included && 'cursor-not-allowed bg-gray-100 text-gray-400',
          )}
        />
        {!included && <div className="mt-1 text-[10px] uppercase text-red-500">Delete request</div>}
      </td>
    </>
  );
}