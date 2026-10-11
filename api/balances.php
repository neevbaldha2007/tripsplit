<?php
/**
 * TripSplit - Balances and Settlements API Endpoint
 * Calculates precise member balances in paise, ensures ledger sum = 0,
 * and generates automated settlement suggestions.
 */

require_once __DIR__ . '/config.php';

$pdo = getDbConnection();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Method Not Allowed', 405);
}

$tripId = isset($_GET['trip_id']) ? (int)$_GET['trip_id'] : 0;
if ($tripId <= 0) {
    jsonError('Valid trip_id query parameter is required', 400);
}

// 1. Verify trip existence
$tStmt = $pdo->prepare("SELECT id, name, destination, start_date, end_date FROM trips WHERE id = ?");
$tStmt->execute([$tripId]);
$trip = $tStmt->fetch();
if (!$trip) {
    jsonError('Trip not found', 404);
}

// 2. Fetch all members of this trip
$mStmt = $pdo->prepare("SELECT id, name FROM members WHERE trip_id = ? ORDER BY id ASC");
$mStmt->execute([$tripId]);
$members = $mStmt->fetchAll();

// 3. Calculate financial metrics for each member
$memberBalances = [];
$totalTripExpensesPaise = 0;
$totalBalancesPaiseSum = 0;

foreach ($members as $m) {
    $memberId = (int)$m['id'];

    // Total expenses paid by this member
    $paidStmt = $pdo->prepare("
        SELECT COALESCE(SUM(amount_paise), 0)
        FROM expenses
        WHERE trip_id = ? AND payer_member_id = ?
    ");
    $paidStmt->execute([$tripId, $memberId]);
    $paidPaise = (int)$paidStmt->fetchColumn();

    // Total assigned expense shares for this member
    $shareStmt = $pdo->prepare("
        SELECT COALESCE(SUM(es.share_paise), 0)
        FROM expense_shares es
        JOIN expenses e ON es.expense_id = e.id
        WHERE e.trip_id = ? AND es.member_id = ?
    ");
    $shareStmt->execute([$tripId, $memberId]);
    $sharePaise = (int)$shareStmt->fetchColumn();

    // Completed repayments sent by this member
    $sentStmt = $pdo->prepare("
        SELECT COALESCE(SUM(amount_paise), 0)
        FROM settlements
        WHERE trip_id = ? AND sender_member_id = ? AND status = 'completed'
    ");
    $sentStmt->execute([$tripId, $memberId]);
    $repaymentsSentPaise = (int)$sentStmt->fetchColumn();

    // Completed repayments received by this member
    $recvStmt = $pdo->prepare("
        SELECT COALESCE(SUM(amount_paise), 0)
        FROM settlements
        WHERE trip_id = ? AND receiver_member_id = ? AND status = 'completed'
    ");
    $recvStmt->execute([$tripId, $memberId]);
    $repaymentsReceivedPaise = (int)$recvStmt->fetchColumn();

    // Mathematical formula per specification:
    // Balance = Total Expenses Paid - Assigned Expense Shares + Repayments Sent - Repayments Received
    $netBalancePaise = $paidPaise - $sharePaise + $repaymentsSentPaise - $repaymentsReceivedPaise;
    $totalBalancesPaiseSum += $netBalancePaise;

    // Status evaluation
    $status = 'settled';
    if ($netBalancePaise > 0) {
        $status = 'gets_back'; // positive means member should receive money
    } elseif ($netBalancePaise < 0) {
        $status = 'owes';      // negative means member owes money
    }

    $memberBalances[] = [
        'id' => $memberId,
        'name' => $m['name'],
        'paid_paise' => $paidPaise,
        'paid_rupees' => paiseToRupees($paidPaise),
        'share_paise' => $sharePaise,
        'share_rupees' => paiseToRupees($sharePaise),
        'repayments_sent_paise' => $repaymentsSentPaise,
        'repayments_sent_rupees' => paiseToRupees($repaymentsSentPaise),
        'repayments_received_paise' => $repaymentsReceivedPaise,
        'repayments_received_rupees' => paiseToRupees($repaymentsReceivedPaise),
        'balance_paise' => $netBalancePaise,
        'balance_rupees' => paiseToRupees($netBalancePaise),
        'status' => $status
    ];
}

// 4. Calculate Total Trip Expenses
$totalExpStmt = $pdo->prepare("SELECT COALESCE(SUM(amount_paise), 0) FROM expenses WHERE trip_id = ?");
$totalExpStmt->execute([$tripId]);
$totalTripExpensesPaise = (int)$totalExpStmt->fetchColumn();

// 5. Category Breakdown for Reports and Charts
$catStmt = $pdo->prepare("
    SELECT category,
        COALESCE(SUM(amount_paise), 0) AS total_paise,
        COUNT(*) AS count
    FROM expenses
    WHERE trip_id = ?
    GROUP BY category
    ORDER BY total_paise DESC
");
$catStmt->execute([$tripId]);
$categoryBreakdownRaw = $catStmt->fetchAll();

$categories = [];
foreach ($categoryBreakdownRaw as $cat) {
    $cPaise = (int)$cat['total_paise'];
    $pct = $totalTripExpensesPaise > 0 ? round(($cPaise / $totalTripExpensesPaise) * 100, 1) : 0;
    $categories[] = [
        'category' => $cat['category'],
        'count' => (int)$cat['count'],
        'total_paise' => $cPaise,
        'total_rupees' => paiseToRupees($cPaise),
        'percentage' => $pct
    ];
}

// 6. Compute Automated Settlement Suggestions
$suggestions = calculateSettlementSuggestions($memberBalances);

// 7. Check if trip is completely settled
$isFullySettled = empty($suggestions) && count($members) > 0;

jsonResponse([
    'trip' => [
        'id' => (int)$trip['id'],
        'name' => $trip['name'],
        'destination' => $trip['destination'],
        'start_date' => $trip['start_date'],
        'end_date' => $trip['end_date'],
        'total_expenses_paise' => $totalTripExpensesPaise,
        'total_expenses_rupees' => paiseToRupees($totalTripExpensesPaise),
        'member_count' => count($members)
    ],
    'member_balances' => $memberBalances,
    'balance_sum_paise' => $totalBalancesPaiseSum, // Demonstrates zero-sum invariant
    'suggestions' => $suggestions,
    'is_fully_settled' => $isFullySettled,
    'category_breakdown' => $categories
]);
