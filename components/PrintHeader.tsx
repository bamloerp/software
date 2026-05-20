import { HomeIcon, EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';
import { cn } from '@/lib/utils';

type PrintHeaderProps = {
  className?: string;
  showOnScreen?: boolean;
};

export default function PrintHeader({ className, showOnScreen }: PrintHeaderProps) {
  const base = showOnScreen
    ? 'flex flex-row justify-between items-start mb-8 border-b-2 border-barmlo-blue pb-4 w-full'
    : 'hidden print:flex flex-row justify-between items-start mb-8 border-b-2 border-barmlo-blue pb-4 w-full';

  return (
    <div className={cn(base, className)}>
      <div className="flex flex-col items-center">
        <div className="relative h-32 w-72 max-w-full">
          <Image src="/Barmlo%20Logo%202026.png" alt="Barmlo Logo" fill className="object-contain object-left" />
        </div>
      </div>

      <div className="flex flex-col gap-3 text-sm text-barmlo-blue mt-2">
        <div className="flex items-start gap-3">
          <HomeIcon className="w-5 h-5 text-barmlo-blue mt-1 shrink-0" />
          <span className="font-bold italic">
            3294, Light Industry Mberengwa
            <br />
            Business Center
          </span>
        </div>
        <div className="flex items-center gap-3">
          <EnvelopeIcon className="w-5 h-5 text-barmlo-blue shrink-0" />
          <span className="font-bold italic">info@barmlo.co.zw</span>
        </div>
        <div className="flex items-center gap-3">
          <GlobeAltIcon className="w-5 h-5 text-barmlo-blue shrink-0" />
          <span className="font-bold italic">www.barmlo.co.zw</span>
        </div>
      </div>
    </div>
  );
}
