<?php
session_start();

if (!isset($_SESSION['usuario_email'])) {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['status' => 'erro', 'msg' => 'Sessão expirada. Entre novamente.']);
        exit;
    }
    header('Location: login.php');
    exit;
}

$email = $_SESSION['usuario_email'];
$arquivoUsuario = __DIR__ . '/usuarios/' . md5($email) . '.json';

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

/** Quantidade de fases disponíveis em fases/. */
function total_fases(): int {
    $n = 0;
    while (is_file(__DIR__ . '/fases/fase_' . ($n + 1) . '.json')) $n++;
    return $n;
}

/** Lê, altera e grava o arquivo do jogador com trava (evita corrida entre abas). */
function com_usuario(string $arquivo, callable $fn) {
    $fp = @fopen($arquivo, 'c+');
    if (!$fp) return null;
    flock($fp, LOCK_EX);
    $conteudo = stream_get_contents($fp);
    $d = json_decode($conteudo ?: '', true);
    if (!is_array($d)) { flock($fp, LOCK_UN); fclose($fp); return null; }
    $d['fase_atual'] = max(1, (int)($d['fase_atual'] ?? 1));
    if (!isset($d['estrelas']) || !is_array($d['estrelas'])) $d['estrelas'] = [];
    if (!isset($d['tempos'])   || !is_array($d['tempos']))   $d['tempos']   = [];
    $res = $fn($d);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($d));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $res;
}

function estado_publico(array $d, int $total): array {
    return [
        'fase_atual' => min($d['fase_atual'], $total + 1),
        'total'      => $total,
        'estrelas'   => (object)$d['estrelas'],
        'tempos'     => (object)$d['tempos'],
    ];
}

function responder(array $dados, int $codigo = 200): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dados);
    exit;
}

$total = total_fases();

// ── API (POST com JSON) ───────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $corpo = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($corpo)) responder(['status' => 'erro', 'msg' => 'Requisição inválida.'], 400);
    if (!hash_equals($_SESSION['csrf'], (string)($corpo['csrf'] ?? ''))) {
        responder(['status' => 'erro', 'msg' => 'Sessão inválida. Recarregue a página.'], 403);
    }
    $acao = (string)($corpo['acao'] ?? '');

    if ($acao === 'concluir') {
        $fase = (int)($corpo['fase'] ?? 0);
        if ($fase < 1 || $fase > $total) responder(['status' => 'erro', 'msg' => 'Fase inexistente.'], 400);
        $dadosFase = json_decode(file_get_contents(__DIR__ . "/fases/fase_{$fase}.json"), true);
        $enviadas = is_array($corpo['letras'] ?? null) ? $corpo['letras'] : [];
        foreach ($dadosFase['elementos'] as $el) {
            if ($el['tipo'] !== 'letra') continue;
            $k = $el['linha'] . '_' . $el['coluna'];
            if (strtoupper((string)($enviadas[$k] ?? '')) !== strtoupper($el['letra_correta'])) {
                responder(['status' => 'erro', 'msg' => 'A solução enviada não confere.'], 422);
            }
        }
        $estrelas = max(1, min(3, (int)($corpo['estrelas'] ?? 1)));
        $tempo    = max(1, min(86400, (int)($corpo['tempo'] ?? 0)));
        $res = com_usuario($arquivoUsuario, function (&$d) use ($fase, $estrelas, $tempo, $total) {
            if ($fase > $d['fase_atual']) return ['erro' => 'Fase ainda bloqueada.'];
            $ant = (int)($d['estrelas'][$fase] ?? 0);
            if ($estrelas > $ant) $d['estrelas'][$fase] = $estrelas;
            $tAnt = (int)($d['tempos'][$fase] ?? 0);
            if ($tAnt === 0 || $tempo < $tAnt) $d['tempos'][$fase] = $tempo;
            if ($fase === $d['fase_atual']) $d['fase_atual'] = $fase + 1;
            return estado_publico($d, $total);
        });
        if ($res === null) responder(['status' => 'erro', 'msg' => 'Não foi possível salvar.'], 500);
        if (isset($res['erro'])) responder(['status' => 'erro', 'msg' => $res['erro']], 403);
        $_SESSION['fase_atual'] = $res['fase_atual'];
        responder(['status' => 'sucesso', 'estado' => $res]);
    }

    if ($acao === 'reiniciar') {
        $res = com_usuario($arquivoUsuario, function (&$d) use ($total) {
            $d['fase_atual'] = 1;
            $d['estrelas'] = [];
            $d['tempos'] = [];
            return estado_publico($d, $total);
        });
        if ($res === null) responder(['status' => 'erro', 'msg' => 'Não foi possível salvar.'], 500);
        $_SESSION['fase_atual'] = 1;
        responder(['status' => 'sucesso', 'estado' => $res]);
    }

    responder(['status' => 'erro', 'msg' => 'Ação desconhecida.'], 400);
}

