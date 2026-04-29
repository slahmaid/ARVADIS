<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$rootDir = dirname(__DIR__);
$dataDir = $rootDir . DIRECTORY_SEPARATOR . 'data';
$dataFile = $dataDir . DIRECTORY_SEPARATOR . 'cod-orders.csv';

$status = [
    'ok' => true,
    'php_version' => PHP_VERSION,
    'timestamp_utc' => gmdate('c'),
    'paths' => [
        'root_dir' => $rootDir,
        'data_dir' => $dataDir,
        'data_file' => $dataFile,
    ],
    'checks' => [
        'data_dir_exists' => is_dir($dataDir),
        'data_dir_writable' => is_dir($dataDir) ? is_writable($dataDir) : false,
        'data_file_exists' => file_exists($dataFile),
        'data_file_writable' => file_exists($dataFile) ? is_writable($dataFile) : false,
    ],
];

// Try lightweight write test to prove live write capability.
$writeProbe = [
    'attempted' => false,
    'success' => false,
    'error' => null,
];

if (is_dir($dataDir) && is_writable($dataDir)) {
    $writeProbe['attempted'] = true;
    $probeFile = $dataDir . DIRECTORY_SEPARATOR . '.write-probe.tmp';
    $bytes = @file_put_contents($probeFile, 'probe:' . gmdate('c'));
    if ($bytes === false) {
        $writeProbe['error'] = 'Failed to write probe file in data directory.';
    } else {
        $writeProbe['success'] = true;
        @unlink($probeFile);
    }
}

$status['checks']['write_probe'] = $writeProbe;

if (
    !$status['checks']['data_dir_exists'] ||
    !$status['checks']['data_dir_writable'] ||
    (!$status['checks']['data_file_exists'] && !$writeProbe['success']) ||
    ($status['checks']['data_file_exists'] && !$status['checks']['data_file_writable'])
) {
    $status['ok'] = false;
    http_response_code(500);
}

echo json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
