import { Suspense } from 'react';
import RevenueChart from '@/app/ui/dashboard/revenue-chart';
import StatsCards from '@/app/ui/dashboard/stats-cards';
import RecentQuotes from '@/app/ui/dashboard/recent-quotes';
import { getCurrentUser } from '@/lib/auth';
import { fetchCardData, fetchRevenueData, fetchRecentQuotes } from '@/lib/dashboard';
import DashboardTabs from '@/app/ui/dashboard/DashboardTabs';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { fromMinor } from '@/helpers/money';
import Money from '@/components/Money';
import ViewQuoteButton from '@/components/ViewQuoteButton';
import { PlusIcon } from '@heroicons/react/24/outline';
import { ProjectAssigner } from '@/app/(protected)/projects/project-assigner';
import { createAndRedirectDispatch } from './actions';

async function PendingTasks({
  userId,
  role,
  endDate,
  currentPage = 1,
  filter,
}: {
  userId: string;
  role: string;
  endDate?: string;
  currentPage?: number;
  filter?: string;
}) {
  // Parse date or use default (today)
  const end = endDate ? new Date(endDate) : new Date();

  // Set time to end of day
  end.setHours(23, 59, 59, 999);

  // For SALES_ACCOUNTS (and Admin), show payment schedules that are due on or before the date
  // DEBUG: Render role on screen to verify

  // Initialize collections
  let allPayments: any[] = [];
  let pendingGrnPos: any[] = [];
  let dispatchTasks: Array<{ type: 'PENDING_DISPATCH'; data: any; date: Date }> = [];
  let driverTasks: any[] = []; // Initialize driverTasks
  let driverDeliveriesCount = 0;
  const roles = {
    PM: role === 'PROJECT_OPERATIONS_OFFICER' || role === 'ADMIN' || role === 'MANAGING_DIRECTOR',
    SALES_ACCOUNTS:
      role === 'SALES_ACCOUNTS' ||
      role === 'ACCOUNTING_CLERK' ||
      role === 'ADMIN' ||
      role === 'MANAGING_DIRECTOR',
    ACCOUNTS:
      role === 'ACCOUNTS' ||
      role === 'ACCOUNTING_CLERK' ||
      role === 'ACCOUNTING_SECURITY' ||
      role === 'ADMIN' ||
      role === 'MANAGING_DIRECTOR',
    SECURITY: role === 'SECURITY' || role === 'ADMIN',
    DRIVER: role === 'DRIVER' || role === 'ADMIN',
    PROJECT_COORDINATOR:
      role === 'PROJECT_COORDINATOR' ||
      role === 'ADMIN' ||
      role === 'GENERAL_MANAGER' ||
      role === 'MANAGING_DIRECTOR',
    SENIOR_QS:
      role === 'SENIOR_QS' ||
      role === 'ADMIN' ||
      role === 'GENERAL_MANAGER' ||
      role === 'MANAGING_DIRECTOR',
    SALES: role === 'SALES' || role === 'ADMIN' || role === 'MANAGING_DIRECTOR',
    PROCUREMENT:
      role === 'PROCUREMENT' ||
      role === 'SENIOR_PROCUREMENT' ||
      role === 'ADMIN' ||
      role === 'GENERAL_MANAGER' ||
      role === 'MANAGING_DIRECTOR',
  };

  // Logic for Project Managers (Pending Dispatches)
  if (roles.PM) {
    const myProjects = await prisma.project.findMany({
      where: {
        ...(role === 'PROJECT_OPERATIONS_OFFICER' ? { assignedToId: userId } : {}),
        status: { not: 'COMPLETED' },
      },
      select: { id: true, projectNumber: true, quote: { select: { customer: true } } },
    });

    if (myProjects.length > 0) {
      const pIds = myProjects.map((p) => p.id);

      // 1. Get all Verified GRN Items for these projects (Received Stock)
      const verifiedItems = await prisma.goodsReceivedNoteItem.findMany({
        where: {
          grn: { status: 'VERIFIED', purchaseOrder: { projectId: { in: pIds } } },
        },
        select: {
          qtyAccepted: true,
          poItem: { select: { requisitionItemId: true } },
          grn: { select: { purchaseOrder: { select: { projectId: true } } } },
        },
      });

      // 2. Get all Dispatched Items (Sent Stock)
      const dispatchedItems = await prisma.dispatchItem.findMany({
        where: {
          dispatch: { projectId: { in: pIds } },
          requisitionItemId: { not: null },
        },
        select: { qty: true, requisitionItemId: true, dispatch: { select: { projectId: true } } },
      });

      // 3. Aggregate by Project -> RequisitionItem
      const projMap = new Map<string, Map<string, { verified: number; sent: number }>>();

      verifiedItems.forEach((vi) => {
        const pid = vi.grn.purchaseOrder.projectId;
        const rid = vi.poItem?.requisitionItemId;
        if (!rid) return;
        if (!projMap.has(pid)) projMap.set(pid, new Map());
        const pData = projMap.get(pid)!;
        if (!pData.has(rid)) pData.set(rid, { verified: 0, sent: 0 });
        pData.get(rid)!.verified += Number(vi.qtyAccepted);
      });

      dispatchedItems.forEach((di) => {
        const pid = di.dispatch.projectId;
        const rid = di.requisitionItemId!;
        if (!projMap.has(pid)) return;
        const pData = projMap.get(pid)!;
        if (!pData.has(rid)) pData.set(rid, { verified: 0, sent: 0 });
        pData.get(rid)!.sent += Number(di.qty);
      });

      // 4. Create Tasks for Projects with Remaining Items
      myProjects.forEach((proj) => {
        const pData = projMap.get(proj.id);
        if (!pData) return;

        let pendingCount = 0;
        for (const vals of pData.values()) {
          if (vals.verified > vals.sent) pendingCount++;
        }

        if (pendingCount > 0) {
          dispatchTasks.push({
            type: 'PENDING_DISPATCH',
            data: { ...proj, pendingCount },
            date: new Date(),
          });
        }
      });
    }
  }

  // Logic for Sales Accounts (Incoming Payments)
  if (roles.SALES_ACCOUNTS) {
    allPayments = await prisma.paymentSchedule.findMany({
      where: {
        dueOn: { lte: end },
        status: { not: 'PAID' },
      },
      include: {
        project: {
          select: {
            id: true,
            projectNumber: true,
            quote: { include: { customer: true } },
          },
        },
      },
      orderBy: { dueOn: 'asc' },
    });
  }

  let pendingFundingCount = 0;
  let paymentHistoryCount = 0;
  
  // Logic for Accounts (GRNs & Funding Requests - Outgoing)
  let pendingFundingRequests: any[] = [];
  if (roles.ACCOUNTS) {
    pendingGrnPos = await prisma.purchaseOrder.findMany({
      where: {
        goodsReceivedNotes: { some: { status: 'PENDING' } },
      },
      include: {
        project: {
          select: {
            id: true,
            projectNumber: true,
            quote: { include: { customer: true } },
          },
        },
        goodsReceivedNotes: {
          select: { id: true, createdAt: true },
        },
      },
    });

    pendingFundingRequests = await prisma.fundingRequest.findMany({
      where: {
        status: 'REQUESTED',
      },
      include: {
        requisition: {
          select: {
            id: true,
            project: {
              select: {
                id: true,
                projectNumber: true,
                quote: { select: { customer: { select: { displayName: true } } } },
              },
            },
          },
        },
        requestedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Logic for Security (Gate Pass & Incoming Deliveries)
  let securityOutgoing: any[] = [];
  let securityIncoming: any[] = [];

  if (roles.SECURITY) {
    // 1. Outgoing Dispatches (Gate Pass) - Show all APPROVED dispatches (Active Outgoing)
    securityOutgoing = await prisma.dispatch.findMany({
      where: {
        status: 'APPROVED', 
      },
      include: {
        project: {
          select: {
            projectNumber: true,
            quote: { select: { customer: { select: { displayName: true } } } },
          },
        },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Incoming Deliveries (Expected Stock) - POs that are Submitted
    securityIncoming = await prisma.purchaseOrder.findMany({
      where: {
        status: { in: ['SUBMITTED', 'ORDERED', 'PURCHASED'] },
      },
      include: {
        project: {
          select: {
            projectNumber: true,
            quote: { select: { customer: { select: { displayName: true } } } },
          },
        },
        purchases: { select: { vendor: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    driverDeliveriesCount = await prisma.dispatch.count({
      where: {
        status: 'IN_TRANSIT',
        assignedToDriverId: userId,
      },
    });
  }

  // Logic for Driver (Pick up items)
  if (roles.DRIVER) {
    driverTasks = await prisma.dispatch.findMany({
      where: {
        status: 'DISPATCHED', // Items handed out, waiting for driver pickup


        assignedToDriverId: userId,
      },
      include: {
        project: {
          select: {
            projectNumber: true,
            quote: { select: { customer: { select: { displayName: true } } } },
          },
        },
        items: { select: { id: true, qty: true, unit: true, description: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Logic for Senior PM (Project Assignment)
  let assignmentTasks: any[] = [];
  let projectManagers: any[] = [];
  if (roles.PROJECT_COORDINATOR) {
    [assignmentTasks, projectManagers] = await Promise.all([
      prisma.project.findMany({
        where: {
          status: { notIn: ['CREATED', 'COMPLETED', 'CLOSED'] }, // Unlocked and not finished
          assignedToId: null, // Unassigned
        },
        include: {
          quote: { select: { customer: { select: { displayName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.findMany({
        where: { role: 'PROJECT_OPERATIONS_OFFICER' },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
    ]);
  }
  // Logic for Project Manager (Unplanned Count and Active Count)
  let pmUnplannedCount = 0;
  let pmActiveCount = 0;
  let awaitingDeliveryCount = 0;
  if (roles.PM) {
    const [unplanned, active, awaiting] = await Promise.all([
      // Unplanned: No schedule OR Draft schedule
      prisma.project.count({
        where: {
          ...(role === 'PROJECT_OPERATIONS_OFFICER' ? { assignedToId: userId } : {}), // Filter by user if just PM
          status: { notIn: ['COMPLETED', 'CLOSED'] },
          OR: [
            { schedules: { is: null } },
            { schedules: { status: 'DRAFT' } }
          ]
        },
      }),
      // Active: Active schedule
      prisma.project.count({
        where: {
          ...(role === 'PROJECT_OPERATIONS_OFFICER' ? { assignedToId: userId } : {}),
          status: { notIn: ['COMPLETED', 'CLOSED'] },
          schedules: { status: 'ACTIVE' }
        },
      }),
      // Awaiting Delivery: Driver has Arrived, waiting for Site Acceptance
      prisma.dispatch.count({
        where: {
          status: 'ARRIVED',
          ...(role === 'PROJECT_OPERATIONS_OFFICER' ? { project: { assignedToId: userId } } : {}),
        }
      })
    ]);

    pmUnplannedCount = unplanned;
    pmActiveCount = active;
    awaitingDeliveryCount = awaiting;
  }

  // Logic for Project Manager (Projects with Due Daily Reports)
  let dueReportsProjects: any[] = [];
  if (roles.PM) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const activeProjects = await prisma.project.findMany({
      where: {
        ...(role === 'PROJECT_OPERATIONS_OFFICER' ? { assignedToId: userId } : {}),
        status: { notIn: ['COMPLETED', 'CLOSED'] },
        schedules: { status: 'ACTIVE' },
      },
      include: {
        quote: { select: { customer: { select: { displayName: true } } } },
        schedules: {
          include: {
            items: {
              where: {
                status: 'ACTIVE',
                plannedStart: { lte: new Date() },
              },
              include: {
                reports: {
                  where: {
                    reportedForDate: {
                      gte: today,
                      lt: tomorrow,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    dueReportsProjects = activeProjects.filter((p) => {
      if (!p.schedules) return false;
      // Project is "due" if any active item that should be worked on today has no report today
      return p.schedules.items.some((item) => item.reports.length === 0);
    });
  }

  // Logic for Project Manager (My Assigned Projects)
  let myProjectTasks: any[] = [];
  if (roles.PM) {
    myProjectTasks = await prisma.project.findMany({
      where: {
        assignedToId: userId,
        status: { notIn: ['COMPLETED', 'CLOSED'] },
      },
      include: {
        quote: { select: { customer: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Logic for Senior QS (Quote Reviews)
  let quoteReviews: any[] = [];
  let negotiationReviews: any[] = [];
  if (roles.SENIOR_QS) {
    // 1. New Quotes needing review
    quoteReviews = await prisma.quote.findMany({
      where: { status: 'SUBMITTED_REVIEW' },
      include: { customer: { select: { displayName: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    // 2. Negotiations needing review (Sales Proposals)
    negotiationReviews = await prisma.quote.findMany({
      where: {
        status: 'NEGOTIATION_REVIEW',
        negotiations: {
          some: {
            status: 'OPEN',
            items: { some: { status: 'PENDING' } },
          },
        },
      },
      include: { customer: { select: { displayName: true } } },
    });
  }

  // Logic for Sales (Pending Actions)
  let salesTasks: any[] = [];
  if (roles.SALES) {
    salesTasks = await prisma.quote.findMany({
      where: {
        status: { in: ['SENT_TO_SALES', 'NEGOTIATION', 'REVIEWED'] },
      },
      include: { customer: { select: { displayName: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Logic for Procurement (Counts + Pending Tasks)
  let procurementTasks: any[] = [];
  let fundingNeededCount = 0;
  let actionPurchasesCount = 0;

  if (roles.PROCUREMENT || role === 'ADMIN' || role === 'MANAGING_DIRECTOR') {
    // 1. Pending Tasks List (Existing Logic: Submitted/Approved without pending funding)
    procurementTasks = await prisma.procurementRequisition.findMany({
      where: {
        status: { in: ['SUBMITTED', 'APPROVED'] },
        funding: {
          none: {
            status: 'REQUESTED', // Exclude those waiting for funding approval
          },
        },
        // EXCLUDE Review Requests (They go to Senior Procurement)
        OR: [
          { note: null },
          { note: { not: { contains: 'Review request from Req' } } }
        ]
      },
      include: {
        project: {
          select: {
            projectNumber: true,
            quote: { select: { customer: { select: { displayName: true } } } },
          },
        },
        items: { select: { id: true } }, // needed for count
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit for list
    });

    // 2. Count: Request Funding (Submitted/Approved internally, but no active funding request)
    fundingNeededCount = await prisma.procurementRequisition.count({
      where: {
        status: 'SUBMITTED',
        funding: { 
            none: { 
                status: { in: ['REQUESTED', 'APPROVED'] } 
            } 
        },
        // EXCLUDE Review Requests (They go to Senior Procurement)
        OR: [
          { note: null },
          { note: { not: { contains: 'Review request from Req' } } }
        ]
      },
    });

    // 3. Count: Action Purchases (Funding Approved, but not yet fully PURCHASED/COMPLETED)
    actionPurchasesCount = await prisma.procurementRequisition.count({
      where: {
        status: { notIn: ['PURCHASED', 'COMPLETED', 'CLOSED'] },
        funding: { some: { status: 'APPROVED' } },
      },
    });
  }
  // Logic for Senior Procurement (Approvals)
  let seniorApprovalsCount = 0;
  if (role === 'SENIOR_PROCUREMENT' || role === 'ADMIN' || role === 'MANAGING_DIRECTOR' || role === 'GENERAL_MANAGER') {
      const [topupCount, reviewReqCount] = await Promise.all([
         prisma.requisitionItemTopup.count({
             where: {
                 decidedAt: null,
                 requestedById: { not: userId } // Conflict of Interest Check
             }
         }),
         prisma.procurementRequisition.count({
            where: {
                OR: [
                    {
                        status: 'SUBMITTED',
                        note: { contains: 'Review request from Req' },
                    },
                    {
                        status: 'AWAITING_APPROVAL'
                    }
                ],
                submittedById: { not: userId }
            }
         })
      ]);
      seniorApprovalsCount = topupCount + reviewReqCount;
  }

/* ... sort logic ... */
/* ... existing return ... */

  // For Senior Procurement, show Button Grid (Approvals + Procurement Actions)
  if (role === 'SENIOR_PROCUREMENT') {
    return (
      <div className="flex flex-col items-center justify-center py-6 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl">
          {/* 1. Approvals (Priority) */}
          <Link
            href="/procurement/approvals"
            className="flex flex-col justify-center items-center gap-2 rounded-2xl bg-green-600 px-4 py-8 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden group"
          >
            <div className="flex items-center gap-3 z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Approvals</span>
            </div>
            {seniorApprovalsCount > 0 && (
              <span className="absolute top-4 right-4 flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-green-600 shadow-sm">
                {seniorApprovalsCount}
              </span>
            )}
          </Link>

          {/* 2. Create Purchase Order (Procurement) */}
          <Link
            href="/procurement/requisitions?tab=funding_needed"
            className="flex flex-col justify-center items-center gap-2 rounded-2xl bg-green-600 px-4 py-8 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden"
          >
             <div className="flex items-center gap-3 z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Create Purchase Order</span>
            </div>
            {fundingNeededCount > 0 && (
              <span className="absolute top-4 right-4 flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-green-600 shadow-sm">
                {fundingNeededCount}
              </span>
            )}
          </Link>
          
          {/* 3. Procure (Procurement) */}
          <Link
            href="/procurement/requisitions?tab=action_purchases"
            className="flex flex-col justify-center items-center gap-2 rounded-2xl bg-green-600 px-4 py-8 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden"
          >
            <div className="flex items-center gap-3 z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Procure</span>
            </div>
            {actionPurchasesCount > 0 && (
              <span className="absolute top-4 right-4 flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-green-600 shadow-sm">
                {actionPurchasesCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    );
  }

  // For Procurement, show Button Grid
  if (role === 'PROCUREMENT') {
    return (
      <div className="flex flex-col gap-6 p-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 w-full">
          {/* 1. Create Purchase Order */}
          <Link
            href="/procurement/requisitions?tab=funding_needed"
            className="flex flex-col justify-center items-center gap-2 rounded-2xl bg-green-600 px-4 py-8 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden"
          >
            <div className="flex items-center gap-3 z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Create Purchase Order</span>
            </div>
            <span className="absolute top-4 right-4 flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-green-600 shadow-sm">
                {fundingNeededCount}
            </span>
          </Link>
          
          {/* 2. Procure */}
          <Link
            href="/procurement/requisitions?tab=action_purchases"
            className="flex flex-col justify-center items-center gap-2 rounded-2xl bg-green-600 px-4 py-8 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden"
          >
            <div className="flex items-center gap-3 z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Procure</span>
            </div>
            <span className="absolute top-4 right-4 flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-green-600 shadow-sm">
                {actionPurchasesCount}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // Logic for Security (Button Grid)
  if (role === 'SECURITY') {
    const outgoingCount = securityOutgoing.length;
    const incomingCount = securityIncoming.length;

    return (
      <div className="flex flex-col items-center justify-center py-6 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-4xl">
          <Link
            href="/dispatches?status=APPROVED"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Outgoing Dispatches
              <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                {outgoingCount}
              </span>
          </Link>

          <Link
            href="/procurement/purchase-orders?status=INCOMING" 
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Goods Receiving
              <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                {incomingCount}
              </span>
          </Link>
        </div>
      </div>
    );
  }

  // Logic for Driver (Button Grid)
  if (role === 'DRIVER') {
    return (
      <div className="flex flex-col items-center justify-center py-6 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-4xl">
          <Link
            href="/dispatches?status=DISPATCHED&driver=me"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            My Pickups
              <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                {driverTasks.length}
              </span>
          </Link>
          
          <Link
            href="/dispatches?status=IN_TRANSIT&driver=me"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Deliveries
              <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                {driverDeliveriesCount}
              </span>
          </Link>
        </div>
      </div>
    );
  }

  // Logic for Accounts (Button Grid)
  // SALES_ACCOUNTS excluded as per user request (they keep the original view)
  const isAccounts = ['ACCOUNTS', 'ACCOUNTING_OFFICER', 'ADMIN', 'MANAGING_DIRECTOR'].includes(role);
  if (isAccounts) {
    pendingFundingCount = await prisma.fundingRequest.count({
        where: { status: { in: ['REQUESTED', 'PENDING'] } }
    });
    paymentHistoryCount = await prisma.clientPayment.count();
    
    // Only return early if NOT Admin/MD
    if (!['ADMIN', 'MANAGING_DIRECTOR'].includes(role)) {
       return (
        <div className="flex flex-col items-center justify-center py-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-6xl">
            <Link
                href="/accounts"
                className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Approve Purchase Order
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                    {pendingFundingCount}
                </span>
            </Link>

            <Link
                href="/accounts?tab=receipts"
                className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Goods Receiving
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                    {pendingGrnPos.length}
                </span>
            </Link>

            <Link
                href="/reports/payment-history"
                className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
            >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Payment History
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                    {paymentHistoryCount}
                </span>
            </Link>
            </div>
        </div>
       );
    }
  }
  // Logic for Human Resource
  if (role === 'HUMAN_RESOURCE') {
    return (
        <div className="flex flex-col items-center justify-center py-6 mb-8">
            <div className="w-full max-w-xl">
            <Link
                href="/employees"
                className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1"
            >
                <div className="p-2 bg-white/20 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                Manage Employees
            </Link>
            </div>
        </div>
    );
  }

  pendingGrnPos.sort((a, b) => {
    const getLastActivity = (po: (typeof pendingGrnPos)[0]) => {
      const grnNotetimestamps = po.goodsReceivedNotes.map((g: any) => g.createdAt.getTime());
      return Math.max(po.updatedAt.getTime(), ...grnNotetimestamps);
    };
    return getLastActivity(b) - getLastActivity(a);
  });

  // Sort payments by priority
  const sortedPayments = allPayments.sort((a: any, b: any) => {
    const statusOrder: Record<string, number> = { DUE: 0, PARTIAL: 1, PAID: 2 };
    return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
  });

  // Combine tasks (GRNs first as they are blocking operations usually)
  const allTasks = [
    ...pendingFundingRequests.map((f) => ({
      type: 'FUNDING_REQUEST' as const,
      data: f,
      date: f.createdAt,
    })),
    ...pendingGrnPos.map((po) => ({
      type: 'GRN_VERIFICATION' as const,
      data: po,
      date: po.updatedAt,
    })),
    ...sortedPayments.map((p) => ({ type: 'PAYMENT' as const, data: p, date: p.dueOn })),
    ...myProjectTasks.map((p) => ({ type: 'MY_PROJECT' as const, data: p, date: p.createdAt })),
    ...dispatchTasks,
    ...securityOutgoing.map((d) => ({
      type: 'SECURITY_OUTGOING' as const,
      data: d,
      date: d.createdAt,
    })),
    ...securityIncoming.map((po) => ({
      type: 'SECURITY_INCOMING' as const,
      data: po,
      date: po.createdAt,
    })),
    ...driverTasks.map((d) => ({
      type: 'DRIVER_TASK' as const,
      data: d,
      date: new Date(d.createdAt),
    })),
    ...assignmentTasks.map((p) => ({
      type: 'PROJECT_ASSIGNMENT' as const,
      data: p,
      date: p.createdAt,
    })),
    ...quoteReviews.map((q) => ({ type: 'QUOTE_REVIEW' as const, data: q, date: q.updatedAt })),
    ...negotiationReviews.map((q) => ({
      type: 'NEGOTIATION_REVIEW' as const,
      data: q,
      date: q.updatedAt,
    })),
    ...salesTasks.map((q) => ({ type: 'SALES_TASK' as const, data: q, date: q.updatedAt })),
    ...procurementTasks.map((r) => ({
      type: 'PROCUREMENT_TASK' as const,
      data: r,
      date: r.createdAt,
    })),
    ...dueReportsProjects.map((p) => ({
      type: 'DUE_DAILY_REPORT' as const,
      data: p,
      date: new Date(),
    })),
  ].filter((item) => filter !== 'due_reports' || item.type === 'DUE_DAILY_REPORT')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Pagination logic
  const itemsPerPage = 5;
  const totalItems = allTasks.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = allTasks.slice(startIndex, startIndex + itemsPerPage);

  // For Project Manager, strictly show only the buttons
  if (role === 'PROJECT_OPERATIONS_OFFICER' && filter !== 'due_reports') {
    return (
      <div className="flex flex-col items-center justify-center py-6 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-6xl">
          <Link
            href="/projects?tab=unplanned"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m-4-4h8M4 6h16M4 18h16" />
            </svg>
            Unplanned
            <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
              {pmUnplannedCount}
            </span>
          </Link>
          <Link
            href="/projects?tab=active"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             Active
             <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
               {pmActiveCount}
             </span>
           </Link>
          <Link
            href="/dispatches"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h11M9 21V3m5 6l7 7-7 7" />
            </svg>
            Dispatches
            <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
              {dispatchTasks.length}
            </span>
          </Link>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-4xl mt-6">
          <Link
            href="/dispatches?status=ARRIVED"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
             </svg>
             Awaiting Delivery
             <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600 border border-green-200">
               {awaitingDeliveryCount}
             </span>
           </Link>
           <Link
            href="/dashboard?filter=due_reports"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Due Reports
            <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600 border border-green-200">
              {dueReportsProjects.length}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(role === 'PROCUREMENT' || role === 'ADMIN' || role === 'MANAGING_DIRECTOR') && (
         <div className="flex flex-col items-center justify-center py-6 mb-8 border-b pb-8">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Procurement</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 w-full max-w-4xl">
              <Link href="/procurement/requisitions?tab=funding_needed" className="flex flex-col justify-center items-center gap-2 rounded-2xl bg-green-600 px-4 py-8 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden">
                <div className="flex items-center gap-3 z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Create Purchase Order</span>
                </div>
                <span className="absolute top-4 right-4 flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-green-600 shadow-sm">
                    {fundingNeededCount}
                </span>
              </Link>
              <Link href="/procurement/requisitions?tab=action_purchases" className="flex flex-col justify-center items-center gap-2 rounded-2xl bg-green-600 px-4 py-8 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden">
                <div className="flex items-center gap-3 z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Procure</span>
                </div>
                <span className="absolute top-4 right-4 flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-green-600 shadow-sm">
                    {actionPurchasesCount}
                </span>
              </Link>
            </div>
         </div>
      )}

      {(role === 'SECURITY' || role === 'ADMIN' || role === 'MANAGING_DIRECTOR') && (
        <div className="flex flex-col items-center justify-center py-6 mb-8 border-b pb-8">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Security</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-4xl">
              <Link href="/dispatches?status=APPROVED" className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Outgoing Dispatches
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">{securityOutgoing.length}</span>
              </Link>
              <Link href="/procurement/purchase-orders?status=INCOMING" className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Goods Receiving
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">{securityIncoming.length}</span>
              </Link>
            </div>
        </div>
      )}

      {(isAccounts || role === 'ADMIN' || role === 'MANAGING_DIRECTOR') && (
        <div className="flex flex-col items-center justify-center py-6 mb-8 border-b pb-8">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Accounts</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-6xl">
              <Link href="/accounts" className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Approve Purchase Order
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">{pendingFundingCount}</span>
              </Link>
              <Link href="/accounts?tab=receipts" className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Goods Receiving
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">{pendingGrnPos.length}</span>
              </Link>
              <Link href="/accounts/payments" className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-600 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl hover:-translate-y-1">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Payment History
                <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">{paymentHistoryCount}</span>
              </Link>
            </div>
        </div>
      )}

      {roles.PM && (
        <div className="flex flex-col items-center justify-center py-6 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-6xl">
          <Link
            href="/projects?tab=unplanned"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v8m-4-4h8M4 6h16M4 18h16"
              />
            </svg>
            Unplanned
            <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
              {pmUnplannedCount}
            </span>
          </Link>
          <Link
            href="/projects?tab=active"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             Active
             <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
               {pmActiveCount}
             </span>
           </Link>
          <Link
            href="/dispatches"
            className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h11M9 21V3m5 6l7 7-7 7"
                />
              </svg>
              Dispatches
              <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
                {dispatchTasks.length}
              </span>
            </Link>
          </div>
           {/* Row 2 */}
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-4xl mt-6">
                <Link
                href="/dispatches?status=ARRIVED"
                className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Awaiting Delivery
                  <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600 border border-green-200">
                    {awaitingDeliveryCount}
                  </span>
                </Link>
                <Link
                href="/dashboard?filter=due_reports"
                className="inline-flex w-full justify-center items-center gap-4 rounded-2xl bg-orange-500 px-8 py-10 text-xl font-bold text-white shadow-lg transition-all hover:bg-orange-600 hover:shadow-xl hover:-translate-y-1"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Due Reports
                  <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-orange-600 border border-orange-200">
                    {dueReportsProjects.length}
                  </span>
                </Link>
           </div>
        </div>
      )}

      {!['ADMIN', 'MANAGING_DIRECTOR'].includes(role) && (
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Pending Tasks</h3>
        <p className="mt-1 text-sm text-gray-500">
          {pendingGrnPos.length > 0 ? `${pendingGrnPos.length} GRNs to verify. ` : ''}
          Overview of your pending actions and assignments.
        </p>
        <div className="mt-4">
          {paginatedItems.length > 0 ? (
            <div className="space-y-3">
              {paginatedItems.map((item) => {
                if (item.type === 'DUE_DAILY_REPORT') {
                  const data = item.data as any;
                  return (
                    <div
                      key={`due-report-${data.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-orange-300 transition-all border-l-4 border-l-orange-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Daily Report Due
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {data.quote?.customer?.displayName}
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {data.projectNumber}
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            DUE TODAY
                          </span>
                          <Link
                            href={`/projects/${data.id}/daily-tasks`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'PENDING_DISPATCH') {
                  const data = item.data as any; // { id, projectNumber, quote: { customer }, pendingCount }
                  return (
                    <div
                      key={`pending-dispatch-${data.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-barmlo-blue/50 transition-all border-l-4 border-l-barmlo-blue"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {data.quote?.customer?.displayName || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {data.pendingCount} Item{data.pendingCount !== 1 ? 's' : ''} Ready for
                            Dispatch
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {data.projectNumber || 'N/A'}
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-barmlo-blue/10 text-barmlo-blue">
                            DISPATCH
                          </span>
                          <Link
                  href={`/projects/${data.id}/dispatches`}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  View Dispatches
                </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'GRN_VERIFICATION') {
                  const po = item.data as any; // Type assertion since we mixed types
                  const pendingCount = po.goodsReceivedNotes?.length ?? 0;
                  return (
                    <div
                      key={`po-${po.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-emerald-300 transition-all border-l-4 border-l-amber-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {po.project?.quote?.customer?.displayName || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            PO #{po.id.slice(0, 8)} • {pendingCount} Pending GRN
                            {pendingCount !== 1 ? 's' : ''}
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {po.project?.projectNumber || 'N/A'}
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            VERIFY GRN
                          </span>
                          <Link
                            href={`/procurement/purchase-orders/${po.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                          >
                            Verify
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'DRIVER_TASK') {
                  const d = item.data as any;
                  return (
                    <div
                      key={`driver-${d.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-emerald-300 transition-all border-l-4 border-l-emerald-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Ready for Pickup #{d.id.slice(-6).toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {d.project?.quote?.customer?.displayName} • {d.items.length} Items
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {d.project?.projectNumber}
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            PICKUP
                          </span>
                          <Link
                            href={`/dispatches/${d.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                          >
                            Inspect
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'SECURITY_OUTGOING') {
                  const d = item.data as any;
                  const itemCount = d.items?.length || 0;
                  return (
                    <div
                      key={`sec-out-${d.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-red-300 transition-all border-l-4 border-l-red-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Outgoing Dispatch #{d.id.slice(-6).toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {d.project?.quote?.customer?.displayName} • {itemCount} Items
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {d.project?.projectNumber}
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            GATE PASS
                          </span>
                          <Link
                            href={`/dispatches/${d.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            Inspect
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'SECURITY_INCOMING') {
                  const po = item.data as any;
                  const vendorName = po.purchases?.[0]?.vendor || 'Unknown Vendor';
                  return (
                    <div
                      key={`sec-in-${po.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-all border-l-4 border-l-blue-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Expected Delivery from {vendorName}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            PO #{po.id.slice(0, 8)} • {po.project?.quote?.customer?.displayName}
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            RECEIVE
                          </span>
                          <Link
                            href={`/procurement/purchase-orders/${po.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            Log Receipt
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'PROJECT_ASSIGNMENT') {
                  const p = item.data as any;
                  return (
                    <div
                      key={`assign-${p.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-green-300 transition-all border-l-4 border-l-green-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Assign Project Operations Officer
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {p.quote?.customer?.displayName || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {p.projectNumber || 'N/A'} • Unlocked & Ready
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ASSIGN OFFICER
                          </span>
                          <Link
                            href="/projects?tab=assignment"
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          >
                            Assign
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'MY_PROJECT') {
                  const p = item.data as any;
                  return (
                    <div
                      key={`myproj-${p.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-all border-l-4 border-l-blue-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">Project Assignment</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {p.quote?.customer?.displayName || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Ref: {p.projectNumber || 'N/A'} • {p.status}
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            YOUR PROJECT
                          </span>
                          <Link
                            href={`/projects/${p.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'QUOTE_REVIEW') {
                  const q = item.data as any;
                  return (
                    <div
                      key={`qreview-${q.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-violet-300 transition-all border-l-4 border-l-violet-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">Review New Quote</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {q.customer?.displayName || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-gray-500">Submitted for initial review</p>
                        </div>
                        <div className="text-right ml-4">
                          <Link
                            href={`/quotes/${q.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                          >
                            Review
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'NEGOTIATION_REVIEW') {
                  const q = item.data as any;
                  return (
                    <div
                      key={`nreview-${q.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-indigo-300 transition-all border-l-4 border-l-indigo-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">Sales Proposal Review</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {q.customer?.displayName || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-gray-500">Sales requested changes</p>
                        </div>
                        <div className="text-right ml-4">
                          <Link
                            href={`/quotes/${q.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Review
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'FUNDING_REQUEST') {
                  const req = item.data as any;
                  const amount = req.amountMinor ? Number(req.amountMinor) / 100 : 0;
                  return (
                    <div
                      key={`fund-${req.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-emerald-300 transition-all border-l-4 border-l-emerald-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">Funding Request</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {req.requisition?.project?.quote?.customer?.displayName ||
                              'Unknown Customer'}{' '}
                            • Requested by {req.requestedBy?.name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {req.requisition?.project?.projectNumber || 'N/A'} •{' '}
                            <Money minor={req.amountMinor} />
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            APPROVE
                          </span>
                          <Link
                            href={`/procurement/requisitions/${req.requisitionId}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                          >
                            Review
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'PROCUREMENT_TASK') {
                  const req = item.data as any; // { id, project: { projectNumber, quote: { customer } }, items: [] }
                  const itemCount = req.items?.length || 0;
                  return (
                    <div
                      key={`proc-${req.id}`}
                      className="block rounded-lg border border-gray-200 p-4 hover:border-pink-300 transition-all border-l-4 border-l-pink-400"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Requisition #{req.id.slice(-6).toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {req.project?.quote?.customer?.displayName || 'Unknown Customer'} •{' '}
                            {itemCount} Items
                          </p>
                          <p className="text-xs text-gray-500">
                            Project: {req.project?.projectNumber || 'N/A'} • Needs PO
                          </p>
                        </div>
                        <div className="text-right ml-4 flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                            ORDER
                          </span>
                          <Link
                            href={`/procurement/requisitions/${req.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                          >
                            View Requisition
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'SALES_TASK') {
                  const q = item.data as any;
                  let label = 'Action Needed';
                  let desc = 'Requires attention';
                  let colorClass = 'border-l-cyan-400 hover:border-cyan-300';
                  let btnColor = 'bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-500';

                  if (q.status === 'SENT_TO_SALES') {
                    label = 'New Lead / Quote';
                    desc = 'Ready for sales engagement';
                    colorClass = 'border-l-emerald-400 hover:border-emerald-300';
                    btnColor = 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500';
                  } else if (q.status === 'NEGOTIATION') {
                    label = 'Active Negotiation';
                    desc = 'Proposal under review';
                    colorClass = 'border-l-amber-400 hover:border-amber-300';
                    btnColor = 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500';
                  } else if (q.status === 'REVIEWED') {
                    label = 'Ready for Endorsement';
                    desc = 'Quote reviewed and finalized';
                    colorClass = 'border-l-blue-400 hover:border-blue-300';
                    btnColor = 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
                  }

                  return (
                    <div
                      key={`sales-${q.id}`}
                      className={`block rounded-lg border border-gray-200 p-4 transition-all border-l-4 ${colorClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{label}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {q.customer?.displayName || 'Unknown Customer'}
                          </p>
                          <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                        <div className="text-right ml-4">
                          <Link
                            href={`/quotes/${q.id}`}
                            className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${btnColor}`}
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                const payment = item.data as any;
                const amountDue = Number(payment.amountMinor) - Number(payment.paidMinor);
                const isDeposit = payment.label?.toLowerCase().includes('deposit');
                const canTakeAction = payment.status === 'DUE' || payment.status === 'PARTIAL';

                // Build URL with pre-filled form data as query params
                const amountInDollars = (amountDue / 100).toFixed(2);
                const paymentType = isDeposit ? 'deposit' : 'installment';
                const paymentUrl = `/projects/${payment.projectId}/payments?amount=${amountInDollars}&type=${paymentType}`;

                return (
                  <div
                    key={payment.id}
                    className="block rounded-lg border border-gray-200 p-4 hover:border-emerald-300 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {payment.project?.quote?.customer?.displayName || 'Unknown Customer'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {payment.label} • Due: {new Date(payment.dueOn).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          Project: {payment.project?.projectNumber || 'Number pending'}
                        </p>
                      </div>
                      <div className="text-right ml-4 flex items-center gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            <Money minor={BigInt(amountDue)} />
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              payment.status === 'PAID'
                                ? 'bg-green-100 text-green-800'
                                : payment.status === 'PARTIAL'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {payment.status}
                          </span>
                        </div>
                        {canTakeAction && (
                          <Link
                            href={paymentUrl}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                          >
                            Receive Payment
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-4">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <Link
                      href={`/dashboard?page=${Math.max(1, currentPage - 1)}${endDate ? `&endDate=${endDate}` : ''}`}
                      className={`relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${currentPage === 1 ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      Previous
                    </Link>
                    <Link
                      href={`/dashboard?page=${Math.min(totalPages, currentPage + 1)}${endDate ? `&endDate=${endDate}` : ''}`}
                      className={`relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      Next
                    </Link>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                        <span className="font-medium">
                          {Math.min(startIndex + itemsPerPage, totalItems)}
                        </span>{' '}
                        of <span className="font-medium">{totalItems}</span> results
                      </p>
                    </div>
                    <div>
                      <nav
                        className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                        aria-label="Pagination"
                      >
                        <Link
                          href={`/dashboard?page=${Math.max(1, currentPage - 1)}${endDate ? `&endDate=${endDate}` : ''}`}
                          className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 ${currentPage === 1 ? 'pointer-events-none opacity-50' : ''}`}
                        >
                          <span className="sr-only">Previous</span>
                          <svg
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </Link>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                          <Link
                            key={p}
                            href={`/dashboard?page=${p}${endDate ? `&endDate=${endDate}` : ''}`}
                            className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                              p === currentPage
                                ? 'z-10 bg-emerald-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600'
                                : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0'
                            }`}
                          >
                            {p}
                          </Link>
                        ))}
                        <Link
                          href={`/dashboard?page=${Math.min(totalPages, currentPage + 1)}${endDate ? `&endDate=${endDate}` : ''}`}
                          className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 ${currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}`}
                        >
                          <span className="sr-only">Next</span>
                          <svg
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </Link>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No pending tasks at the moment.</div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

async function RecentProjects() {
  const projects = await prisma.project.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      quote: {
        include: {
          customer: true,
          lines: true, // Include lines for total calculation
        },
      },
    },
  });

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Recent Projects</h3>
        <Link
          href="/projects"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View all →
        </Link>
      </div>
      {projects.length > 0 ? (
        <div className="space-y-4">
          {projects.map((project) => {
            const totalMinor =
              project.quote?.lines?.reduce(
                (sum: number, line: any) => sum + Number(line.lineTotalMinor || 0),
                0
              ) || 0;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {project.quote?.customer?.displayName || 'Unknown Customer'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Ref: {project.projectNumber || project.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-gray-900">
                      <Money minor={BigInt(totalMinor)} />
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500">No projects yet.</p>
      )}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ endDate?: string; page?: string; filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user?.role) {
    return <div className="p-6">Please log in.</div>;
  }
  const { endDate, page, filter } = await searchParams;

  // Simplified Project Operations Officer Dashboard
  if (user.role === 'PROJECT_OPERATIONS_OFFICER') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Welcome back, {user.name}. Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="mt-8">
            <PendingTasks
                userId={user.id}
                role={user.role}
                filter={filter}
                currentPage={1}
            />
        </div>
      </div>
    );
  }

  // Simplified QS Dashboard
  if (user.role === 'QS') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-6">
        <div className="text-center">
          <p className="text-xl text-gray-600">Welcome back, {user.name}.</p>
        </div>

        <Link
          href="/quotes/new"
          className="inline-flex w-full max-w-3xl justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-3xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
        >
          <PlusIcon className="h-10 w-10" />
          Create New Quotation
        </Link>
      </div>
    );
  }

  // Simplified Senior QS Dashboard
  if (user.role === 'SENIOR_QS') {
    const reviewCount = await prisma.quote.count({
      where: {
        status: { in: ['SUBMITTED_REVIEW', 'NEGOTIATION_REVIEW'] },
      },
    });

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-6">
        <div className="text-center">
          <p className="text-xl text-gray-600">Welcome back, {user.name}.</p>
        </div>

        <Link
          href="/quotes?review=pending"
          className="relative inline-flex w-full max-w-3xl justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-3xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
        >
          <span className="absolute right-5 top-5 flex min-h-8 min-w-8 items-center justify-center rounded-full bg-white px-2 text-sm font-black text-green-600 shadow-sm ring-2 ring-green-100">
            {reviewCount}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-10 w-10"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          Review Quotations
        </Link>
      </div>
    );
  }

  // Simplified Senior PM Dashboard
  if (user.role === 'PROJECT_COORDINATOR') {
    const unassignedCount = await prisma.project.count({
      where: {
        status: { notIn: ['CREATED', 'COMPLETED', 'CLOSED'] },
        assignedToId: null,
      },
    });

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-6">
        <div className="text-center">
          <p className="text-xl text-gray-600">Welcome back, {user.name}.</p>
        </div>

        <Link
          href="/projects?tab=assignment"
          className="inline-flex w-full max-w-3xl justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-3xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
        >
          <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Unassigned Projects
          {unassignedCount > 0 && (
            <span className="ml-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm text-green-600">
              {unassignedCount}
            </span>
          )}
        </Link>
      </div>
    );
  }

  // Simplified Sales Dashboard
  if (user.role === 'SALES') {
    const newQuotesCount = await prisma.quote.count({
      where: { status: 'SENT_TO_SALES' }
    });
    const pendingEndorsementsCount = await prisma.quote.count({
      where: { status: 'REVIEWED' }
    });

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-6">
        <div className="text-center">
          <p className="text-xl text-gray-600">Welcome back, {user.name}.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl justify-center">
          <Link
            href="/quotes?status=SENT_TO_SALES"
            className="flex-1 inline-flex justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-2xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-10 w-10">
              <path
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
              />
            </svg>
            New Quotations
            <span className="ml-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-base text-green-600">
              {newQuotesCount}
            </span>
          </Link>

          <Link
            href="/quotes?status=REVIEWED"
            className="flex-1 inline-flex justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-2xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-10 w-10">
              <path
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
              />
              <path
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v0Z"
              />
              <path strokeWidth="1.5" d="M9 12h6M9 16h6" />
            </svg>
            Pending Endorsements
            <span className="ml-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-base text-green-600">
              {pendingEndorsementsCount}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // Simplified Sales Accounts Dashboard
  if (user.role === 'SALES_ACCOUNTS') {
    const [duePaymentsCount, otherPaymentsCount] = await Promise.all([
      prisma.project.count({
        where: {
          OR: [
            {
              paymentSchedules: {
                some: {
                  OR: [
                    {
                      status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] },
                      dueOn: { lte: new Date() },
                    },
                    {
                      status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] },
                      label: { contains: 'Deposit', mode: 'insensitive' },
                    },
                  ],
                },
              },
            },
            {
              paymentSchedules: { none: {} },
              depositMinor: { gt: 0 },
              status: { notIn: ['COMPLETED', 'CLOSED'] },
            },
          ],
        },
      }),
      prisma.project.count({
        where: {
          status: { notIn: ['COMPLETED', 'CLOSED'] },
        },
      }),
    ]);

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-6">
        <div className="text-center">
          <p className="text-xl text-gray-600">Welcome back, {user.name}.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl justify-center">
          <Link
            href="/projects?tab=due_today"
            className="flex-1 inline-flex justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-2xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-10 w-10"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
              />
            </svg>
            Receive Due Payments
            <span className="ml-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-base text-green-600">
              {duePaymentsCount}
            </span>
          </Link>

          <Link
            href="/projects?tab=all_payments"
            className="flex-1 inline-flex justify-center items-center gap-4 rounded-2xl bg-green-500 px-8 py-10 text-2xl font-bold text-white shadow-lg transition-all hover:bg-green-600 hover:shadow-xl hover:-translate-y-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-10 w-10"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
              />
            </svg>
            Other Payments
            <span className="ml-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-base text-green-600">
              {otherPaymentsCount}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const currentPage = Number(page) || 1;
  const today = new Date().toISOString().slice(0, 10);

  const [cardData, revenueData, recentQuotes] = await Promise.all([
    fetchCardData(),
    fetchRevenueData(),
    fetchRecentQuotes(),
  ]);

  const isAdminOrMD = user.role === 'ADMIN' || user.role === 'MANAGING_DIRECTOR';
  const showQuotes = ['QS', 'SENIOR_QS', 'SALES'].includes(user.role);

  const tabs = [];

  if (!isAdminOrMD) {
    tabs.push({
      id: 'pending',
      label: 'Pending Tasks',
      content: (
        <div className="space-y-4">
          {user.role === 'SALES_ACCOUNTS' && (
            <div className="rounded-lg bg-white p-4 shadow border border-gray-200">
              <form
                action="/dashboard"
                method="get"
                className="flex flex-col sm:flex-row gap-4 items-end"
              >
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Before</label>
                  <input
                    type="date"
                    name="endDate"
                    defaultValue={endDate || today}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium shadow hover:bg-emerald-700 transition-colors"
                >
                  Filter
                </button>
              </form>
            </div>
          )}
          <PendingTasks
            userId={user.id}
            role={user.role}
            endDate={endDate}
            currentPage={currentPage}
            filter={filter}
          />
        </div>
      ),
    });

    tabs.push({
      id: 'overview',
      label: 'Projects & Quotations',
      content: (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="space-y-8">
              <RevenueChart data={revenueData} />
            </div>
            <div>{showQuotes ? <RecentQuotes quotes={recentQuotes} /> : <RecentProjects />}</div>
          </div>
        </div>
      ),
    });
  } else {
    // Admin/MD view

    // Insert Pending Tasks for Admin/MD too
    tabs.push({
      id: 'pending',
      label: 'Pending Tasks',
      content: (
        <div className="space-y-4">
          <PendingTasks
            userId={user.id}
            role={user.role}
            endDate={endDate}
            currentPage={currentPage}
            filter={filter}
          />
        </div>
      ),
    });

    tabs.push({
      id: 'projects',
      label: 'Projects',
      content: (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="space-y-8">
              <RevenueChart data={revenueData} />
            </div>
            <div>
              <RecentProjects />
            </div>
          </div>
        </div>
      ),
    });

    tabs.push({
      id: 'quotations',
      label: 'Quotations',
      content: (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="space-y-8">
              <RevenueChart data={revenueData} />
            </div>
            <div>
              <RecentQuotes quotes={recentQuotes} />
            </div>
          </div>
        </div>
      ),
    });
  }

  // For PM, Procurement, Security, and DRIVER, show ONLY the Button Grid (handled by PendingTasks)
  // For PM, Procurement, Security, and DRIVER, show ONLY the Button Grid (handled by PendingTasks)
  if (
    user.role === 'PROJECT_OPERATIONS_OFFICER' ||
    user.role === 'PROCUREMENT' ||
    user.role === 'SENIOR_PROCUREMENT' ||
    user.role === 'ACCOUNTS' ||
    user.role === 'ACCOUNTING_OFFICER' ||
    user.role === 'SECURITY' ||
    user.role === 'DRIVER' ||
    user.role === 'HUMAN_RESOURCE' ||
    user.role === 'ADMIN' ||
    user.role === 'MANAGING_DIRECTOR'
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Welcome back, {user.name}. Here&apos;s what&apos;s happening today.
          </p>
        </div>

        <Suspense fallback={<div>Loading actions...</div>}>
          <PendingTasks
            userId={user.id}
            role={user.role}
            endDate={endDate}
            currentPage={currentPage}
            filter={filter}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Welcome back, {user.name}. Here&apos;s what&apos;s happening today.
        </p>
      </div>

      <Suspense fallback={<div>Loading stats...</div>}>
        <StatsCards
          role={user.role}
          totalRevenue={cardData.totalRevenue}
          activeCustomers={cardData.numberOfCustomers}
          pendingQuotes={cardData.numberOfPendingQuotes}
          totalQuotes={cardData.numberOfQuotes}
          pendingProjects={cardData.numberOfPendingProjects}
          totalProjects={cardData.numberOfProjects}
        />
      </Suspense>

      <DashboardTabs tabs={tabs} />
    </div>
  );
}
