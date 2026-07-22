import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getEmployees } from './actions';
import ClientEmployeeList from './ClientEmployeeList';
import EmployeeTableToolbar from './components/EmployeeTableToolbar';
import TablePagination from '@/components/ui/table-pagination';

const DEFAULT_PAGE_SIZE = 20;

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; pageSize?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !['HUMAN_RESOURCE', 'ADMIN', 'PROJECT_COORDINATOR', 'PROJECT_OPERATIONS_OFFICER'].includes(user.role || '')) {
    redirect('/dashboard');
  }

  const { q: query, status, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const page = parseInt(pageParam || '1', 10);
  const pageSize = parseInt(pageSizeParam || String(DEFAULT_PAGE_SIZE), 10);

  const { items: employees, total } = await getEmployees({
      query,
      status,
      page,
      pageSize
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Employees</h1>
        <Link
          href="/reports/employee-performance"
          className="inline-flex items-center rounded-lg bg-barmlo-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Performance Report
        </Link>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200 mb-6">
         <EmployeeTableToolbar />
         <ClientEmployeeList employees={employees} canManage={['HUMAN_RESOURCE', 'ADMIN'].includes(user.role || '')} />
         <div className="mt-4 border-t pt-4">
            <TablePagination total={total} currentPage={page} pageSize={pageSize} />
         </div>
      </div>
    </div>
  );
}
