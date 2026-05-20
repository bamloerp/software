import React from 'react';
import Image from 'next/image';

interface DailyReportDocProps {
  data: {
    project: {
      name: string;
      number: string | null;
      customer: string | undefined;
      location: string | null;
      status: string;
    };
    date: string;
    tasks: Array<{
      id: string;
      title: string;
      unit: string | null;
      reports: Array<{
        id: string;
        activity: string | null;
        usedQty: number | null;
        reporter: string;
      }>;
      totalUsed: number;
      status: string;
      assignees: Array<{
        givenName: string;
        surname: string | null;
      }>;
    }>;
    stats: {
      totalMen: number;
      totalTasksReported: number;
    };
  };
}

export function DailyProjectReportView({ data }: DailyReportDocProps) {
  const formattedDate = new Date(data.date).toLocaleDateString(undefined, { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="bg-white p-8 max-w-4xl mx-auto print:p-0 print:max-w-none text-gray-800 font-sans text-sm">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 border-b-2 border-emerald-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-800 uppercase tracking-wide">Site Daily Report</h1>
          <p className="text-gray-500 mt-1">{formattedDate}</p>
        </div>
        <div className="relative h-24 w-52">
          <Image 
            src="/Barmlo%20Logo%202026.png"
            alt="Barmlo Logo"
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* Project Info */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-emerald-800 uppercase border-b border-gray-200 pb-1 mb-3">Project Details</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <div className="flex">
            <span className="w-24 font-bold text-gray-600">Project Name:</span>
            <span className="flex-1">{data.project.name || '-'}</span>
          </div>
          <div className="flex">
            <span className="w-24 font-bold text-gray-600">Ref Number:</span>
            <span className="flex-1">{data.project.number || '-'}</span>
          </div>
          <div className="flex">
            <span className="w-24 font-bold text-gray-600">Client:</span>
            <span className="flex-1">{data.project.customer || '-'}</span>
          </div>
          <div className="flex">
            <span className="w-24 font-bold text-gray-600">Location:</span>
            <span className="flex-1">{data.project.location || '-'}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-8 bg-green-50 p-4 rounded-lg mb-8 print:bg-transparent print:border print:border-green-100">
        <div>
          <span className="block text-xs font-bold text-emerald-800 uppercase tracking-wider">Men on Site</span>
          <span className="block text-xl font-bold text-emerald-900">{data.stats.totalMen}</span>
        </div>
        <div>
          <span className="block text-xs font-bold text-emerald-800 uppercase tracking-wider">Tasks Reported</span>
          <span className="block text-xl font-bold text-emerald-900">{data.stats.totalTasksReported}</span>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-emerald-800 uppercase border-b border-gray-200 pb-1 mb-3">Task Progress</h2>
        <div className="min-w-full divide-y divide-gray-200 border-b border-gray-200">
          <div className="flex bg-gray-100 py-2 px-2 text-xs font-bold text-gray-700 uppercase tracking-wider print:bg-gray-50">
            <div className="w-1/4">Task</div>
            <div className="w-1/3">Activity Log</div>
            <div className="w-1/6 text-right">Qty Done</div>
            <div className="w-1/6 text-center">Status</div>
            <div className="w-1/6 pl-2">Assigned</div>
          </div>

          {data.tasks.map((task) => (
            <div key={task.id} className="flex py-3 px-2 text-xs group hover:bg-gray-50 print:hover:bg-transparent">
              <div className="w-1/4 font-semibold pr-2">{task.title}</div>
              
              <div className="w-1/3 pr-2 text-gray-600">
                {task.reports.map((r, i) => (
                  <div key={i} className="mb-1 last:mb-0">{r.activity || '-'}</div>
                ))}
              </div>

              <div className="w-1/6 text-right pr-2">
                 <span className="font-semibold">{task.totalUsed > 0 ? `+${task.totalUsed}` : '-'}</span>
                 <span className="text-gray-500 ml-1">{task.unit}</span>
              </div>

              <div className="w-1/6 text-center px-1">
                 <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border
                   ${task.status === 'DONE' ? 'bg-green-100 text-green-800 border-green-200' : 
                     task.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                     'bg-gray-100 text-gray-800 border-gray-200'}`}>
                   {task.status}
                 </span>
              </div>

              <div className="w-1/6 pl-2 text-gray-600">
                {task.assignees.map(a => a.givenName).join(', ')}
              </div>
            </div>
          ))}

          {data.tasks.length === 0 && (
            <div className="py-8 text-center text-gray-500 italic">No activity reported for this date.</div>
          )}
        </div>
      </div>

      {/* Footer / Signatures */}
      <div className="mt-16 pt-8 border-t border-gray-200 flex justify-between print:mt-32">
        <div className="w-1/3">
           <div className="border-b border-black h-8 mb-2"></div>
           <div className="text-xs text-center text-gray-500 uppercase">Site Supervisor Signature</div>
        </div>
        <div className="w-1/3">
           <div className="border-b border-black h-8 mb-2"></div>
           <div className="text-xs text-center text-gray-500 uppercase">Client Representative Signature</div>
        </div>
      </div>

      <div className="mt-8 text-center text-[10px] text-gray-400">
        Generated by Barmlo Construction ERP • {new Date().getFullYear()}
      </div>
    </div>
  );
}
