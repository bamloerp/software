'use client';
import Link from 'next/link';
import { usePathname, useSearchParams, useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import type { AuthenticatedUser } from '@/lib/auth';
import type { QuoteStatus } from '@/lib/workflow';
import { USER_ROLES } from '@/lib/workflow';
import Image from 'next/image';

type NavItem = {
  label: string;
  href: string;
  icon:
    | 'home'
    | 'quote'
    | 'sheet'
    | 'calc'
    | 'users'
    | 'clipboard'
    | 'dashboard'
    | 'folder'
    | 'box'
    | 'desktop'
    | 'list'
    | 'plus-document'
    | 'banknotes'
    | 'credit-card'
    | 'truck'
    | 'map'
    | 'check'
    | 'chart-pie'
    | 'calendar'
    | 'price-check'
    | 'top-up'
    | 'currency';
};
type Role = (typeof USER_ROLES)[number];
type PageDef = NavItem & { roles?: Role[] };

const PAGE_DEFS: PageDef[] = [
  // Dashboard
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  // Approvals
  {
    label: 'Price Reviews',
    href: '/procurement/approvals?view=reviews',
    icon: 'price-check',
    roles: ['SENIOR_PROCUREMENT'],
  },
  {
    label: 'Quantity Top-Ups',
    href: '/procurement/approvals?view=topups',
    icon: 'top-up',
    roles: ['SENIOR_PROCUREMENT'],
  },
  // Quotes
  {
    label: 'My Quotes',
    href: '/quotes?view=my',
    icon: 'list',
    roles: ['QS', 'SENIOR_QS', 'ADMIN'],
  },
  {
    label: 'All Quotations',
    href: '/quotes?view=all',
    icon: 'quote',
    roles: ['SENIOR_QS', 'ADMIN'],
  },
  {
    label: 'Recycle Bin',
    href: '/quotes/recycle-bin',
    icon: 'list',
    roles: ['ADMIN'],
  },
  { label: 'New Quotations', href: '/quotes?status=SENT_TO_SALES', icon: 'list', roles: ['SALES'] },
  {
    label: 'Pending Endorsements',
    href: '/quotes?status=REVIEWED',
    icon: 'clipboard',
    roles: ['SALES'],
  },
  {
    label: 'New Quote',
    href: '/quotes/new',
    icon: 'plus-document',
    roles: ['QS', 'SENIOR_QS', 'ADMIN'],
  },
  {
    label: 'Manual Items',
    href: '/manual-items',
    icon: 'list',
    roles: ['SENIOR_QS', 'ADMIN'],
  },
  // Projects
  {
    label: 'Projects',
    href: '/projects',
    icon: 'folder',
    roles: [
      'ADMIN',
      'DEPUTY_ADMIN',
      'PROJECT_COORDINATOR',
      'PROJECT_OPERATIONS_OFFICER',
      'PROCUREMENT',
      'SENIOR_PROCUREMENT',
      'ACCOUNTS',
      'CASHIER',
      'ACCOUNTING_OFFICER',
      'ACCOUNTING_AUDITOR',
      'ACCOUNTING_CLERK',
      'GENERAL_MANAGER',
      'MANAGING_DIRECTOR',
      'HUMAN_RESOURCE',
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: 'chart-pie',
    roles: [
      'PROJECT_OPERATIONS_OFFICER',
      'PROJECT_COORDINATOR',
      'ADMIN',
      'MANAGING_DIRECTOR',
      'ACCOUNTS',
      'ACCOUNTING_CLERK',
      'ACCOUNTING_OFFICER',
      'PROCUREMENT',
      'SENIOR_PROCUREMENT',
    ],
  },
  // Senior PM / Coordination / POO
  {
    label: 'View Schedules',
    href: '/projects/schedules',
    icon: 'calendar',
    roles: ['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR'],
  },
  {
    label: 'View Daily Tasks',
    href: '/projects/daily-tasks',
    icon: 'clipboard',
    roles: ['PROJECT_OPERATIONS_OFFICER'],
  },
  {
    label: 'End Of Day',
    href: '/reports/end-of-day',
    icon: 'clipboard',
    roles: ['PROJECT_COORDINATOR'],
  },
  {
    label: 'Active Projects',
    href: '/projects?tab=active',
    icon: 'folder',
    roles: ['PROJECT_COORDINATOR'],
  },
  {
    label: 'Unassigned Projects',
    href: '/projects?tab=assignment',
    icon: 'users',
    roles: ['PROJECT_COORDINATOR'],
  },
  {
    label: 'Planning Pending',
    href: '/projects?tab=planning',
    icon: 'clipboard',
    roles: ['PROJECT_COORDINATOR'],
  },
  {
    label: 'Payment History',
    href: '/reports/payment-history',
    icon: 'banknotes',
    roles: [
      'PROJECT_COORDINATOR',
      'ACCOUNTS',
      'ACCOUNTING_CLERK',
      'ACCOUNTING_OFFICER',
      'ACCOUNTING_AUDITOR',
    ],
  },
  {
    label: 'Material Reconciliation',
    href: '/reports/material-reconciliation',
    icon: 'clipboard',
    roles: ['PROJECT_COORDINATOR'],
  },
  {
    label: 'Profit and Loss',
    href: '/reports/profit-loss-projects',
    icon: 'chart-pie',
    roles: [
      'PROJECT_COORDINATOR',
      'ACCOUNTS',
      'ACCOUNTING_CLERK',
      'ACCOUNTING_OFFICER',
      'ACCOUNTING_AUDITOR',
    ],
  },
  // Sales Accounts
  {
    label: 'Receive Due Payments',
    href: '/projects?tab=due_today',
    icon: 'banknotes',
    roles: ['SALES_ACCOUNTS', 'ADMIN'],
  },
  {
    label: 'Other Payments',
    href: '/projects?tab=all_payments',
    icon: 'credit-card',
    roles: ['SALES_ACCOUNTS', 'ADMIN'],
  },
  {
    label: 'Payments',
    href: '/accounts/payments',
    icon: 'currency',
    roles: ['SALES_ACCOUNTS', 'ACCOUNTS', 'ADMIN'],
  },
  // Procurement & Logistics
  {
    label: 'Requisitions',
    href: '/requisitions',
    icon: 'list',
    roles: ['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR'],
  },
  {
    label: 'Purchase Orders',
    href: '/procurement/requisitions',
    icon: 'list',
    roles: ['PROCUREMENT', 'SENIOR_PROCUREMENT', 'ADMIN'],
  },
  {
    label: 'All POs',
    href: '/procurement/purchase-orders/my',
    icon: 'list',
    roles: ['PROCUREMENT', 'SENIOR_PROCUREMENT', 'ADMIN'],
  },
  {
    label: 'Purchase Orders',
    href: '/accounts/po',
    icon: 'list',
    roles: ['ACCOUNTS', 'ACCOUNTING_CLERK', 'ACCOUNTING_OFFICER', 'ADMIN'],
  },
  {
    label: 'Dispatches',
    href: '/dispatches',
    icon: 'list',
    roles: ['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'SECURITY', 'ADMIN'],
  },
  // Accounts
  {
    label: 'Funds',
    href: '/funds',
    icon: 'banknotes',
    roles: ['ACCOUNTS', 'ACCOUNTING_CLERK', 'ACCOUNTING_OFFICER', 'ACCOUNTING_AUDITOR', 'ADMIN'],
  },
  // Inventory
  {
    label: 'Inventory',
    href: '/inventory',
    icon: 'box',
    roles: ['PROJECT_OPERATIONS_OFFICER', 'PROCUREMENT', 'SENIOR_PROCUREMENT', 'SECURITY', 'ADMIN'],
  },
  // Admin / General
  { label: 'Audit Logs', href: '/audit-logs', icon: 'list', roles: ['ADMIN'] },
  {
    label: 'Users',
    href: '/users',
    icon: 'users',
    roles: ['ADMIN'],
  },
  {
    label: 'Assets',
    href: '/assets',
    icon: 'desktop',
    roles: ['ADMIN', 'MANAGING_DIRECTOR', 'PROJECT_COORDINATOR'],
  },
  { label: 'Employees', href: '/employees', icon: 'users', roles: ['ADMIN', 'MANAGING_DIRECTOR', 'PROJECT_COORDINATOR', 'PROJECT_OPERATIONS_OFFICER'] },
  {
    label: 'Awaiting Delivery',
    href: '/dispatches?status=ARRIVED',
    icon: 'truck',
    roles: ['PROJECT_OPERATIONS_OFFICER', 'ADMIN', 'FOREMAN', 'PROJECT_COORDINATOR', 'DRIVER'],
  },
  // Rates management
  {
    label: 'Rates',
    href: '/rates',
    icon: 'currency',
    roles: ['SENIOR_QS', 'ADMIN'],
  },
  // Driver
  {
    label: 'My Pickups',
    href: '/dispatches?status=DISPATCHED&driver=me',
    icon: 'truck',
    roles: ['DRIVER'],
  },
  {
    label: 'Deliveries',
    href: '/dispatches?status=IN_TRANSIT&driver=me',
    icon: 'map',
    roles: ['DRIVER'],
  },
  {
    label: 'Settled',
    href: '/dispatches?status=DELIVERED&driver=me',
    icon: 'check',
    roles: ['DRIVER'],
  },
];

type NotificationItem = {
  id: string;
  number: string | null;
  client: string | null;
  status: string;
  link?: string;
  title?: string;
  subtitle?: string;
  kind?: string;
};

type NotificationPayload = {
  total: number;
  items: NotificationItem[];
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED_REVIEW: 'Submitted for Review',
  REVIEWED: 'Reviewed',
  SENT_TO_SALES: 'Sent to Sales',
  NEGOTIATION: 'Negotiation',
  FINALIZED: 'Finalized',
  ARCHIVED: 'Archived',
  ALERT: 'Alert',
};

function formatRole(role: string | undefined): string {
  if (!role) return 'User';
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatQuoteLabel(item: NotificationItem): string {
  return item.number ?? item.id;
}

function Icon({ name, className }: { name: NavItem['icon']; className?: string }) {
  // Simplified icon component that returns SVGs based on name
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z"
          />
        </svg>
      );
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zM14 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6zM4 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2zM14 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2z"
          />
        </svg>
      );
    case 'folder':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"
          />
        </svg>
      );
    case 'box':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
          />
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.27 6.96 12 12.01l8.73-5.05"
          />
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 22.08V12" />
        </svg>
      );
    case 'desktop':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" strokeWidth="2" />
          <line x1="8" y1="21" x2="16" y2="21" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12" y2="21" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'quote':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 4h10a2 2 0 0 1 2 2v12l-4-3-4 3V6a2 2 0 0 1 2-2Z"
          />
        </svg>
      );
    case 'sheet':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path strokeWidth="2" d="M3 9h18M9 21V9" />
        </svg>
      );
    case 'calc':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path strokeWidth="2" d="M8 7h8M8 11h8M8 15h4" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
          />
          <circle cx="9" cy="7" r="4" strokeWidth="2" />
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
          />
        </svg>
      );
    case 'clipboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
          />
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v0Z"
          />
          <path strokeWidth="2" d="M9 12h6M9 16h6" />
        </svg>
      );
    case 'list':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
          />
        </svg>
      );
    case 'plus-document':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
          />
        </svg>
      );
    case 'banknotes':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
          />
        </svg>
      );
    case 'credit-card':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
          />
        </svg>
      );
    case 'truck':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.75"
          />
        </svg>
      );
    case 'map':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.875 1.875 0 00-1.006 0L4.875 4.966c-.316.158-.69.158-1.006 0V15m3 0l3-1.5m-3 1.5l-3.25 1.625c-.748.374-1.628-.17-1.628-1.006V4.82c0-.426.24-.815.622-1.006l4.25-2.125a1.875 1.875 0 00.954-1.252"
          />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      );
    case 'chart-pie':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"
          />
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"
          />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
      );
    case 'price-check':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'top-up':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25"
          />
        </svg>
      );
    case 'currency':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
          <path
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      );
    default:
      return null;
  }
}

