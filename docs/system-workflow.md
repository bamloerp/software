# Barmlo ERP System Workflow Document

## Document Control

- Document title: Barmlo ERP System Workflow Document
- Document type: Business process and system workflow guide
- Audience: Clients, business stakeholders, operations leaders, trainers, and implementation teams
- Version: 2.0
- Date: 2026-06-05

## 1. Introduction

### 1.1 Purpose

This document explains how work moves through Barmlo ERP from the first commercial quotation through project planning, procurement, dispatch, delivery, payments, and management oversight.

### 1.2 Why this workflow matters

The system is designed to stop work from being handled in isolated departmental silos. Each stage hands off to the next stage using a visible record in the application.

## 2. Workflow Summary

At a high level, the workflow is:

1. quote preparation
2. internal commercial review
3. sales handling and negotiation
4. endorsement and project creation
5. project planning and coordination
6. requisition and funding
7. procurement and purchasing
8. dispatch and delivery
9. payment monitoring and reporting
10. oversight and administration

## 3. Quotation Workflow

### 3.1 What happens

The quotation workflow starts when a QS prepares a commercial proposal.

### 3.2 Why it happens

The business needs a controlled way to turn client demand into an approved commercial position.

### 3.3 When it happens

- when a new opportunity is received
- when a client requests pricing
- when an earlier quote needs revision and resubmission

### 3.4 How it happens

1. QS creates the quotation.
2. QS saves and refines the quote.
3. QS submits the quote for review.
4. Senior QS reviews the content.
5. Senior QS sends the quote to Sales when it is ready.

### 3.5 Quotation statuses currently defined

- DRAFT
- SUBMITTED_REVIEW
- REVIEWED
- SENT_TO_SALES
- NEGOTIATION
- NEGOTIATION_REVIEW
- FINALIZED
- ARCHIVED

## 4. Negotiation and Endorsement Workflow

### 4.1 What happens

Sales takes control of the quote after internal review and manages the commercial outcome with the client.

### 4.2 Why it happens

This stage turns an internally approved quote into an agreed deal that operations can execute.

### 4.3 When it happens

- after Senior QS sends the quote to Sales
- after the client reviews the commercial proposal
- when the deal is ready to move into delivery planning

### 4.4 How it happens

1. Sales reviews the quotation in the Sales queue.
2. Sales manages the negotiation stage.
3. Sales enters endorsement details when the deal is accepted.
4. The system creates or updates the linked project.

### 4.5 Endorsement inputs

- commencement date
- deposit amount
- installment amount
- due day

## 5. Project Planning Workflow

### 5.1 What happens

Once the project exists, project-side teams begin planning, coordination, and execution preparation.

### 5.2 Why it happens

Projects cannot move effectively into delivery without visibility into planning, ownership, and current status.

### 5.3 When it happens

- immediately after endorsement
- when work is assigned to a coordinator or operations team
- during active execution tracking

### 5.4 How it happens

1. Project Coordinators review active, unassigned, or planning-pending projects.
2. Project Operations Officers review the operational workload.
3. Schedules, daily tasks, and end-of-day workflows support execution tracking.

## 6. Requisition Workflow

### 6.1 What happens

Project-side users raise requisitions when the project needs material or supply support.

### 6.2 Why it happens

Requisitions formalize demand and create a controlled record for procurement.

### 6.3 When it happens

- when a project needs materials, services, or site support items
- when approved planning turns into material demand

### 6.4 How it happens

1. The project-side user opens the requisition area.
2. The user selects the project.
3. The required demand is recorded.
4. The requisition is submitted for downstream handling.

## 7. Funding and Procurement Workflow

### 7.1 What happens

Procurement reviews the demand and requests funding where required. Finance-facing roles approve or reject the funding request. Procurement then records the purchase outcome.

### 7.2 Why it happens

This stage protects cost control and ensures that purchases are visible and approved.

### 7.3 When it happens

- after a requisition is raised
- before supplier purchase completion
- when price changes or quantity increases require review

