<?php
/**
 * TripSplit - Members API Endpoint
 * Handles CRUD for trip members with strict financial integrity guards
 */

require_once __DIR__ . '/config.php';

$pdo = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleGetMembers($pdo);
        break;
    case 'POST':
        handleAddMember($pdo);
        break;
    case 'PUT':
        handleUpdateMember($pdo);
        break;
    case 'DELETE':
        handleDeleteMember($pdo);
        break;
    default:
        jsonError('Method Not Allowed', 405);
}

/**
 * Fetch members for a given trip with activity statistics
 */
function handleGetMembers(PDO $pdo): void {
    $tripId = isset($_GET['trip_id']) ? (int)$_GET['trip_id'] : 0;
    if ($tripId <= 0) {
        jsonError('Valid trip_id query parameter is required', 400);
    }

    $stmt = $pdo->prepare("
        SELECT m.*,
            (SELECT COUNT(*) FROM expenses e WHERE e.payer_member_id = m.id) AS expenses_paid_count,
            (SELECT COUNT(*) FROM expense_shares es WHERE es.member_id = m.id) AS shares_count,
            (SELECT COUNT(*) FROM settlements s WHERE s.sender_member_id = m.id OR s.receiver_member_id = m.id) AS settlements_count
        FROM members m
        WHERE m.trip_id = ?
        ORDER BY m.id ASC
    ");
    $stmt->execute([$tripId]);
    $members = $stmt->fetchAll();

    foreach ($members as &$m) {
        $m['has_financial_records'] = ((int)$m['expenses_paid_count'] > 0 || (int)$m['shares_count'] > 0 || (int)$m['settlements_count'] > 0);
    }

    jsonResponse($members);
}

/**
 * Add a new member to a trip
 */
function handleAddMember(PDO $pdo): void {
    $input = getJsonInput();

    $tripId = isset($input['trip_id']) ? (int)$input['trip_id'] : 0;
    $name = trim($input['name'] ?? '');

    if ($tripId <= 0) {
        jsonError('Valid trip_id is required', 400);
    }
    if ($name === '') {
        jsonError('Member name cannot be empty', 400);
    }

    // Verify trip exists
    $tripCheck = $pdo->prepare("SELECT id FROM trips WHERE id = ?");
    $tripCheck->execute([$tripId]);
    if (!$tripCheck->fetch()) {
        jsonError('Trip not found', 404);
    }

    // Prevent duplicate member names within the same trip (case-insensitive)
    $dupCheck = $pdo->prepare("SELECT id FROM members WHERE trip_id = ? AND LOWER(name) = LOWER(?)");
    $dupCheck->execute([$tripId, $name]);
    if ($dupCheck->fetch()) {
        jsonError("A member named '{$name}' already exists in this trip. Please use a distinct name or surname.", 409);
    }

    $stmt = $pdo->prepare("INSERT INTO members (trip_id, name) VALUES (?, ?)");
    $stmt->execute([$tripId, $name]);
    $memberId = (int)$pdo->lastInsertId();

    jsonResponse([
        'id' => $memberId,
        'trip_id' => $tripId,
        'name' => $name,
        'message' => "Member '{$name}' added successfully"
    ], 201);
}

/**
 * Update an existing member's name
 */
function handleUpdateMember(PDO $pdo): void {
    $input = getJsonInput();

    $id = isset($input['id']) ? (int)$input['id'] : 0;
    $name = trim($input['name'] ?? '');

    if ($id <= 0) {
        jsonError('Valid member id is required', 400);
    }
    if ($name === '') {
        jsonError('Member name cannot be empty', 400);
    }

    $check = $pdo->prepare("SELECT id, trip_id FROM members WHERE id = ?");
    $check->execute([$id]);
    $member = $check->fetch();
    if (!$member) {
        jsonError('Member not found', 404);
    }

    // Check for another member with this name in the same trip
    $dupCheck = $pdo->prepare("SELECT id FROM members WHERE trip_id = ? AND LOWER(name) = LOWER(?) AND id != ?");
    $dupCheck->execute([$member['trip_id'], $name, $id]);
    if ($dupCheck->fetch()) {
        jsonError("Another member named '{$name}' already exists in this trip.", 409);
    }

    $stmt = $pdo->prepare("UPDATE members SET name = ? WHERE id = ?");
    $stmt->execute([$name, $id]);

    jsonResponse([
        'id' => $id,
        'name' => $name,
        'message' => 'Member updated successfully'
    ]);
}

/**
 * Delete a member, enforcing strict financial integrity
 */
function handleDeleteMember(PDO $pdo): void {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        $input = getJsonInput();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
    }

    if ($id <= 0) {
        jsonError('Valid member id is required', 400);
    }

    $check = $pdo->prepare("SELECT id, trip_id, name FROM members WHERE id = ?");
    $check->execute([$id]);
    $member = $check->fetch();
    if (!$member) {
        jsonError('Member not found', 404);
    }

    // Financial check 1: Expenses paid
    $expPaidStmt = $pdo->prepare("SELECT COUNT(*) FROM expenses WHERE payer_member_id = ?");
    $expPaidStmt->execute([$id]);
    $expensesPaidCount = (int)$expPaidStmt->fetchColumn();

    // Financial check 2: Expense shares involved in
    $expShareStmt = $pdo->prepare("SELECT COUNT(*) FROM expense_shares WHERE member_id = ?");
    $expShareStmt->execute([$id]);
    $sharesCount = (int)$expShareStmt->fetchColumn();

    // Financial check 3: Settlements involved in (as sender or receiver)
    $settleStmt = $pdo->prepare("SELECT COUNT(*) FROM settlements WHERE sender_member_id = ? OR receiver_member_id = ?");
    $settleStmt->execute([$id, $id]);
    $settlementsCount = (int)$settleStmt->fetchColumn();

    if ($expensesPaidCount > 0 || $sharesCount > 0 || $settlementsCount > 0) {
        $reasons = [];
        if ($expensesPaidCount > 0) {
            $reasons[] = "paid {$expensesPaidCount} expense(s)";
        }
        if ($sharesCount > 0) {
            $reasons[] = "participates in {$sharesCount} expense share(s)";
        }
        if ($settlementsCount > 0) {
            $reasons[] = "involved in {$settlementsCount} settlement transaction(s)";
        }

        $reasonText = implode(', ', $reasons);
        jsonError("Cannot delete member '{$member['name']}': Member has active financial records ({$reasonText}). Please delete or reassign those expenses/settlements before removing this member.", 422);
    }

    // Safe to delete
    $delStmt = $pdo->prepare("DELETE FROM members WHERE id = ?");
    $delStmt->execute([$id]);

    jsonResponse([
        'message' => "Member '{$member['name']}' removed successfully"
    ]);
}