type ThemeMode = 'light' | 'dark' | 'system';

export default function SidebarShell({
  children,
  currentUser,
}: {
  children: ReactNode;
  currentUser: AuthenticatedUser | null;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { projectId } = useParams() as { projectId?: string };

  const [mode, setMode] = useState<ThemeMode>('system');
  const modeRef = useRef(mode);

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPayload>({ total: 0, items: [] });
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [scheduleConflictCount, setScheduleConflictCount] = useState(0);

  // Dynamic Navigation Items
  const navItems = [...PAGE_DEFS];
  if (projectId) {
    const projectItems: PageDef[] = [
      {
        label: 'Project Schedule',
        href: `/projects/${projectId}/schedule`,
        icon: 'calendar',
        roles: ['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN', 'MANAGING_DIRECTOR'],
      },
      {
        label: 'Project Tasks',
        href: `/projects/${projectId}/daily-tasks`,
        icon: 'clipboard',
        roles: ['PM_CLERK', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN'],
      },
    ];

    // Insert after "Projects"
    const projectsIndex = navItems.findIndex((i) => i.label === 'Projects');
    if (projectsIndex !== -1) {
      navItems.splice(projectsIndex + 1, 0, ...projectItems);
    } else {
      navItems.push(...projectItems);
    }
  }

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const fetchNotifications = useCallback(async () => {
    if (!currentUser?.id) {
      setNotifications({ total: 0, items: [] });
      setLoadingNotifications(false);
      return;
    }
    setLoadingNotifications(true);
    try {
      const response = await fetch('/api/notifications/pending', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load notifications');
      }
      const payload = (await response.json()) as NotificationPayload;
      setNotifications({
        total: typeof payload.total === 'number' ? payload.total : (payload.items?.length ?? 0),
        items: Array.isArray(payload.items) ? payload.items : [],
      });
    } catch (error) {
      console.error('[notifications]', error);
      setNotifications({ total: 0, items: [] });
    } finally {
      setLoadingNotifications(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchNotifications().catch(() => {});
    // Fetch schedule conflict count for sidebar badge
    fetch('/api/schedule-conflicts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setScheduleConflictCount(d.count ?? 0))
      .catch(() => {});
  }, [fetchNotifications]);

  useEffect(() => {
    if (showNotifications) {
      fetchNotifications().catch(() => {});
    }
  }, [showNotifications, fetchNotifications]);

  const displayName =
    (currentUser?.name && currentUser.name.trim().length > 0
      ? currentUser.name
      : currentUser?.email) ?? 'Signed user';
  const roleLabel = formatRole(currentUser?.role);
  const userInitial =
    (currentUser?.name ?? currentUser?.email ?? '?').trim().charAt(0).toUpperCase() || '?';
  const pendingCount = notifications.total ?? notifications.items.length;

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      // Close notifications on escape as well
      if (e.key === 'Escape') setShowNotifications(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // Theme init
  useEffect(() => {
    try {
      const saved = (localStorage.getItem('theme') as ThemeMode | null) || 'system';
      setMode(saved);
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = (m: ThemeMode) => {
        const enable = m === 'dark' || (m === 'system' && mq.matches);
        document.documentElement.classList.toggle('dark', enable);
      };
      apply(saved);
      const handler = () => {
        if (modeRef.current === 'system') apply('system');
      };
      mq.addEventListener?.('change', handler);
      return () => mq.removeEventListener?.('change', handler);
    } catch {}
  }, []);

  function applyMode(m: ThemeMode) {
    setMode(m);
    try {
      localStorage.setItem('theme', m);
    } catch {}
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const enable = m === 'dark' || (m === 'system' && prefers);
    document.documentElement.classList.toggle('dark', enable);
  }

  // Cycle modes: light -> dark -> system
  function toggleTheme() {
    const next: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    applyMode(next);
  }

  return (
    <div className="h-dvh overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <div className="flex h-dvh overflow-hidden">
        {/* Sidebar (collapsible); sticky on desktop so content scrolls independently */}
        <aside
          className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in-out
          ${collapsed ? 'w-20' : 'w-64'}
          ${open ? 'translate-x-0' : '-translate-x-full'} block fixed top-0 left-0 h-dvh z-30
          lg:translate-x-0 lg:static lg:block lg:sticky lg:top-0 lg:h-dvh overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600`}
        >
          <div
            className={`py-5 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700/50 ${collapsed ? 'justify-center px-0' : 'px-5'}`}
          >
            <div className={`relative shrink-0 ${collapsed ? 'h-12 w-12' : 'h-16 w-44'}`}>
              <Image src="/Barmlo%20Logo%202026.png" alt="Barmlo Logo" fill className="object-contain object-left" />
            </div>
            {!collapsed && (
              <div className="sr-only">
                <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                  Barmlo
                </span>
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-widest leading-none">
                  Construction
                </span>
              </div>
            )}
          </div>
          <nav className="px-3 space-y-1 mt-4">
            {navItems
              .filter((p) => (currentUser?.role === 'ADMIN') || !p.roles || p.roles.includes((currentUser?.role as Role) || 'VIEWER'))
              .map((item) => {
                const [base, queryString] = item.href.split('?');
                let active = pathname === base;
                if (queryString) {
                  const params = new URLSearchParams(queryString);
                  params.forEach((v, k) => {
                    if (searchParams.get(k) !== v) {
                      active = false;
                    }
                  });
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-barmlo-blue text-white shadow-md shadow-barmlo-blue/20'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-white'
                    } ${collapsed ? 'justify-center px-2' : 'px-4'}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      name={item.icon}
                      className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'}`}
                    />
                    <span
                      className={`whitespace-nowrap transition-all duration-200 ${collapsed ? 'hidden opacity-0 w-0' : 'block opacity-100'}`}
                    >
                      {item.label}
                    </span>
                    {/* Red conflict count badge on View Schedules / Project Schedule */}
                    {!collapsed &&
                      scheduleConflictCount > 0 &&
                      (item.href === '/projects/schedules' || item.href.endsWith('/schedule')) && (
                        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px] leading-none">
                          {scheduleConflictCount}
                        </span>
                      )}
                    {collapsed &&
                      scheduleConflictCount > 0 &&
                      (item.href === '/projects/schedules' || item.href.endsWith('/schedule')) && (
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-600 px-1 py-0.5 text-[8px] font-bold text-white min-w-[14px] leading-none">
                          {scheduleConflictCount}
                        </span>
                      )}
                    {/* Tooltip when collapsed */}
                    {collapsed && (
                      <span className="pointer-events-none absolute left-14 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
          </nav>
        </aside>

        {/* Scrim for mobile when sidebar open */}
        {open && (
          <div
            className="fixed inset-0 bg-black/20 z-20 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* Main */}
        <div
          className={`flex-1 grid grid-rows-[auto_1fr] h-dvh min-h-0 relative bg-gray-50 dark:bg-gray-900`}
        >
          {/* Background Image */}
          <div className="absolute inset-0 z-0 opacity-5 pointer-events-none mix-blend-multiply">
            <Image src="/dashboard_bg.png" alt="" fill className="object-cover" />
          </div>

          {/* Topbar */}
          <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 relative z-10 shadow-sm">
            <div className="w-full pl-4 pr-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-md"
                  onClick={() => {
                    if (window.innerWidth >= 1024) {
                      setCollapsed((v) => !v);
                    } else {
                      setOpen(true);
                    }
                  }}
                  aria-label="Toggle menu"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
                <div className="hidden md:flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <span className="hover:text-gray-900 dark:hover:text-white cursor-pointer">
                    Home
                  </span>
                  <span className="mx-2">/</span>
                  <span className="font-medium text-gray-900 dark:text-white">Dashboard</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="relative h-9 w-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Toggle theme"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                  </svg>
                </button>
                <div
                  className="relative"
                  onMouseEnter={() => setShowNotifications(true)}
                  onMouseLeave={() => setShowNotifications(false)}
                >
                  <button
                    type="button"
                    className="relative h-9 w-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Pending quotations"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5" />
                      <path d="M9 21h6" />
                    </svg>
                    {pendingCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-800"></span>
                    )}
                  </button>
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-gray-100 bg-white shadow-xl dark:bg-gray-800 dark:border-gray-700 z-50">
                      <div className="flex items-center justify-between px-4 py-2 border-b text-sm font-semibold dark:border-gray-700">
                        <span>Notifications</span>
                        <button
                          type="button"
                          onClick={() => fetchNotifications().catch(() => {})}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Refresh
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {loadingNotifications ? (
                          <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent dark:border-gray-500 dark:border-t-transparent" />
                            Loading...
                          </div>
                        ) : notifications.items.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                            No notifications.
                          </div>
                        ) : (
                          notifications.items.map((item) => (
                            <Link
                              key={item.id}
                              href={item.link ?? `/quotes/${item.id}`}
                              className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                              onClick={() => setShowNotifications(false)}
                            >
                              <div className="flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-100">
                                <span>{item.title ?? formatQuoteLabel(item)}</span>
                                <span
                                  className={`text-xs ${item.kind === 'SYSTEM' ? 'text-red-600 font-bold' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                  {(STATUS_LABELS as any)[item.status] ?? item.status}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {item.subtitle ?? item.client ?? 'No details'}
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 pl-4 border-l border-gray-200 dark:border-gray-700">
                  <div className="text-right leading-tight hidden sm:block">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {displayName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{roleLabel}</div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-sm font-bold ring-2 ring-white dark:ring-gray-800 shadow-sm">
                    {userInitial}
                  </div>
                  <Link
                    href="/settings"
                    className="p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 rounded-full transition-colors dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-blue-400"
                    title="Account settings"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsLoggingOut(true);
                      await signOut({ redirect: false });
                      window.location.replace(`/login?logout=${Date.now()}`);
                    }}
                    disabled={isLoggingOut}
                    className="p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600 rounded-full transition-colors dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                    title="Sign out"
                  >
                    {isLoggingOut ? (
                      <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="w-full px-6 md:px-8 pb-6 overflow-y-auto overflow-x-hidden scrollbar-none min-h-0 relative z-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
