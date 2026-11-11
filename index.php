<?php
session_start();

// Registra o Service Worker via meta-redirect para garantir que o SW seja instalado
// antes de redirecionar, servimos uma página mínima que registra o SW e então redireciona.
$destino = isset($_SESSION['usuario_email']) ? 'jogo.php' : 'login.php';
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#1e1e24">
    <link rel="manifest" href="manifest.json">
    <title>Diretas</title>
    <style>body{background:#1e1e24;margin:0;}</style>
</head>
<body>
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').finally(() => {
                window.location.replace('<?= $destino ?>');
            });
        } else {
            window.location.replace('<?= $destino ?>');
        }
    </script>
</body>
</html>
