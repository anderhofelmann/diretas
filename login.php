<?php
session_start();

// Lógica de Logout limpa e segura
if (isset($_GET['logout'])) {
    session_unset();
    session_destroy();
    header("Location: login.php");
    exit;
}

// Se já estiver logado, joga para o jogo direto
if (isset($_SESSION['usuario_email']) && !isset($_GET['logout'])) {
    header("Location: jogo.php");
    exit;
}

$erro = "";
$sucesso = "";

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim((string)filter_var($_POST['email'] ?? '', FILTER_SANITIZE_EMAIL));
    $senha = (string)($_POST['senha'] ?? '');
    $acao = (string)($_POST['acao'] ?? 'login'); // 'login' ou 'cadastro'

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $erro = "Digite um e-mail válido.";
    } elseif ($acao === 'cadastro' && strlen($senha) < 6) {
        $erro = "A senha precisa ter pelo menos 6 caracteres.";
    } elseif (!empty($email) && !empty($senha)) {
        $arquivoUsuario = "usuarios/" . md5($email) . ".json";

        if ($acao === 'cadastro') {
            if (file_exists($arquivoUsuario)) {
                $erro = "Este e-mail já está cadastrado!";
            } else {
                // Cria o esqueleto do usuário em formato JSON
                $dadosUsuario = [
                    "email" => $email,
                    "senha" => password_hash($senha, PASSWORD_DEFAULT),
                    "fase_atual" => 1,
                    "estrelas" => new stdClass(),
                    "tempos" => new stdClass()
                ];
                if (!is_dir('usuarios')) {
                    mkdir('usuarios', 0755, true);
                }
                file_put_contents($arquivoUsuario, json_encode($dadosUsuario));
                $sucesso = "Cadastro realizado! Faça o login.";
            }
        } elseif ($acao === 'login') {
            if (!file_exists($arquivoUsuario)) {
                $erro = "E-mail não encontrado!";
            } else {
                $dadosUsuario = json_decode(file_get_contents($arquivoUsuario), true);
                if (password_verify($senha, $dadosUsuario['senha'])) {
                    session_regenerate_id(true);
                    $_SESSION['usuario_email'] = $email;
                    $_SESSION['fase_atual'] = $dadosUsuario['fase_atual'];
                    header("Location: jogo.php");
                    exit;
                } else {
                    $erro = "Senha incorreta!";
                }
            }
        }
    } else {
        $erro = "Preencha todos os campos!";
    }
}
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#14141c">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Diretas">
    <link rel="manifest" href="manifest.json">
    <link rel="apple-touch-icon" href="icons/icon-192.png">
    <title>Diretas - Entrar</title>
    <style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 20px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #f1f1f6;
               background: radial-gradient(900px 500px at 15% -10%, #2b2f6a55, transparent), radial-gradient(700px 500px at 100% 110%, #19e3b633, transparent), #12121a; }
        .box { width: 100%; max-width: 380px; background: #1c1c28; border: 1px solid #34344a; border-radius: 22px; padding: 28px 24px 22px; box-shadow: 0 20px 50px rgba(0,0,0,.5); }
        .logo { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; width: 150px; margin: 0 auto 14px; }
        .logo i { aspect-ratio: 1; border-radius: 5px; background: #f3efe4; color: #1b1b26; font: 800 17px/1 system-ui; display: grid; place-items: center; font-style: normal; }
        .logo i.d { background: #2c2f63; color: #ffcf4a; }
        .logo i.p { background: #0b0b11; }
        h1 { margin: 0 0 4px; text-align: center; font-size: 26px; letter-spacing: .02em; }
        .sub { margin: 0 0 18px; text-align: center; color: #9a9ab2; font-size: 14px; }
        label { display: block; font-size: 12px; font-weight: 700; color: #9a9ab2; letter-spacing: .05em; text-transform: uppercase; margin: 12px 0 5px; }
        input { width: 100%; padding: 13px 14px; border: 1px solid #34344a; background: #12121a; color: #fff; border-radius: 12px; font-size: 16px; }
        input:focus { border-color: #19e3b6; outline: none; box-shadow: 0 0 0 3px #19e3b633; }
        button { width: 100%; padding: 14px; margin-top: 18px; background: #19e3b6; color: #04251d; border: 0; border-radius: 12px; cursor: pointer; font-weight: 800; font-size: 16px; }
        button:active { filter: brightness(.92); }
        .alternar { text-align: center; margin-top: 16px; font-size: 14px; color: #19e3b6; cursor: pointer; background: none; border: 0; width: auto; padding: 6px; margin-left: auto; margin-right: auto; display: block; font-weight: 600; }
        .msg { padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 600; text-align: center; margin-bottom: 6px; }
        .msg.erro { background: #4a1d24; color: #ffd0d4; }
        .msg.ok { background: #14402e; color: #bff5d8; }
    </style>
</head>
<body>
    <div class="box">
        <div class="logo" aria-hidden="true">
            <i class="d">D</i><i>I</i><i>R</i><i>E</i><i>T</i>
            <i class="p"></i><i class="d">A</i><i class="p"></i><i>A</i><i>S</i>
        </div>
        <h1 id="titulo">Diretas</h1>
        <p class="sub" id="sub">Entre para continuar de onde parou.</p>

        <?php if ($erro): ?><div class="msg erro"><?= htmlspecialchars($erro, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
        <?php if ($sucesso): ?><div class="msg ok"><?= htmlspecialchars($sucesso, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>

        <form method="POST" autocomplete="on">
            <label for="email">E-mail</label>
            <input type="email" id="email" name="email" placeholder="voce@exemplo.com" autocomplete="email" required>
            <label for="senha">Senha</label>
            <input type="password" id="senha" name="senha" placeholder="Sua senha" autocomplete="current-password" required>
            <input type="hidden" name="acao" id="acao" value="login">
            <button type="submit" id="btn-enviar">Entrar</button>
        </form>

        <button type="button" class="alternar" id="alternar" onclick="alternarForm()">Quero me cadastrar</button>
    </div>

    <script>
        function alternarForm() {
            const acao = document.getElementById('acao');
            const cad = acao.value === 'login';
            acao.value = cad ? 'cadastro' : 'login';
            document.getElementById('sub').innerText = cad ? 'Crie sua conta (senha com 6+ caracteres).' : 'Entre para continuar de onde parou.';
            document.getElementById('btn-enviar').innerText = cad ? 'Cadastrar' : 'Entrar';
            document.getElementById('alternar').innerText = cad ? 'Já tenho conta? Entrar' : 'Quero me cadastrar';
            document.getElementById('senha').autocomplete = cad ? 'new-password' : 'current-password';
        }
    </script>
</body>
</html>
