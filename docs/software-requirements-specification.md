# Barmlo ERP Software Requirements Specification

## Document Control

- Document title: Barmlo ERP Software Requirements Specification
- Document type: Formal requirements specification
- Audience: Client stakeholders, project sponsors, analysts, developers, testers, and administrators
- Version: 2.0
- Date: 2026-06-05

## 1. Introduction

### 1.1 Purpose

This document defines the functional and non-functional requirements for Barmlo ERP based on the current codebase, workflow rules, and verified protected navigation. It describes what the software is expected to do and how its major business capabilities are organized.

### 1.2 Scope

Barmlo ERP is a web-based enterprise system that supports the lifecycle from quotation through project execution, procurement, dispatch, payment monitoring, reporting, and administrative control.

### 1.3 Business context

The system is intended to solve a multi-department coordination problem. Commercial teams need to prepare and approve quotations. Sales teams need to negotiate and endorse work. Project teams need to coordinate execution. Procurement and finance teams need to control purchasing and funding. Logistics teams need to manage dispatch and delivery. Management needs reporting and oversight.

### 1.4 Stakeholders

- client sponsors
- operational leadership
- sales leadership
- procurement leadership
- finance leadership
- project coordination teams
- administrators and support staff
- delivery teams and site-facing teams

## 2. Product Overview

### 2.1 Product positioning

Barmlo ERP is a role-based internal business platform. It centralizes operational records and reduces the need to manage quotations, projects, procurement, dispatch, and payments in disconnected tools.

### 2.2 Product objectives

- improve control over the quote-to-project handoff
- reduce operational delays caused by poor visibility
- improve funding and procurement discipline
- improve dispatch accountability
- improve payment and project reporting visibility
- support administrative audit and recovery workflows

### 2.3 User classes defined in the current system

- QS
- SENIOR_QS
- SALES
- SALES_ACCOUNTS
- ADMIN
- CLIENT
- VIEWER
- PROJECT_OPERATIONS_OFFICER
- PROJECT_COORDINATOR
- PROCUREMENT
- SENIOR_PROCUREMENT
- SECURITY
- ACCOUNTS
- CASHIER
- ACCOUNTING_OFFICER
- ACCOUNTING_AUDITOR
- ACCOUNTING_CLERK
- DRIVER
- PM_CLERK
- GENERAL_MANAGER
- MANAGING_DIRECTOR
- FOREMAN
- HUMAN_RESOURCE

## 3. Product Capabilities

The current system provides these major capability areas:

- authentication and role-based access
- quotation creation and review
- negotiation and endorsement
- project visibility and coordination
- requisitions, funding, and procurement
- dispatch and delivery tracking
- payment monitoring and reporting
- administrative control, audit visibility, and recycle bin access

## 4. Functional Requirements

### 4.1 Authentication and access control requirements

FR-1. The system shall require authentication for protected application areas.

FR-2. The system shall present role-based navigation after successful sign-in.

FR-3. The system shall enforce role validation on protected server-side flows.

FR-4. The system shall recognize the user roles defined in the shared workflow configuration.

FR-5. The system shall allow administrative override behavior where explicitly supported by shared role logic.

### 4.2 Quotation management requirements

FR-6. The system shall allow QS users to create draft quotations.

FR-7. The system shall allow QS users to maintain quotations in their working queue.

FR-8. The system shall allow quotes to be submitted for internal review.

FR-9. The system shall allow Senior QS users to review quotations before Sales handling.

FR-10. The system shall allow Senior QS users to move reviewed quotations into the Sales pipeline.

FR-11. The system shall support the quotation statuses `DRAFT`, `SUBMITTED_REVIEW`, `REVIEWED`, `SENT_TO_SALES`, `NEGOTIATION`, `NEGOTIATION_REVIEW`, `FINALIZED`, and `ARCHIVED`.

FR-12. The system shall enforce status transitions according to role-based workflow rules.

FR-13. The system shall support manual item management for permitted commercial roles.

FR-14. The system shall support rate management for permitted commercial roles.

FR-15. The system shall support PDF generation for quotation-related output.

### 4.3 Negotiation and endorsement requirements

FR-16. The system shall allow Sales users to process quotations in the sales stage.

FR-17. The system shall support negotiation-stage workflow handling.

FR-18. The system shall allow Sales users to endorse accepted quotations.

FR-19. The system shall capture endorsement inputs including commencement date, deposit amount, installment amount, and due day.

FR-20. The system shall create or update a linked project record after endorsement.

### 4.4 Project operations requirements

FR-21. The system shall provide project visibility to project-side and management roles according to their permissions.

