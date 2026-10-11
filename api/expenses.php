<?php
/**
 * TripSplit - Expenses API Endpoint
 * Handles CRUD operations, equal & custom splits with fair remainder paise allocation
 */

require_once __DIR__ . '/config.php';

$pdo = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleGetExpenses($pdo);
        break;
    case 'POST':
        handleCreateExpense($pdo);
        break;
    case 'PUT':
        handleUpdateExpense($pdo);
        break;
    case 'DELETE':
        handleDeleteExpense($pdo);
        break;
    default:
        jsonError('Method Not Allowed', 405);
}

/**
 * Fetch expenses for a trip with filtering and participating member share details
 */
function handleGetExpenses(PDO $pdo): void {
    if (isset($_GET['id']) && is_numeric($_GET['id'])) {
        // Fetch single expense with shares
        $expenseId = (int)$_GET['id'];
        $stmt = $pdo->prepare("
            SELECT e.*, m.name AS payer_name
            FROM expenses e
            JOIN members m ON e.payer_member_id = m.id
            WHERE e.id = ?
        ");
        $stmt->execute([$expenseId]);
        $expense = $stmt->fetch();

        if (!$expense) {
            jsonError('Expense not found', 404);
        }

        $expense['amount_rupees'] = paiseToRupees((int)$expense['amount_paise']);

        // Fetch shares
        $shareStmt = $pdo->prepare("
            SELECT es.*, m.name AS member_name
            FROM expense_shares es
            JOIN members m ON es.member_id = m.id
            WHERE es.expense_id = ?
            ORDER BY m.name ASC
        ");
        $shareStmt->execute([$expenseId]);
        $shares = $shareStmt->fetchAll();

        foreach ($shares as &$s) {
            $s['share_rupees'] = paiseToRupees((int)$s['share_paise']);
        }
        $expense['shares'] = $shares;

        jsonResponse($expense);
    }

    $tripId = isset($_GET['trip_id']) ? (int)$_GET['trip_id'] : 0;
    if ($tripId <= 0) {
        jsonError('Valid trip_id parameter is required', 400);
    }

    // Build filter query
    $where = ["e.trip_id = ?"];
    $params = [$tripId];

    if (!empty($_GET['category'])) {
        $where[] = "e.category = ?";
        $params[] = trim($_GET['category']);
    }

    if (!empty($_GET['payer_id']) && is_numeric($_GET['payer_id'])) {
        $where[] = "e.payer_member_id = ?";
        $params[] = (int)$_GET['payer_id'];
    }

    if (!empty($_GET['search'])) {
        $where[] = "e.description LIKE ?";
        $params[] = '%' . trim($_GET['search']) . '%';
    }

    if (!empty($_GET['start_date'])) {
        $where[] = "e.expense_date >= ?";
        $params[] = $_GET['start_date'];
    }

    if (!empty($_GET['end_date'])) {
        $where[] = "e.expense_date <= ?";
        $params[] = $_GET['end_date'];
    }

    $sql = "
        SELECT e.*, m.name AS payer_name
        FROM expenses e
        JOIN members m ON e.payer_member_id = m.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY e.expense_date DESC, e.id DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $expenses = $stmt->fetchAll();

    // Attach shares to each expense
    $shareStmt = $pdo->prepare("
        SELECT es.*, m.name AS member_name
        FROM expense_shares es
        JOIN members m ON es.member_id = m.id
        WHERE es.expense_id = ?
        ORDER BY m.name ASC
    ");

    foreach ($expenses as &$exp) {
        $exp['amount_rupees'] = paiseToRupees((int)$exp['amount_paise']);
        $shareStmt->execute([(int)$exp['id']]);
        $shares = $shareStmt->fetchAll();
        foreach ($shares as &$s) {
            $s['share_rupees'] = paiseToRupees((int)$s['share_paise']);
        }
        $exp['shares'] = $shares;
    }

    jsonResponse($expenses);
}

/**
 * Validates and calculates member shares according to equal/custom rules
 * @param int $amountPaise
 * @param string $splitType 'equal' | 'custom'
 * @param array $participants Array of member IDs (for equal) or array of [member_id, share_rupees|share_paise]
 * @param array $tripMemberIds Set of valid member IDs in the trip
 * @return array Array of [ 'member_id' => int, 'share_paise' => int ]
 */
function calculateExpenseShares(int $amountPaise, string $splitType, array $participants, array $tripMemberIds): array {
    if (empty($participants)) {
        throw new InvalidArgumentException('At least one participating member must be selected.');
    }

    $shares = [];

    if ($splitType === 'equal') {
        $count = count($participants);
        $baseShare = intdiv($amountPaise, $count);
        $remainder = $amountPaise % $count;

        // Distribute integer paise fairly
        foreach ($participants as $index => $mId) {
            $memberId = (int)$mId;
            if (!in_array($memberId, $tripMemberIds, true)) {
                throw new InvalidArgumentException("Selected participant ID {$memberId} does not belong to this trip.");
            }
            $allocated = $baseShare + ($index < $remainder ? 1 : 0);
            $shares[] = [
                'member_id' => $memberId,
                'share_paise' => $allocated
            ];
        }
    } elseif ($splitType === 'custom') {
        $totalAllocated = 0;
        foreach ($participants as $p) {
            $memberId = (int)($p['member_id'] ?? 0);
            if (!in_array($memberId, $tripMemberIds, true)) {
                throw new InvalidArgumentException("Selected participant ID {$memberId} does not belong to this trip.");
            }

            $sharePaise = isset($p['share_paise']) ? (int)$p['share_paise'] : rupeesToPaise($p['share_rupees'] ?? 0);
            if ($sharePaise <= 0) {
                throw new InvalidArgumentException("Custom share for member must be greater than zero.");
            }

            $totalAllocated += $sharePaise;
            $shares[] = [
                'member_id' => $memberId,
                'share_paise' => $sharePaise
            ];
        }

        if ($totalAllocated !== $amountPaise) {
            $diffRupees = abs(paiseToRupees($totalAllocated - $amountPaise));
            $allocatedRupees = paiseToRupees($totalAllocated);
            $expectedRupees = paiseToRupees($amountPaise);
            throw new InvalidArgumentException("Sum of custom shares (₹{$allocatedRupees}) does not equal total expense amount (₹{$expectedRupees}). Difference: ₹{$diffRupees}.");
        }
    } else {
        throw new InvalidArgumentException("Invalid split type: {$splitType}. Expected 'equal' or 'custom'.");
    }

    return $shares;
}

/**
 * Create a new expense record with shares inside a transaction
 */
function handleCreateExpense(PDO $pdo): void {
    $input = getJsonInput();

    $tripId = isset($input['trip_id']) ? (int)$input['trip_id'] : 0;
    $description = trim($input['description'] ?? '');
    $category = trim($input['category'] ?? 'Other');
    $payerId = isset($input['payer_member_id']) ? (int)$input['payer_member_id'] : 0;
    $expenseDate = !empty($input['expense_date']) ? $input['expense_date'] : date('Y-m-d');
    $splitType = ($input['split_type'] ?? 'equal') === 'custom' ? 'custom' : 'equal';
    $rawAmount = $input['amount_rupees'] ?? $input['amount'] ?? 0;
    $amountPaise = isset($input['amount_paise']) ? (int)$input['amount_paise'] : rupeesToPaise($rawAmount);
    $participants = $input['participants'] ?? [];

    if ($tripId <= 0) {
        jsonError('Valid trip_id is required', 400);
    }
    if ($description === '') {
        jsonError('Expense description is required', 400);
    }
    if ($amountPaise <= 0) {
        jsonError('Expense amount must be greater than zero (minimum ₹0.01)', 400);
    }

    $validCategories = ['Food', 'Hotel', 'Transport', 'Shopping', 'Activities', 'Other'];
    if (!in_array($category, $validCategories, true)) {
        jsonError('Invalid expense category', 400);
    }

    // Verify trip members
    $mStmt = $pdo->prepare("SELECT id FROM members WHERE trip_id = ?");
    $mStmt->execute([$tripId]);
    $tripMemberIds = $mStmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($tripMemberIds)) {
        jsonError('This trip has no members. Add members before creating an expense.', 400);
    }

    if (!in_array($payerId, $tripMemberIds, true)) {
        jsonError('Selected payer is not a member of this trip', 400);
    }

    // Calculate and validate shares
    try {
        $shares = calculateExpenseShares($amountPaise, $splitType, $participants, $tripMemberIds);
    } catch (InvalidArgumentException $e) {
        jsonError($e->getMessage(), 422);
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            INSERT INTO expenses (trip_id, description, amount_paise, category, payer_member_id, expense_date, split_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$tripId, $description, $amountPaise, $category, $payerId, $expenseDate, $splitType]);
        $expenseId = (int)$pdo->lastInsertId();

        $shareInsert = $pdo->prepare("
            INSERT INTO expense_shares (expense_id, member_id, share_paise)
            VALUES (?, ?, ?)
        ");
        foreach ($shares as $s) {
            $shareInsert->execute([$expenseId, $s['member_id'], $s['share_paise']]);
        }

        $pdo->commit();

        jsonResponse([
            'id' => $expenseId,
            'trip_id' => $tripId,
            'description' => $description,
            'amount_paise' => $amountPaise,
            'amount_rupees' => paiseToRupees($amountPaise),
            'category' => $category,
            'payer_member_id' => $payerId,
            'expense_date' => $expenseDate,
            'split_type' => $splitType,
            'message' => 'Expense added successfully'
        ], 201);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonError('Failed to save expense: ' . $e->getMessage(), 500);
    }
}

/**
 * Update an existing expense and rewrite shares
 */
function handleUpdateExpense(PDO $pdo): void {
    $input = getJsonInput();

    $id = isset($input['id']) ? (int)$input['id'] : 0;
    $description = trim($input['description'] ?? '');
    $category = trim($input['category'] ?? 'Other');
    $payerId = isset($input['payer_member_id']) ? (int)$input['payer_member_id'] : 0;
    $expenseDate = !empty($input['expense_date']) ? $input['expense_date'] : date('Y-m-d');
    $splitType = ($input['split_type'] ?? 'equal') === 'custom' ? 'custom' : 'equal';
    $rawAmount = $input['amount_rupees'] ?? $input['amount'] ?? 0;
    $amountPaise = isset($input['amount_paise']) ? (int)$input['amount_paise'] : rupeesToPaise($rawAmount);
    $participants = $input['participants'] ?? [];

    if ($id <= 0) {
        jsonError('Valid expense ID is required', 400);
    }
    if ($description === '') {
        jsonError('Expense description is required', 400);
    }
    if ($amountPaise <= 0) {
        jsonError('Expense amount must be greater than zero', 400);
    }

    $validCategories = ['Food', 'Hotel', 'Transport', 'Shopping', 'Activities', 'Other'];
    if (!in_array($category, $validCategories, true)) {
        jsonError('Invalid expense category', 400);
    }

    // Get current expense to find trip_id
    $chk = $pdo->prepare("SELECT id, trip_id FROM expenses WHERE id = ?");
    $chk->execute([$id]);
    $existing = $chk->fetch();
    if (!$existing) {
        jsonError('Expense not found', 404);
    }
    $tripId = (int)$existing['trip_id'];

    // Verify trip members
    $mStmt = $pdo->prepare("SELECT id FROM members WHERE trip_id = ?");
    $mStmt->execute([$tripId]);
    $tripMemberIds = $mStmt->fetchAll(PDO::FETCH_COLUMN);

    if (!in_array($payerId, $tripMemberIds, true)) {
        jsonError('Selected payer is not a member of this trip', 400);
    }

    try {
        $shares = calculateExpenseShares($amountPaise, $splitType, $participants, $tripMemberIds);
    } catch (InvalidArgumentException $e) {
        jsonError($e->getMessage(), 422);
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            UPDATE expenses
            SET description = ?, amount_paise = ?, category = ?, payer_member_id = ?, expense_date = ?, split_type = ?
            WHERE id = ?
        ");
        $stmt->execute([$description, $amountPaise, $category, $payerId, $expenseDate, $splitType, $id]);

        // Replace shares
        $delShares = $pdo->prepare("DELETE FROM expense_shares WHERE expense_id = ?");
        $delShares->execute([$id]);

        $shareInsert = $pdo->prepare("
            INSERT INTO expense_shares (expense_id, member_id, share_paise)
            VALUES (?, ?, ?)
        ");
        foreach ($shares as $s) {
            $shareInsert->execute([$id, $s['member_id'], $s['share_paise']]);
        }

        $pdo->commit();

        jsonResponse([
            'id' => $id,
            'message' => 'Expense updated successfully'
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonError('Failed to update expense: ' . $e->getMessage(), 500);
    }
}

/**
 * Delete an expense
 */
function handleDeleteExpense(PDO $pdo): void {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        $input = getJsonInput();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
    }

    if ($id <= 0) {
        jsonError('Valid expense id is required', 400);
    }

    $chk = $pdo->prepare("SELECT id, description FROM expenses WHERE id = ?");
    $chk->execute([$id]);
    $exp = $chk->fetch();
    if (!$exp) {
        jsonError('Expense not found', 404);
    }

    // Cascade deletes shares automatically
    $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ?");
    $stmt->execute([$id]);

    jsonResponse([
        'message' => "Expense '{$exp['description']}' deleted successfully"
    ]);
}
