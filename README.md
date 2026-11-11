# Diretas

Jogo de **palavras cruzadas diretas** (estilo "setas") para navegador, com 42 fases que ficam cada vez mais desafiadoras. Funciona em celular, tablet e desktop e pode ser instalado como app (PWA).

## Recursos
- Digitação pelo teclado da tela ou físico, ou modo "Rol" (tocar nas letras que sobram)
- Dicas de letra e de palavra, conferência, estrelas por fase e cronômetro
- Cadastro e login (e-mail e senha); progresso salvo na conta
- Tema claro e escuro, sons sintetizados
- O servidor confere a solução antes de liberar a próxima fase

## Estrutura
- `jogo.php`: página do jogo e API (POST JSON com CSRF)
- `login.php`, `index.php`: acesso e registro do service worker
- `js/diretas.js`, `css/diretas.css`: interface
- `fases/fase_N.json`: fases (grade, pistas e letras)
- `tools/`: gerador de fases (`gerar.py`), banco de palavras (`palavras.txt`) e verificador (`verificar.py`)
- `usuarios/`: criado em execução, com um arquivo JSON por jogador; **não versionado** e bloqueado por `.htaccess`

## Como rodar
Requer PHP 8+:

```bash
php -S localhost:8097
```

Abra http://localhost:8097/ e crie uma conta. Em Apache, a pasta `usuarios/` precisa ser gravável pelo servidor.

## Gerar novas fases
```bash
python3 tools/gerar.py saida/
python3 tools/verificar.py saida/
```
Edite `tools/palavras.txt` (formato `PALAVRA|pista|dificuldade 1-3`) para ampliar o banco.

## Online
https://www.andercursos.com.br/diretas/

## Licença
MIT