// ── Página ────────────────────────────────────────────────────────────────
$estado = com_usuario($arquivoUsuario, function (&$d) use ($total) { return estado_publico($d, $total); });
if ($estado === null) {
    session_unset();
    session_destroy();
    header('Location: login.php');
    exit;
}
$_SESSION['fase_atual'] = $estado['fase_atual'];
$config = [
    'estado' => $estado,
    'csrf'   => $_SESSION['csrf'],
    'uid'    => substr(sha1($email . '|diretas'), 0, 12),
];
$v = '5';
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#14141c">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Diretas">
    <link rel="manifest" href="manifest.json">
    <link rel="apple-touch-icon" href="icons/icon-192.png">
    <title>Diretas - Palavras Cruzadas</title>
    <link rel="stylesheet" href="css/diretas.css?v=<?= $v ?>">
</head>
<body data-tema="escuro">

<div id="app">
    <header class="topo">
        <button class="ib" id="btn-fases" aria-label="Escolher fase" title="Fases">
            <svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>
        </button>
        <div class="titulo">
            <small>Fase <b id="num-fase">1</b></small>
            <strong id="titulo-fase">…</strong>
        </div>
        <div class="tempo" id="tempo" aria-label="Tempo">0:00</div>
        <button class="ib" id="btn-som" aria-label="Som" title="Som"></button>
        <button class="ib" id="btn-tema" aria-label="Alternar tema" title="Tema"></button>
        <button class="ib" id="btn-menu" aria-label="Menu" title="Menu">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </button>
    </header>

    <div class="progresso" aria-hidden="true"><i id="barra"></i></div>

    <main class="palco">
        <section class="area-grade">
            <div class="pista" id="pista" role="status" aria-live="polite">
                <button class="nav" id="ant" aria-label="Pista anterior">‹</button>
                <div class="pista-txt"><span class="dir" id="pista-dir"></span><span id="pista-txt">Toque numa casa para começar</span></div>
                <button class="nav" id="prox" aria-label="Próxima pista">›</button>
            </div>
            <div id="grid-diretas" role="grid" aria-label="Palavras cruzadas"></div>
        </section>

        <section class="controles">
            <div class="ferramentas">
                <button class="fer" id="b-dica"><span>💡</span><em>Letra</em></button>
                <button class="fer" id="b-palavra"><span>🔤</span><em>Palavra</em></button>
                <button class="fer" id="b-conferir"><span>✔️</span><em>Conferir</em></button>
                <button class="fer" id="b-modo"><span>🎛️</span><em id="modo-nome">Teclado</em></button>
            </div>
            <div class="teclado" id="teclado"></div>
            <div class="rol" id="rol" hidden></div>
        </section>
    </main>
</div>

<div class="toast" id="toast" role="status"></div>

<div class="modal" id="modal" hidden>
    <div class="cartao" id="cartao" role="dialog" aria-modal="true"></div>
</div>

<script>window.DIRETAS = <?= json_encode($config, JSON_UNESCAPED_UNICODE) ?>;</script>
<script src="js/diretas.js?v=<?= $v ?>"></script>
</body>
</html>
