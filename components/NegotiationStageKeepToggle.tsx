'use client';

import { useState } from 'react';

export default function NegotiationStageKeepToggle({
  stageKey,
  defaultIncluded,
}: {
  stageKey: string;
  defaultIncluded: boolean;
}) {
  const [included, setIncluded] = useState(defaultIncluded);

  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
      <input
        type="checkbox"
        checked={included}
        onChange={(event) => {
          const nextIncluded = event.target.checked;
          setIncluded(nextIncluded);
          window.dispatchEvent(
            new CustomEvent('negotiation-stage-keep-change', {
              detail: { stageKey, included: nextIncluded },
            }),
          );
        }}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span>{included ? 'Keep stage' : 'Delete stage'}</span>
    </label>
  );
}