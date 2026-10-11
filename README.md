# TripSplit — Group Trip Expense Splitter

TripSplit is a full-stack, responsive web application for managing and splitting group travel expenses. One organizer can create trips, add friends, record shared expenses (equal and custom splits with fair remainder paise allocation), track real-time balances, compute simplified debt settlements, and record full or partial repayments.

---

## 1. Technology Stack

- **Frontend:** HTML5, CSS3 (Custom Design System with Slate/Indigo Palette), Bootstrap 5.3, AngularJS 1.8.2, JavaScript, Chart.js 4.4.
- **Backend:** PHP 8+ with PDO and prepared statements.
- **Database:** MySQL 5.7+ / 8.0+ / MariaDB (`tripsplit_db`).
- **Environment:** XAMPP (Apache + MySQL/phpMyAdmin).
- **Communication:** AngularJS `$http` service interacting with RESTful PHP JSON endpoints.

---

## 2. Project Directory Structure

```text
TripSplit/
├── index.html                           # Main Application Dashboard & Single-Page Shell
├── trip-details.html                    # Dedicated Trip Details & Management View
├── add-expense.html                     # Dedicated Add Expense View with Live Preview
├── balances.html                        # Dedicated Balances & Settlements View
├── database.sql                         # Complete MySQL Schema & Sample Data ("Goa Trip")
├── README.md                            # Comprehensive Setup & Troubleshooting Guide
├── assets/
│   ├── css/
│   │   └── style.css                    # Design system, cards, animations, and color tokens
│   └── js/
│       ├── app.js                       # AngularJS app initialization & Indian Rupee filters
│       ├── services/
│       │   └── apiService.js            # Centralized $http service for all API calls
│       └── controllers/
│           ├── DashboardController.js   # Trip creation, listing, edit, delete
│           ├── TripController.js        # Active trip management, tabs, member operations
│           ├── ExpenseController.js     # Expense CRUD, live equal & custom split preview
│           ├── SettlementController.js  # Balances, debt simplification, payment recording
│           └── ReportController.js      # Category summaries and Chart.js analytics
└── api/
    ├── config.php                       # PDO connection, CORS, paise helpers, debt solver
    ├── trips.php                        # GET, POST, PUT, DELETE for trips
    ├── members.php                      # Member CRUD with strict financial delete guards
    ├── expenses.php                     # Expense CRUD with integer paise arithmetic
    ├── balances.php                     # Net balance calculations & zero-sum verification
    └── settlements.php                  # Recording, listing, reversing repayments
```

---

## 3. Installation & Setup Guide (XAMPP & phpMyAdmin)

### Step 1: Place Project in XAMPP's `htdocs` Folder
1. Locate your XAMPP installation directory (typically `C:\xampp`).
2. Navigate to the `htdocs` directory:
   ```text
   C:\xampp\htdocs\
   ```
3. Copy or move this entire project folder into `htdocs` and name it `tripsplit`:
   ```text
   C:\xampp\htdocs\tripsplit\
   ```

### Step 2: Start Apache and MySQL in XAMPP
1. Open the **XAMPP Control Panel**.
2. Click the **Start** button next to **Apache**.
3. Click the **Start** button next to **MySQL**.
4. Both modules should turn green, indicating they are running.

### Step 3: Configure Database Connection
Open `api/config.php` and verify the MySQL connection settings:
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'tripsplit_db');
define('DB_USER', 'root');
define('DB_PASS', '');       // Default is empty in XAMPP
define('DB_PORT', 3306);
```
*(If your MySQL server uses a password or a different port such as 3307, update `DB_PASS` or `DB_PORT` accordingly).*

### Step 4: Import `database.sql` via phpMyAdmin
1. Open your browser and navigate to:
   ```text
   http://localhost/phpmyadmin/
   ```
2. Click on the **Import** tab at the top.
3. Click **Choose File** (or Browse) and select the `database.sql` file located in `C:\xampp\htdocs\tripsplit\database.sql`.
4. Click **Go** (or Import) at the bottom right.
5. phpMyAdmin will execute the script, automatically creating the `tripsplit_db` database, all required relational tables (`trips`, `members`, `expenses`, `expense_shares`, `settlements`), and importing sample data for the "Goa Trip".

### Step 5: Launch the Application
Open your browser and navigate to the local URL:
```text
http://localhost/tripsplit/
```
You can also directly access specific views:
- **Dashboard / Main App:** `http://localhost/tripsplit/index.html`
- **Trip Details:** `http://localhost/tripsplit/trip-details.html?id=1`
- **Add Expense:** `http://localhost/tripsplit/add-expense.html?trip_id=1`
- **Balances & Settlements:** `http://localhost/tripsplit/balances.html?trip_id=1`

---

## 4. Financial Calculations & Verification

### The Golden Formula
For each trip participant $M_i$:
$$\text{Balance} = \text{Total Expenses Paid} - \text{Assigned Expense Shares} + \text{Repayments Sent} - \text{Repayments Received}$$