FR-22. The system shall provide project coordination views including active, unassigned, and planning-pending views where configured.

FR-23. The system shall provide schedule visibility for project operations and coordination roles.

FR-24. The system shall provide daily task visibility where configured.

FR-25. The system shall provide end-of-day reporting access where configured.

### 4.5 Requisition, funding, and procurement requirements

FR-26. The system shall allow project-side users to raise requisitions.

FR-27. The system shall allow procurement users to request funding.

FR-28. The system shall allow finance-facing roles to approve or reject funding requests.

FR-29. The system shall allow procurement users to record purchase completion details.

FR-30. The system shall allow Senior Procurement users to review price-review and quantity-top-up cases.

### 4.6 Dispatch and delivery requirements

FR-31. The system shall allow project-side users to create dispatch records.

FR-32. The system shall allow Security users to approve dispatches for release.

FR-33. The system shall provide driver-facing pickup, delivery, and settled views.

FR-34. The system shall support delivery-state visibility for site-facing and transport-facing roles.

### 4.7 Payments and reporting requirements

FR-35. The system shall provide payment tracking views for Sales Accounts, finance roles, and administrators where configured.

FR-36. The system shall provide payment history reporting.

FR-37. The system shall provide profit and loss reporting for permitted roles.

FR-38. The system shall provide material reconciliation reporting for Project Coordinators.

FR-39. The system shall provide general reports access to permitted operational, procurement, finance, and management roles.

### 4.8 Administration requirements

FR-40. The system shall provide user management functionality for administrators.

FR-41. The system shall provide audit log visibility for administrators.

FR-42. The system shall provide recycle bin visibility for deleted quotations to administrators.

## 5. Business Use Cases

### 5.1 Commercial use cases

- create quotation
- review quotation
- send quotation to Sales
- negotiate quote outcome
- endorse accepted quote

### 5.2 Operational use cases

- review project workload
- coordinate project planning
- raise requisition
- review schedules and daily tasks
- create dispatch

### 5.3 Procurement and finance use cases

- request funding
- approve funding
- record purchase
- track due payments
- review payment history
- review project profit and loss

### 5.4 Administrative use cases

- manage users
- inspect audit activity
- recover deleted quote records

## 6. Non-Functional Requirements

### 6.1 Security

NFR-1. Protected pages shall require valid authentication.

NFR-2. Privileged operations shall be role-controlled.

NFR-3. Shared role helpers shall reject unsupported role values.

### 6.2 Reliability

NFR-4. Business-critical actions shall be persisted through controlled server-side flows.

NFR-5. Workflow-sensitive reminders shall support short-running background execution patterns where implemented.

### 6.3 Traceability

NFR-6. The system shall maintain visible status progression for quotations.

NFR-7. The system shall provide audit visibility for administrators.

### 6.4 Usability

NFR-8. The interface shall reduce clutter by presenting role-specific navigation.

NFR-9. The system shall provide business-readable pages for commercial, operational, procurement, and finance users.

### 6.5 Maintainability

NFR-10. Shared business rules shall remain centralized where possible.

NFR-11. The codebase shall remain testable using the repository’s unit and end-to-end test tooling.

## 7. External Interfaces and Technical Context

The current repository indicates that the product is implemented using:

- Next.js App Router
- React
- TypeScript
- Prisma ORM
- Zod validation
- Tailwind CSS
- NextAuth authentication
- PDF generation through React PDF and Puppeteer-based support
- Vitest and Playwright test tooling

The repository guidance indicates SQLite for development and PostgreSQL for production-style deployment.

## 8. Assumptions and Constraints

- Not every role currently has a fully visible sidebar surface in the verified live sessions.
- Some roles are defined in code but require further business confirmation to produce a complete end-user operating guide.
- The current documentation set reflects the existing deployed surface and repository logic, not speculative future behavior.

## 9. Open Clarifications for Client Review

- Should `CLIENT`, `VIEWER`, `PM_CLERK`, and `HUMAN_RESOURCE` receive expanded visible workflows in future phases?
- Should a dedicated customer invoice lifecycle be exposed directly in the application?
- Should inventory adjustment, return, or damage workflows be exposed more explicitly in the interface?
- Should reminder outputs be integrated with email, SMS, or another notification channel in a later release?

## 10. Acceptance Basis

This requirements baseline is met when:

1. authenticated users can access only the modules intended for their roles
2. the quotation lifecycle can move from creation through review, sales handling, and endorsement
3. project-side users can work through planning, requisition, and dispatch flows
4. procurement and finance users can perform funding and purchase control activities
5. reporting and administrative oversight views are available to the appropriate roles