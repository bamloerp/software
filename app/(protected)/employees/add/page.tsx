'use server';

import { getCurrentUser } from '@/lib/auth';
import { addEmployee } from '../actions';
import { redirect } from 'next/navigation';
import { UserIcon, EnvelopeIcon, PhoneIcon, BriefcaseIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';

function canManage(role: string | null | undefined) {
  return ['ADMIN', 'MANAGING_DIRECTOR', 'PROJECT_OPERATIONS_OFFICER', 'HUMAN_RESOURCE'].includes(role || '');
}

export default async function AddEmployeePage() {
  const me = await getCurrentUser();
  if (!me) return <div className="p-6">Auth required</div>;
  if (!canManage(me.role)) return <div className="p-6">Not authorized</div>;

  async function add(formData: FormData) {
    'use server';
    await addEmployee(formData);
    redirect('/employees');
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
          <UserIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add Employee</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Creating an employee also creates a user account with password: Password01</p>
        </div>
      </div>

      <form action={add} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-gray-800 dark:border-gray-700 transition-all hover:shadow-md">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">First Name</label>
            <div className="relative">
              <input
                name="givenName"
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
                placeholder="John"
                required
              />
              <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Last Name</label>
            <div className="relative">
              <input
                name="surname"
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400"
                placeholder="Doe"
              />
              <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email Address</label>
            <div className="relative">
              <input 
                name="email" 
                type="email" 
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400" 
                placeholder="john.doe@company.com" 
                required 
              />
              <EnvelopeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Phone Number</label>
            <div className="relative">
              <input 
                name="phone" 
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400" 
                placeholder="+1 (555) 000-0000" 
              />
              <PhoneIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Role / Position</label>
            <div className="relative">
              <select 
                name="role" 
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400 appearance-none" 
                required 
                defaultValue="BUILDER"
              >
                <option value="BUILDER">Builder</option>
                <option value="CARPENTER">Carpenter</option>
                <option value="ASSISTANT">Assistant</option>
                <option value="ELECTRICIAN">Electrician</option>
                <option value="PLUMBER">Plumber</option>
              </select>
              <BriefcaseIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Next of Kin</label>
            <input name="nextOfKin" className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm" placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Next of Kin Contact</label>
            <input name="nextOfKinContact" className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm" placeholder="Phone number" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Office Location</label>
            <div className="relative">
              <input 
                name="office" 
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400" 
                placeholder="e.g., Harare, Bulawayo" 
              />
              <BuildingOfficeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-green-600 px-6 py-2.5 text-white text-sm font-bold hover:bg-green-700 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 active:scale-95"
          >
            Add Employee
          </button>
        </div>
      </form>
    </div>
  );
}