- **Positive Balance ($> 0$):** Member is a creditor and should **receive** money.
- **Negative Balance ($< 0$):** Member is a debtor and **owes** money.
- **Zero Balance ($= 0$):** Member is completely **settled**.
- **Ledger Invariant:** The sum of all member balances is mathematically guaranteed to equal **₹0.00**.

### Integer Paise Arithmetic
To prevent floating-point rounding anomalies common in financial applications, all calculations on both the frontend and backend are stored and computed in **integer paise** ($1\text{ Rupee} = 100\text{ Paise}$). Amounts are converted to formatted Indian Rupees (`₹1,500.00`) only for visual presentation.

### Fair Remainder Paise Distribution (Equal Splits)
When dividing an amount that does not split into whole paise (e.g. ₹100.00 among 3 participants = 10,000 paise / 3 = 3,333 paise with remainder 1):
- Base share: $3,333\text{ paise}$ (₹33.33)
- Remainder: $1\text{ paisa}$ distributed to the first participant:
  - Neev: ₹33.34 ($3,334\text{ paise}$)
  - Rahul: ₹33.33 ($3,333\text{ paise}$)
  - Jeel: ₹33.33 ($3,333\text{ paise}$)
  - Sum: $3,334 + 3,333 + 3,333 = 10,000\text{ paise}$ (₹100.00 exactly).

### Verification with Sample Data ("Goa Trip")
The pre-seeded database contains:
1. **Neev** paid ₹3,000.00 for Hotel (shared equally by Neev, Rahul, Jeel $\rightarrow$ ₹1,000.00 each).
2. **Rahul** paid ₹1,500.00 for Food (shared equally by Neev, Rahul, Jeel $\rightarrow$ ₹500.00 each).
3. **Jeel** paid ₹1,500.00 for Transport (shared equally by Neev, Rahul, Jeel $\rightarrow$ ₹500.00 each).

**Calculated Results:**
- **Total Trip Cost:** ₹6,000.00.
- **Each Member's Assigned Share:** ₹2,000.00.
- **Neev:** Paid ₹3,000.00 $-$ Share ₹2,000.00 = **+₹1,000.00 (Gets Back)**.
- **Rahul:** Paid ₹1,500.00 $-$ Share ₹2,000.00 = **-₹500.00 (Owes)**.
- **Jeel:** Paid ₹1,500.00 $-$ Share ₹2,000.00 = **-₹500.00 (Owes)**.
- **Suggested Settlements:**
  - Rahul $\rightarrow$ Neev ₹500.00
  - Jeel $\rightarrow$ Neev ₹500.00
- Clicking **"Record Payment"** next to each suggestion records the repayment, immediately transitioning the trip to **"All Settled Up!"**.

---

## 5. Security & Data Integrity Features

1. **PDO Prepared Statements:** Every database query in all endpoints (`api/*.php`) uses parameterized prepared statements, preventing SQL injection.
2. **Database Transactions:** Multi-step modifications (e.g., creating expenses and inserting shares, updating expenses) are wrapped in `beginTransaction()`, `commit()`, and `rollBack()` blocks.
3. **Financial Integrity Member Deletion Guard:** Members who have paid expenses, participated in shares, or engaged in settlement transfers cannot be accidentally deleted. The API returns HTTP 422 with a specific list of linked records that must first be resolved.
4. **Custom Split Exactness Check:** Custom splits reject any entry where the sum of shares does not equal the expense total down to the exact paisa.
5. **Reversible Settlements:** Payments can be reversed or deleted safely, restoring member balances without corrupting ledger history.

---

## 6. Troubleshooting Common Errors

### 1. `Database connection failed: SQLSTATE[HY000] [2002] Connection refused`
- **Cause:** MySQL service in XAMPP is stopped or running on a different port.
- **Solution:** Open XAMPP Control Panel and start MySQL. If your MySQL runs on port 3307, change `define('DB_PORT', 3307);` in `api/config.php`.

### 2. `Database connection failed: SQLSTATE[HY000] [1049] Unknown database 'tripsplit_db'`
- **Cause:** The database was not imported.
- **Solution:** Go to `http://localhost/phpmyadmin/`, click **Import**, select `database.sql`, and click **Go**.

### 3. Blank Page or CORS / 404 API Errors
- **Cause:** Project is opened directly via `file:///` in the browser instead of an HTTP web server.
- **Solution:** Always access the application through Apache at `http://localhost/tripsplit/`.

### 4. `Cannot delete member: Member has active financial records`
- **Cause:** Protective guard preventing corrupted ledger records.
- **Solution:** Either delete or reassign the expenses and settlements involving this member before removing them.

---

## 7. License & Credits
Developed as an enterprise-grade Group Trip Expense Splitter mini-project utilizing HTML5, Bootstrap 5, AngularJS 1.x, PHP 8 (PDO), and MySQL.