### 7.4 How it happens

1. Procurement opens the relevant requisition or purchase order queue.
2. Procurement requests funding.
3. Accounts or accounting roles review the request.
4. The request is approved or rejected.
5. Procurement records the purchase details.
6. Senior Procurement reviews price-review or quantity-top-up cases where required.

### 7.5 Reminder and escalation behavior

The repository notes background reminder patterns for:

- projects approaching commencement date
- pending funding requests that remain unresolved

These reminders support operational follow-up and escalation.

## 8. Dispatch Workflow

### 8.1 What happens

Materials or items are prepared for controlled movement from the business to the destination.

### 8.2 Why it happens

Dispatch control provides accountability for stock movement and delivery handling.

### 8.3 When it happens

- after project materials are available and approved for movement
- when a site or project needs delivery

### 8.4 How it happens

1. The project-side team creates the dispatch.
2. Security reviews the dispatch for release.
3. Driver-facing views show the assigned pickup or delivery.
4. The movement progresses to completed or settled status.

## 9. Delivery Confirmation Workflow

### 9.1 What happens

After release, transport and site-facing roles confirm movement progress and completion.

### 9.2 Why it happens

The business needs a visible record that the items reached the correct operational stage.

### 9.3 When it happens

- after dispatch approval
- while items are in transit
- when delivery is completed

### 9.4 How it happens

1. Driver reviews pickup and delivery queues.
2. Security or transport-facing users follow the movement status.
3. Settled views show completed work.

## 10. Payment Workflow

### 10.1 What happens

Finance-facing roles monitor payment expectations and actual payment activity linked to projects.

### 10.2 Why it happens

This supports cashflow control, customer follow-up, and project financial reporting.

### 10.3 When it happens

- after Sales endorsement establishes payment expectations
- when customer payments fall due
- during finance review and reporting cycles

### 10.4 How it happens

1. Finance-facing users open due-payment or payments views.
2. They review the project-linked payment position.
3. Payments are recorded and followed through payment-history views.
4. Profit and loss reporting reflects the broader project financial picture.

## 11. Reporting Workflow

### 11.1 What happens

The system provides role-based reporting for operational and financial review.

### 11.2 Why it happens

Leaders and coordinators need visibility into delivery performance, material control, and financial position.

### 11.3 When it happens

- during daily coordination
- during weekly or monthly review
- during management reporting and issue investigation

### 11.4 How it happens

Users open the reports relevant to their role, including:

- payment history
- material reconciliation
- profit and loss
- end-of-day reporting

## 12. Administrative Workflow

### 12.1 What happens

Administrative users manage user access, audit visibility, and deleted-quote recovery.

### 12.2 Why it happens

Administrative governance protects data control, accountability, and recovery.

### 12.3 When it happens

- when users join, leave, or change role
- when activity needs to be audited
- when a deleted quotation needs review or restoration

### 12.4 How it happens

1. Admin opens the appropriate administrative module.
2. The required record is reviewed.
3. The administrator applies the necessary control action.

## 13. Role Participation by Workflow Stage

The primary role ownership across the main workflow is:

- quote preparation: QS
- commercial review: Senior QS
- negotiation and endorsement: Sales
- project coordination: Project Coordinator and Project Operations Officer
- procurement execution: Procurement and Senior Procurement
- funding approval: Accounts and related accounting roles
- dispatch control: project-side roles, Security, and Driver
- executive oversight: Managing Director, General Manager, and Admin

## 14. Known Clarifications Still Needed

The current codebase confirms several roles and workflow paths, but these areas still need client confirmation if they are to be documented more deeply in a future revision:

- Client role behavior
- Viewer role behavior
- PM Clerk workflow
- Human Resource workflow
- full user-facing inventory exception handling

## 15. Closing Summary

Barmlo ERP is structured as a linked operational chain rather than a set of isolated screens. Each department receives role-based visibility, and the workflow is intended to move cleanly from commercial preparation to operational delivery and financial oversight.