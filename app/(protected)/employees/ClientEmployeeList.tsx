'use client';

import Link from 'next/link';
import { updateEmployeeStatus } from './actions';

export default function ClientEmployeeList({ employees, canManage }: { employees: any[]; canManage: boolean }) {

  const handleStatusChange = async (id: string, status: string) => {
    await updateEmployeeStatus(id, status);
  };

  return (
    <>
      {canManage && <div className="mb-4">
        <Link
          href="/employees/add"
          className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
        >
          Add Employee
        </Link>
      </div>}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">EC Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next of Kin</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              {canManage && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{emp.givenName} {emp.surname}</div>
                  <div className="text-sm text-gray-500">{emp.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.role}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.ecNumber}</td>
                <td className="px-6 py-4 text-sm text-gray-500"><div>{emp.phone || '—'}</div><div>{emp.office || '—'}</div></td>
                <td className="px-6 py-4 text-sm text-gray-500"><div>{emp.nextOfKin || '—'}</div><div>{emp.nextOfKinContact || '—'}</div></td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${emp.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                      emp.status === 'LEAVE' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'}`}>
                    {emp.status}
                  </span>
                </td>
                {canManage && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <select 
                    value={emp.status} 
                    onChange={(e) => handleStatusChange(emp.id, e.target.value)}
                    className="border border-gray-300 rounded p-1 text-sm"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="LEAVE">Leave</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Full-page Add Employee form is available at /employees/add */}
    </>
  );
}
