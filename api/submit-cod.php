<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$input = json_decode($raw ?: '{}', true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON payload'], JSON_UNESCAPED_UNICODE);
    exit;
}

$product = trim((string)($input['product'] ?? ''));
$name = trim((string)($input['name'] ?? ''));
$phone = trim((string)($input['phone'] ?? ''));
$city = trim((string)($input['city'] ?? ''));
$upsell = trim((string)($input['upsell_sd_card'] ?? 'لا'));
$pageUrl = trim((string)($input['page_url'] ?? ''));
$submittedAt = trim((string)($input['submitted_at'] ?? ''));

if ($product === '' || $name === '' || $phone === '' || $city === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'يرجى تعبئة جميع الحقول المطلوبة.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$phoneNormalized = preg_replace('/\s+/', '', $phone);
if (!preg_match('/^(\+212|0)[0-9]{9}$/', $phoneNormalized)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'رقم الهاتف غير صالح.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rootDir = dirname(__DIR__);
$dataDir = $rootDir . DIRECTORY_SEPARATOR . 'data';
$dataFile = $dataDir . DIRECTORY_SEPARATOR . 'cod-orders.csv';

if (!is_dir($dataDir) && !mkdir($dataDir, 0775, true) && !is_dir($dataDir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to initialize data directory'], JSON_UNESCAPED_UNICODE);
    exit;
}

$isNewFile = !file_exists($dataFile);
$fp = fopen($dataFile, 'ab');
if ($fp === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to open data file'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($isNewFile) {
    fputcsv($fp, ['submitted_at', 'product', 'name', 'phone', 'city', 'upsell_sd_card', 'page_url']);
}

fputcsv($fp, [
    $submittedAt !== '' ? $submittedAt : gmdate('c'),
    $product,
    $name,
    $phone,
    $city,
    $upsell !== '' ? $upsell : 'لا',
    $pageUrl,
]);
fclose($fp);

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
