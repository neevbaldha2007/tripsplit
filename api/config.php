<?php
/**
 * TripSplit - Database Configuration and Common API Utilities
 */

// Enable error reporting during development, but prevent outputting raw PHP warnings in JSON responses
error_reporting(E_ALL);
ini_set('display_errors', '0');

// Set JSON response headers and CORS
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');

// Respond to preflight OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Database configuration constants (standard XAMPP defaults)
define('DB_HOST', 'localhost');
define('DB_NAME', 'tripsplit_db');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_PORT', 3306);

/**
 * Returns a singleton PDO connection instance
 * @return PDO
 */
function getDbConnection(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Database connection failed: ' . $e->getMessage() . '. Please verify MySQL is running in XAMPP and "tripsplit_db" is created and imported via phpMyAdmin.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    return $pdo;
}

/**
 * Sends a structured JSON success response
 * @param mixed $data
 * @param int $statusCode
 */
function jsonResponse($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode([
        'success' => true,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Sends a structured JSON error response
 * @param string $message
 * @param int $statusCode
 * @param mixed $details
 */
function jsonError(string $message, int $statusCode = 400, $details = null): void {
    http_response_code($statusCode);
    $response = [
        'success' => false,
        'message' => $message
    ];
    if ($details !== null) {
        $response['details'] = $details;
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Parses and returns decoded JSON payload from php://input
 * @return array
 */
function getJsonInput(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }
    return $decoded;
}

/**
 * Safely converts Rupees (float/string/int) to integer paise
 * @param mixed $rupees
 * @return int
 */
function rupeesToPaise($rupees): int {
    $clean = (float)str_replace([',', ' '], '', (string)$rupees);
    return (int)round($clean * 100);
}

/**
 * Converts integer paise to standard Rupee float
 * @param int $paise
 * @return float
 */
function paiseToRupees(int $paise): float {
    return round($paise / 100, 2);
}

/**
 * Greedily solves debt simplification for a set of member balances
 * All balances must sum to 0 in paise.
 * @param array $membersWithBalance [ ['id' => int, 'name' => string, 'balance_paise' => int] ]
 * @return array List of settlement suggestions
 */
function calculateSettlementSuggestions(array $membersWithBalance): array {
    $debtors = [];   // People who owe money (balance_paise < 0)
    $creditors = []; // People who are owed money (balance_paise > 0)

    foreach ($membersWithBalance as $m) {
        $bal = (int)$m['balance_paise'];
        if ($bal < 0) {
            $debtors[] = [
                'id' => (int)$m['id'],
                'name' => $m['name'],
                'amount' => abs($bal)
            ];
        } elseif ($bal > 0) {
            $creditors[] = [
                'id' => (int)$m['id'],
                'name' => $m['name'],
                'amount' => $bal
            ];
        }
    }

    $suggestions = [];

    // Sort descending by amount to minimize total number of transactions
    usort($debtors, fn($a, $b) => $b['amount'] <=> $a['amount']);
    usort($creditors, fn($a, $b) => $b['amount'] <=> $a['amount']);

    $dIdx = 0;
    $cIdx = 0;
    $debtorCount = count($debtors);
    $creditorCount = count($creditors);

    while ($dIdx < $debtorCount && $cIdx < $creditorCount) {
        $debtor = &$debtors[$dIdx];
        $creditor = &$creditors[$cIdx];

        $transfer = min($debtor['amount'], $creditor['amount']);

        if ($transfer > 0) {
            $suggestions[] = [
                'sender_id' => $debtor['id'],
                'sender_name' => $debtor['name'],
                'receiver_id' => $creditor['id'],
                'receiver_name' => $creditor['name'],
                'amount_paise' => $transfer,
                'amount_rupees' => paiseToRupees($transfer)
            ];

            $debtor['amount'] -= $transfer;
            $creditor['amount'] -= $transfer;
        }

        if ($debtor['amount'] === 0) {
            $dIdx++;
        }
        if ($creditor['amount'] === 0) {
            $cIdx++;
        }
    }

    return $suggestions;
}
