import { getCurrentUser } from '@/lib/auth';
import { SidebarNavigation } from './SidebarNavigation';

const BASE: { label:string; href:string; icon:string; roles?: string[] }[] = [
  { label: 'My Quotes', href: '/quotes', icon: 'quote', roles: ['QS','SENIOR_QS','SALES','ADMIN'] },
  { label: 'Projects', href: '/projects', icon: 'folder', roles: ['ADMIN','PROJECT_OPERATIONS_OFFICER','PROCUREMENT','ACCOUNTS','CASHIER','ACCOUNTING_OFFICER','ACCOUNTING_AUDITOR','ACCOUNTING_CLERK','GENERAL_MANAGER','MANAGING_DIRECTOR'] },
  { label: 'New Quote', href: '/quotes/new', icon: 'quote', roles: ['QS','SENIOR_QS','ADMIN'] },
  { label: 'Requisitions', href: '/procurement/requisitions', icon: 'list', roles: ['PROJECT_OPERATIONS_OFFICER','PROJECT_COORDINATOR','PROCUREMENT','ADMIN'] },
  { label: 'Purchase Orders', href: '/accounts/po', icon: 'list', roles: ['ACCOUNTS','ACCOUNTING_CLERK','ACCOUNTING_OFFICER','ADMIN'] },
  { label: 'Dispatches', href: '/dispatches', icon: 'truck', roles: ['PROJECT_OPERATIONS_OFFICER','SECURITY','ADMIN'] },
  { label: 'Funds', href: '/funds', icon: 'bank', roles: ['ACCOUNTS','ACCOUNTING_CLERK','ACCOUNTING_OFFICER','ACCOUNTING_AUDITOR','ADMIN'] },
  { label: 'Goods Receiving', href: '/accounts?tab=receipts', icon: 'clipboard-check', roles: ['ACCOUNTS', 'ACCOUNTING_OFFICER', 'ADMIN'] },
  { label: 'Inventory', href: '/inventory', icon: 'boxes', roles: ['PROCUREMENT','PROJECT_OPERATIONS_OFFICER','ADMIN'] },
  { label: 'Audit Logs', href: '/audit-logs', icon: 'list', roles: ['ADMIN'] },
  { label: 'Employees', href: '/employees', icon: 'list', roles: ['ADMIN','MANAGING_DIRECTOR','HUMAN_RESOURCE'] },
  { label: 'Add Employee', href: '/employees/add', icon: 'plus', roles: ['ADMIN','MANAGING_DIRECTOR','HUMAN_RESOURCE'] },
  { label: 'Awaiting Delivery', href: '/dispatches?status=ARRIVED', icon: 'truck', roles: ['PROJECT_OPERATIONS_OFFICER','ADMIN', 'FOREMAN', 'PROJECT_COORDINATOR', 'DRIVER'] },
  { label: 'Rates', href: '/rates', icon: 'currency', roles: ['SENIOR_QS','ADMIN'] },
  // Driver specific
  { label: 'My Pickups', href: '/dispatches?status=DISPATCHED&driver=me', icon: 'truck', roles: ['DRIVER'] },
  { label: 'Deliveries', href: '/dispatches?status=IN_TRANSIT&driver=me', icon: 'map', roles: ['DRIVER'] },
  { label: 'Settled', href: '/dispatches?status=DELIVERED&driver=me', icon: 'check', roles: ['DRIVER'] },
];

export default async function Sidebar() {
  const me = await getCurrentUser();
  const role = (me?.role ?? 'VIEWER') as string;
  let pages = BASE.filter(p => !p.roles || p.roles.includes(role));

  // HR sees Employees and Add Employee
  if (role === 'HUMAN_RESOURCE') {
    pages = BASE.filter(p => p.label === 'Employees' || p.label === 'Add Employee');
  }

  // if (role === 'DRIVER') {
  //   pages = pages.map(p => p.label === 'Dispatches' ? { ...p, label: 'My Pickups' } : p);
  // }

  return <SidebarNavigation links={pages} />;
}
