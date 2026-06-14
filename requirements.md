# ReconMarket — System Overview (How the App Works)

## 1. Introduction

ReconMarket is a construction materials marketplace that connects buyers and sellers in Rwanda. The platform allows users to discover, negotiate, and purchase construction materials safely using a structured trust system based on **verification, escrow payments, pickup confirmation, and OTP release**.

The platform is designed so that:

- Everyone starts as a normal user
- Any user can buy immediately
- Selling is unlocked through verification (individual or business)
- Payments are protected using escrow until completion

---

## 2. Core Idea of the Platform

ReconMarket is not just a marketplace.

It is built around 4 core principles:

1. **Access for Everyone** → Anyone can browse and buy
2. **Controlled Selling** → Only verified users can sell
3. **Secure Payments** → Money is held in escrow
4. **Transaction Proof** → Pickup + OTP ensures fairness

---

## 3. User Types & Permissions

### 3.1 Base Users

Every user starts as:

- `USER`

They can:
- Browse listings
- Search materials
- Chat with sellers
- Save listings
- Buy items

---

### 3.2 Verified Sellers

Users can upgrade their account to become sellers:

#### a) Individual Seller
- Verified using National ID / phone verification
- Can sell personal or surplus materials

#### b) Business Seller
- Verified using business documents (TIN, registration, etc.)
- Can sell as a registered company

Once approved:
- Selling is unlocked
- Listings become visible to buyers
- Trust badge is displayed

---

### 3.3 Admin

Admins manage the platform:
- Approve seller verification
- Manage users and listings
- Handle disputes
- Monitor transactions

---

## 4. Marketplace Flow (How Buying Works)

### Step 1: Browsing Listings

Sellers publish construction materials such as:
- Cement
- Bricks
- Steel
- Timber
- Plumbing materials

Buyers browse using:
- Search
- Categories
- Filters (price, location, seller type)

---

### Step 2: Initiating Purchase

A buyer selects a listing and clicks **Buy Now**.

At this point:
- The system creates a transaction
- Payment is required immediately
- Funds are not sent to the seller yet

---

## 5. Escrow Payment System (Core Protection Layer)

### What happens when payment is made:

1. Buyer pays for the item
2. Money is held securely in escrow
3. Seller is notified that payment is secured
4. Transaction becomes active

### Important Rule:
The seller NEVER receives money immediately.

---

## 6. Fulfillment Methods (Pickup Model Only)

ReconMarket uses a **pickup-based system** for MVP simplicity.

### How it works:

- Buyer and seller agree on pickup location
- Buyer goes physically to inspect and collect item
- Buyer confirms condition before final acceptance

---

## 7. Inspection Concept (Built into Pickup)

There is no separate inspection system.

Instead:

- Inspection happens physically during pickup
- Buyer decides whether to proceed after seeing goods
- Buyer has full control before final confirmation

---

## 8. Pickup Confirmation Process

Once the buyer is satisfied:

1. Buyer takes a pickup photo
2. Buyer confirms item collection in the app
3. System generates a secure OTP

---

## 9. OTP Release System

### Purpose:
To ensure the seller only gets paid after successful handover.

### Flow:

1. Buyer receives OTP after confirming pickup
2. Buyer gives OTP to seller
3. Seller enters OTP into system
4. System validates OTP
5. Payment is released from escrow to seller

---

## 10. Transaction Completion

After OTP verification:

- Transaction is marked as `COMPLETED`
- Seller receives funds
- Buyer and seller can rate each other

---

## 11. Reviews & Trust System

After every completed transaction:

- Buyer rates seller
- Seller can rate buyer

This builds:

- Trust score
- Reputation system
- Seller ranking

---

## 12. Chat System

Users can communicate through in-app chat:

- Buyer ↔ Seller communication
- Used for negotiation and coordination
- Chat history is stored for dispute resolution

---

## 13. Notifications System

Users receive notifications for:

- New messages
- Payment received
- OTP generation
- Transaction updates
- Account verification status

Notifications are delivered via:

- In-app notifications
- Email notifications

---

## 14. Email System

Emails are used for:

- Account verification
- Password reset
- Payment confirmations
- Important transaction updates

Emails are sent using an external email service provider (e.g. Resend, SendGrid).

---

## 15. Dispute System

If anything goes wrong:

Examples:
- Wrong material delivered
- Quantity mismatch
- Fraud suspicion

The system:
- Locks funds in escrow
- Collects evidence (chat, photos, logs)
- Admin reviews the case
- Admin decides outcome:
  - Release funds to seller
  - Refund buyer
  - Partial settlement

---

## 16. Security Model

The platform ensures security through:

- JWT authentication
- Password hashing
- Role-based access (USER / ADMIN)
- Seller verification system
- Escrow protection
- OTP verification
- Activity logging

---

## 17. Platform Summary Flow

```text
1. User registers (becomes USER)
2. User browses listings
3. User becomes verified seller (optional)
4. Seller creates listings
5. Buyer selects listing
6. Buyer pays → escrow holds money
7. Buyer goes for pickup
8. Buyer confirms item + takes photo
9. OTP is generated
10. Seller enters OTP
11. Escrow releases funds
12. Transaction is completed
13. Users leave reviews