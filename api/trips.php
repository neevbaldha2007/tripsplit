<?php
/**
 * TripSplit - Trips API Endpoint
 * Handles CRUD operations for group trips
 */

require_once __DIR__ . '/config.php';

$pdo = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Route based on request method
switch ($method) {
    case 'GET':
        handleGetTrips($pdo);
        break;
    case 'POST':
        handleCreateTrip($pdo);
        break;
    case 'PUT':
        handleUpdateTrip($pdo);
        break;
    case 'DELETE':
        handleDeleteTrip($pdo);
        break;
    default:
        jsonError('Method Not Allowed', 405);
}

/**
 * Handles fetching all trips or a single trip with summarized statistics
 */
function handleGetTrips(PDO $pdo): void {
    if (isset($_GET['id']) && is_numeric($_GET['id'])) {
        $tripId = (int)$_GET['id'];
        
        $stmt = $pdo->prepare("
            SELECT t.*,
                (SELECT COUNT(*) FROM members m WHERE m.trip_id = t.id) AS member_count,
                COALESCE((SELECT SUM(amount_paise) FROM expenses e WHERE e.trip_id = t.id), 0) AS total_expenses_paise
            FROM trips t
            WHERE t.id = ?
        ");
        $stmt->execute([$tripId]);
        $trip = $stmt->fetch();

        if (!$trip) {
            jsonError('Trip not found', 404);
        }

        $trip['total_expenses_rupees'] = paiseToRupees((int)$trip['total_expenses_paise']);
        jsonResponse($trip);
    } else {
        $stmt = $pdo->query("
            SELECT t.*,
                (SELECT COUNT(*) FROM members m WHERE m.trip_id = t.id) AS member_count,
                COALESCE((SELECT SUM(amount_paise) FROM expenses e WHERE e.trip_id = t.id), 0) AS total_expenses_paise
            FROM trips t
            ORDER BY t.created_at DESC
        ");
        $trips = $stmt->fetchAll();

        foreach ($trips as &$t) {
            $t['total_expenses_rupees'] = paiseToRupees((int)$t['total_expenses_paise']);
        }

        jsonResponse($trips);
    }
}

/**
 * Handles creating a new trip with optional starting members
 */
function handleCreateTrip(PDO $pdo): void {
    $input = getJsonInput();

    $name = trim($input['name'] ?? '');
    $destination = trim($input['destination'] ?? '');
    $startDate = !empty($input['start_date']) ? $input['start_date'] : null;
    $endDate = !empty($input['end_date']) ? $input['end_date'] : null;
    $initialMembers = $input['members'] ?? [];

    if ($name === '') {
        jsonError('Trip name is required', 400);
    }
    if ($destination === '') {
        jsonError('Destination is required', 400);
    }

    if ($startDate && $endDate && strtotime($startDate) > strtotime($endDate)) {
        jsonError('End date cannot be earlier than start date', 400);
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            INSERT INTO trips (name, destination, start_date, end_date)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([$name, $destination, $startDate, $endDate]);
        $tripId = (int)$pdo->lastInsertId();

        // If initial members were provided, insert them
        if (is_array($initialMembers) && !empty($initialMembers)) {
            $memberStmt = $pdo->prepare("INSERT INTO members (trip_id, name) VALUES (?, ?)");
            foreach ($initialMembers as $memberName) {
                $mName = trim((string)$memberName);
                if ($mName !== '') {
                    $memberStmt->execute([$tripId, $mName]);
                }
            }
        }

        $pdo->commit();

        jsonResponse([
            'id' => $tripId,
            'name' => $name,
            'destination' => $destination,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'message' => 'Trip created successfully'
        ], 201);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonError('Failed to create trip: ' . $e->getMessage(), 500);
    }
}

/**
 * Handles updating an existing trip
 */
function handleUpdateTrip(PDO $pdo): void {
    $input = getJsonInput();

    $id = isset($input['id']) ? (int)$input['id'] : 0;
    $name = trim($input['name'] ?? '');
    $destination = trim($input['destination'] ?? '');
    $startDate = !empty($input['start_date']) ? $input['start_date'] : null;
    $endDate = !empty($input['end_date']) ? $input['end_date'] : null;

    if ($id <= 0) {
        jsonError('Invalid trip ID', 400);
    }
    if ($name === '') {
        jsonError('Trip name is required', 400);
    }
    if ($destination === '') {
        jsonError('Destination is required', 400);
    }
    if ($startDate && $endDate && strtotime($startDate) > strtotime($endDate)) {
        jsonError('End date cannot be earlier than start date', 400);
    }

    // Verify trip exists
    $check = $pdo->prepare("SELECT id FROM trips WHERE id = ?");
    $check->execute([$id]);
    if (!$check->fetch()) {
        jsonError('Trip not found', 404);
    }

    $stmt = $pdo->prepare("
        UPDATE trips
        SET name = ?, destination = ?, start_date = ?, end_date = ?
        WHERE id = ?
    ");
    $stmt->execute([$name, $destination, $startDate, $endDate, $id]);

    jsonResponse([
        'id' => $id,
        'name' => $name,
        'destination' => $destination,
        'start_date' => $startDate,
        'end_date' => $endDate,
        'message' => 'Trip updated successfully'
    ]);
}

/**
 * Handles deleting a trip and associated records
 */
function handleDeleteTrip(PDO $pdo): void {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        $input = getJsonInput();
        $id = isset($input['id']) ? (int)$input['id'] : 0;
    }

    if ($id <= 0) {
        jsonError('Valid trip ID is required', 400);
    }

    $check = $pdo->prepare("SELECT id, name FROM trips WHERE id = ?");
    $check->execute([$id]);
    $trip = $check->fetch();
    if (!$trip) {
        jsonError('Trip not found', 404);
    }

    // Deletion will cascade to members, expenses, shares, and settlements per database foreign keys
    $stmt = $pdo->prepare("DELETE FROM trips WHERE id = ?");
    $stmt->execute([$id]);

    jsonResponse([
        'message' => "Trip '{$trip['name']}' and all associated records deleted successfully"
    ]);
}
