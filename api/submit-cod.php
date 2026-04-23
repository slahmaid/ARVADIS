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
$quantity = $input['quantity'] ?? 1;
$unitPrice = $input['unit_price_mad'] ?? '';
$comparePrice = $input['compare_price_mad'] ?? '';
$lineTotal = $input['line_total_mad'] ?? '';
$pageUrl = trim((string)($input['page_url'] ?? ''));
$submittedAt = trim((string)($input['submitted_at'] ?? ''));
$eventId = trim((string)($input['fb_event_id'] ?? $input['event_id'] ?? ''));
$firstName = trim((string)($input['first_name'] ?? ''));

if ($product === '' || $name === '' || $phone === '' || $city === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'يرجى تعبئة جميع الحقول المطلوبة.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$phoneNormalized = preg_replace('/[.\-\s()]+/', '', $phone);
if (!preg_match('/^(?:\+212[67][0-9]{8}|0[67][0-9]{8})$/', $phoneNormalized)) {
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

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to lock data file'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($isNewFile) {
    fputcsv($fp, [
        'submitted_at',
        'product',
        'name',
        'phone',
        'city',
        'quantity',
        'unit_price_mad',
        'compare_price_mad',
        'line_total_mad',
        'upsell_sd_card',
        'page_url',
    ]);
}

fputcsv($fp, [
    $submittedAt !== '' ? $submittedAt : gmdate('c'),
    $product,
    $name,
    $phone,
    $city,
    is_numeric($quantity) ? (string)(int) $quantity : '1',
    $unitPrice !== '' && $unitPrice !== null ? (string) $unitPrice : '',
    $comparePrice !== '' && $comparePrice !== null ? (string) $comparePrice : '',
    $lineTotal !== '' && $lineTotal !== null ? (string) $lineTotal : '',
    $upsell !== '' ? $upsell : 'لا',
    $pageUrl,
]);
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);

/**
 * Best-effort Meta Conversions API call for deduplication with browser pixel.
 * It is intentionally non-blocking for order UX.
 */
if ($eventId !== '') {
    $pixelId = getenv('META_PIXEL_ID') ?: '';
    $accessToken = getenv('META_CAPI_ACCESS_TOKEN') ?: '';
    $testCode = getenv('META_TEST_EVENT_CODE') ?: '';
    if ($pixelId !== '' && $accessToken !== '' && function_exists('curl_init')) {
        $hash = static function (string $value): string {
            return hash('sha256', mb_strtolower(trim($value), 'UTF-8'));
        };

        $normalizedPhone = preg_replace('/[^0-9+]/', '', $phoneNormalized);
        if (str_starts_with($normalizedPhone, '0')) {
            $normalizedPhone = '+212' . substr($normalizedPhone, 1);
        }
        if (!str_starts_with($normalizedPhone, '+')) {
            $normalizedPhone = '+' . $normalizedPhone;
        }

        $userData = [
            'ph' => [$hash($normalizedPhone)],
        ];
        if ($firstName !== '') {
            $userData['fn'] = [$hash($firstName)];
        }
        if ($city !== '') {
            $userData['ct'] = [$hash($city)];
        }

        $value = is_numeric($lineTotal) ? (float) $lineTotal : (is_numeric($unitPrice) ? (float) $unitPrice : 0.0);
        $metaPayload = [
            'data' => [[
                'event_name' => 'Purchase',
                'event_time' => time(),
                'event_id' => $eventId,
                'action_source' => 'website',
                'event_source_url' => $pageUrl,
                'user_data' => $userData,
                'custom_data' => [
                    'currency' => 'MAD',
                    'value' => $value,
                    'content_name' => $product,
                    'num_items' => is_numeric($quantity) ? (int) $quantity : 1,
                ],
            ]],
        ];
        if ($testCode !== '') {
            $metaPayload['test_event_code'] = $testCode;
        }

        $endpoint = sprintf('https://graph.facebook.com/v20.0/%s/events?access_token=%s', rawurlencode($pixelId), rawurlencode($accessToken));
        $ch = curl_init($endpoint);
        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode($metaPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT_MS => 1500,
                CURLOPT_CONNECTTIMEOUT_MS => 800,
            ]);
            curl_exec($ch);
            curl_close($ch);
        }
    }
}
