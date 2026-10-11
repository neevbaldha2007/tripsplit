<?php
/**
 * TripSplit - Settlements API Endpoint
 * Handles recording, retrieving, reversing, and updating debt repayments
 */

require_once __DIR__ . '/config.php';

$pdo = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleGetSettlements($pdo);
        break;
    case 'POST':
        handleCreateSettlement($pdo);
        break;
    case 'PUT':
        handleUpdateSettlement($pdo);
        break;
    case 'DELETE':
        handleDeleteSettlement($pdo);
        break;
    default:
        jsonError('Method Not Allowed', 405);
}

/**
 * Fetch all settlements for a trip
 */
function handleGetSettlements(PDO $pdo): void {
    $tripId = isset($_GET['trip_id']) ? (int)$_GET['trip_id'] : 0;
    if ($tripId <= 0) {
        jsonError('Valid trip_id query parameter is required', 400);
    }

    $stmt = $pdo->prepare("
        SELECT s.*,
            m_sender.name AS sender_name,
            m_receiver.name AS receiver_name
        FROM settlements s
        JOIN members m_sender ON s.sender_member_id = m_sender.id
        JOIN members m_receiver ON s.receiver_member_id = m_receiver.id
        WHERE s.trip_id = ?
        ORDER BY s.payment_date DESC, s.id DESC
    ");
    $stmt->execute([$tripId]);
    $settlements = $stmt->fetchAll();

    foreach ($settlements as &$s) {
        $s['amount_rupees'] = paiseToRupees((int)$s['amount_paise']);
    }

    jsonResponse($settlements);
}

/**
 * Record a new settlement payment
 */
function handleCreateSettlement(PDO $pdo): void {
    $input = getJsonInput();

    $tripId = isset($input['trip_id']) ? (int)$input['trip_id'] : 0;
    $senderId = isset($input['sender_member_id']) ? (int)$input['sender_member_id'] : 0;
    $receiverId = isset($input['receiver_member_id']) ? (int)$input['receiver_member_id'] : 0;
    $paymentDate = !empty($input['payment_date']) ? $input['payment_date'] : date('Y-m-d');
    $notes = trim($input['notes'] ?? '');

    $rawAmount = $input['amount_rupees'] ?? $input['amount'] ?? 0;
    $amountPaise = isset($input['amount_paise']) ? (int)$input['amount_paise'] : rupeesToPaise($rawAmount);

    if ($tripId <= 0) {
        jsonError('Valid trip_id is required', 400);
    }
    if ($senderId <= 0 || $receiverId <= 0) {
        jsonError('Both sender and receiver members must be specified', 400);
    }
    if ($senderId === $receiverId) {
        jsonError('Sender and receiver cannot be the same member', 400);
    }
    if ($amountPaise <= 0) {
        jsonError('Settlement amount must be greater than zero', 400);
    }

    // Verify both members belong to the specified trip
    $mStmt = $pdo->prepare("SELECT id, name FROM members WHERE id IN (?, ?) AND trip_id = ?");
    $mStmt->execute([$senderId, $receiverId, $tripId]);
    $validMembers = $mStmt->fetchAll();

    if (count($validMembers) < 2) {
        jsonError('Both sender and receiver must be valid members belonging to this trip', 400);
    }

    $stmt = $pdo->prepare("
        INSERT INTO settlements (trip_id, sender_member_id, receiver_member_id, amount_paise, payment_date, status, notes)
        VALUES (?, ?, ?, ?, ?, 'completed', ?)
    ");
    $stmt->execute([$tripId, $senderId, $receiverId, $amountPaise, $paymentDate, $notes]);
    $settlementId = (int)$pdo->lastInsertId();

    jsonResponse([
        'id' => $settlementId,
        'trip_id' => $tripId,
        'sender_member_id' => $senderId,
        'receiver_member_id' => $receiverId,
        'amount_paise' => $amountPaise,
        'amount_rupees' => paiseToRupees($amountPaise),
        'payment_date' => $paymentDate,
        'status' => 'completed',
        'notes' => $notes,
        'message' => 'Payment recorded successfully'
    ], 201);
}

/**
 * Update an existing settlement or toggle reversal
 */
function handleUpdateSettlement(PDO $pdo): void {
    $input = getJsonInput();

    $id = isset($input['id']) ? (int)$input['id'] : 0;
    if ($id <= 0) {
        jsonError('Valid settlement id is required', 400);
    }

    $check = $pdo->prepare("SELECT * FROM settlements WHERE id = ?");
    $check->execute([$id]);
    $settlement = $check->fetch();
    if (!$settlement) {
        jsonError('Settlement not found', 404);
    }

    $tripId = (int)$settlement['trip_id'];
    $senderId = isset($input['sender_member_id']) ? (int)$input['sender_member_id'] : (int)$settlement['sender_member_id'];
    $receiverId = isset($input['receiver_member_id']) ? (int)$input['receiver_member_id'] : (int)$settlement['receiver_member_id'];
    $paymentDate = !empty($input['payment_date']) ? $input['payment_date'] : $settlement['payment_date'];
    $status = in_array($input['status'] ?? '', ['completed', 'reversed'], true) ? $input['status'] : $settlement['status'];
    $notes = isset($input['notes']) ? trim($input['notes']) : $settlement['notes'];

    $amountPaise = $settlement['amount_paise'];
    if (isset($input['amount_rupees']) || isset($input['amount'])) {
        $rawAmount = $input['amount_rupees'] ?? $input['amount'];
        $amountPaise = rupeesToPaise($rawAmount);
    } elseif (isset($input['amount_paise'])) {
        $amountPaise = (int)$input['amount_paise'];
    }

    if ($senderId === $receiverId) {
        jsonError('Sender and receiver cannot be the same member', 400);
    }
    if ($amountPaise <= 0) {
        jsonError('Amount must be greater than zero', 400);
    }

    $stmt = $pdo->prepare("
        UPDATE settlements
        SET sender_member_id = ?, receiver_member_id = ?, amount_paise = ?, payment_date = ?, status = ?, notes = ?
        WHERE id = ?
    ");
    $stmt->execute([$senderId, $receiverId, $amountPaise, $paymentDate, $status, $notes, $id]);

    jsonResponse([
        'id' => $id,
        'message' => 'Settlement record updated successfully'
    ]);
}

/**
 * Delete or reverse a settlement record
 */
function handleDeleteSettlement(PDO $pdo): void {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        $input = getJsonInput();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
    }

    if ($id <= 0) {
        jsonError('Valid settlement id is required', 400);
    }

    $check = $pdo->prepare("SELECT id FROM settlements WHERE id = ?");
    $check->execute([$id]);
    if (!$check->fetch()) {
        jsonError('Settlement record not found', 404);
    }

    $stmt = $pdo->prepare("DELETE FROM settlements WHERE id = ?");
    $stmt->execute([$id]);

    jsonResponse([
        'message' => 'Settlement record deleted / reversed successfully'
    ]);
}
