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
$sheetKey = trim((string)($input['sheet_key'] ?? ''));

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
$sheetEndpoints = [
    'moka' => 'https://script.google.com/macros/s/AKfycbxgqWCWoeLxuvY8c0fEgjxYTfASAj4etmz-cUUTul_FU3ImN0jcVCIhhzp-XjhdAVcD/exec',
    'saqr' => 'https://script.google.com/macros/s/AKfycbxG73Gaq_OSLB1jXPNxafui0DYwXRHsKHudE-Bb0XIRnHbeh3890lNJuriDLmkWNQ0/exec',
    'projectors' => 'https://script.google.com/macros/s/AKfycbyFeWL5WCj_jzdED9eAm2ulM4-iYrjRlDvlu8hriyfS_GAJFO5yBiGfOzGHzohRFjM/exec',
];

if (!is_dir($dataDir) && !mkdir($dataDir, 0775, true) && !is_dir($dataDir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to initialize data directory'], JSON_UNESCAPED_UNICODE);
    exit;
}

$fp = fopen($dataFile, 'c+b');
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

rewind($fp);
$existingContent = stream_get_contents($fp);
if (!is_string($existingContent)) {
    $existingContent = '';
}
$isNewFile = trim($existingContent) === '';
$isDuplicateEvent = $eventId !== '' && strpos($existingContent, $eventId) !== false;

if (!$isDuplicateEvent) {
    fseek($fp, 0, SEEK_END);
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
            'event_id',
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
        $eventId,
    ]);
}
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

$productLower = mb_strtolower($product, 'UTF-8');
if ($sheetKey === '') {
    if (str_contains($productLower, 'projector') || str_contains($productLower, 'بروجيكتور')) {
        $sheetKey = 'projectors';
    } elseif (str_contains($productLower, 'saqr') || str_contains($productLower, 'صقر')) {
        $sheetKey = 'saqr';
    } else {
        $sheetKey = 'moka';
    }
}

$sheetOk = false;
$sheetUrl = $sheetEndpoints[$sheetKey] ?? '';
if ($isDuplicateEvent) {
    $sheetOk = true;
} elseif ($sheetUrl !== '' && function_exists('curl_init')) {
    $sheetPayload = [
        'product' => $product,
        'variant_model' => trim((string)($input['variant_model'] ?? '')),
        'name' => $name,
        'phone' => $phone,
        'city' => $city,
        'quantity' => is_numeric($quantity) ? (int) $quantity : 1,
        'unit_price_mad' => $unitPrice !== '' && $unitPrice !== null ? (string) $unitPrice : '',
        'compare_price_mad' => $comparePrice !== '' && $comparePrice !== null ? (string) $comparePrice : '',
        'line_total_mad' => $lineTotal !== '' && $lineTotal !== null ? (string) $lineTotal : '',
        'upsell_sd_card' => $upsell !== '' ? $upsell : 'لا',
    ];

    $chSheet = curl_init($sheetUrl);
    if ($chSheet !== false) {
        curl_setopt_array($chSheet, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: text/plain;charset=utf-8'],
            CURLOPT_POSTFIELDS => json_encode($sheetPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS => 3500,
            CURLOPT_CONNECTTIMEOUT_MS => 1200,
        ]);
        curl_exec($chSheet);
        $httpCode = (int) curl_getinfo($chSheet, CURLINFO_HTTP_CODE);
        $curlErr = curl_errno($chSheet);
        curl_close($chSheet);
        $sheetOk = $curlErr === 0 && $httpCode >= 200 && $httpCode < 300;
    }
}

echo json_encode(['ok' => true, 'sheet_ok' => $sheetOk, 'duplicate_event' => $isDuplicateEvent], JSON_UNESCAPED_UNICODE);

/**
 * Best-effort Meta Conversions API call for deduplication with browser pixel.
 * It is intentionally non-blocking for order UX.
 */
if ($eventId !== '' && !$isDuplicateEvent) {
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
