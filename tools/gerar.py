#!/usr/bin/env python3
"""Gera fases de palavras cruzadas diretas (estilo "setas") no formato do jogo.

Uso: python3 gerar.py <pasta_saida>
"""
import json, random, sys, os

AQUI = os.path.dirname(os.path.abspath(__file__))
BLOQUEADAS = {'AZO', 'ESQUI', 'FRIOS', 'APE', 'OSSOS', 'NOTAS', 'CAFEZAL', 'SALGADO'}


def carregar():
    vistos, pal = set(), []
    for lin in open(os.path.join(AQUI, 'palavras.txt'), encoding='utf-8'):
        lin = lin.strip()
        if not lin or lin.startswith('#'):
            continue
        w, dica, d = lin.split('|')
        w = w.upper()
        if w in vistos or w in BLOQUEADAS or '/' in dica:
            continue
        vistos.add(w)
        pal.append({'w': w, 'dica': dica, 'd': int(d)})
    return pal


class Grade:
    def __init__(self, R, C):
        self.R, self.C = R, C
        self.g = [[None] * C for _ in range(R)]   # None | ('L', ch) | ('D', {dir: entry}) | ('B',)
        self.entradas = []
        self.usadas = set()

    def clonar(self):
        n = Grade(self.R, self.C)
        n.g = [[(c if c is None or c[0] != 'D' else ('D', dict(c[1]))) for c in l] for l in self.g]
        n.entradas = list(self.entradas)
        n.usadas = set(self.usadas)
        return n

    def dentro(self, r, c):
        return 0 <= r < self.R and 0 <= c < self.C

    def colocar(self, w, r, c, d):
        """Tenta colocar; devolve nova Grade ou None."""
        dr, dc = (0, 1) if d == 'h' else (1, 0)
        n = len(w)
        cr, cc = r - dr, c - dc
        if not self.dentro(cr, cc):
            return None
        cel = self.g[cr][cc]
        if cel is not None and cel[0] == 'L':
            return None
        if cel is not None and cel[0] == 'D' and d in cel[1]:
            return None
        er, ec = r + dr * n, c + dc * n
        if not (0 <= r + dr * (n - 1) < self.R and 0 <= c + dc * (n - 1) < self.C):
            return None
        cruz = 0
        for i, ch in enumerate(w):
            x = self.g[r + dr * i][c + dc * i]
            if x is None:
                continue
            if x[0] == 'L' and x[1] == ch and (r + dr * i, c + dc * i, d) not in self.usadas:
                cruz += 1
                continue
            return None
        if self.dentro(er, ec):
            x = self.g[er][ec]
            if x is not None and x[0] == 'L':
                return None
        ng = self.clonar()
        if cel is None or cel[0] == 'B':
            ng.g[cr][cc] = ('D', {})
        ent = {'w': w, 'r': r, 'c': c, 'd': d, 'cr': cr, 'cc': cc}
        ng.g[cr][cc][1][d] = ent
        for i, ch in enumerate(w):
            ng.g[r + dr * i][c + dc * i] = ('L', ch)
            ng.usadas.add((r + dr * i, c + dc * i, d))
        if ng.dentro(er, ec) and ng.g[er][ec] is None:
            ng.g[er][ec] = ('B',)
        ng.entradas.append(ent)
        if not ng.valida():
            return None
        ng.ult_cruz = cruz
        return ng

    def valida(self):
        ini = {(e['r'], e['c'], e['d']): len(e['w']) for e in self.entradas}
        for r in range(self.R):
            c = 0
            while c < self.C:
                if self.g[r][c] is not None and self.g[r][c][0] == 'L':
                    s = c
                    while c < self.C and self.g[r][c] is not None and self.g[r][c][0] == 'L':
                        c += 1
                    if c - s >= 2 and ini.get((r, s, 'h')) != c - s:
                        return False
                else:
                    c += 1
        for c in range(self.C):
            r = 0
            while r < self.R:
                if self.g[r][c] is not None and self.g[r][c][0] == 'L':
                    s = r
                    while r < self.R and self.g[r][c] is not None and self.g[r][c][0] == 'L':
                        r += 1
                    if r - s >= 2 and ini.get((s, c, 'v')) != r - s:
                        return False
                else:
                    r += 1
        return True

    def letras(self):
        return sum(1 for l in self.g for x in l if x is not None and x[0] == 'L')

    def dicas(self):
        return sum(1 for l in self.g for x in l if x is not None and x[0] == 'D')


def gerar(R, C, pal, rng, maxd, comp_min, comp_max, tentativas=60):
    pool = [p for p in pal if p['d'] <= maxd and comp_min <= len(p['w']) <= comp_max]
    melhor = None
    for _ in range(tentativas):
        g = Grade(R, C)
        usados = set()
        # semente
        for _t in range(40):
            p = rng.choice(pool)
            r0 = rng.choice([1, 1, 2, R // 2])
            c0 = rng.randint(1, max(1, C - len(p['w'])))
            ng = g.colocar(p['w'], r0, c0, 'h')
            if ng:
                g = ng
                usados.add(p['w'])
                break
        else:
            continue
        falhas = 0
        while falhas < 3:
            cand = []
            livres = [p for p in pool if p['w'] not in usados]
            rng.shuffle(livres)
            for r in range(R):
                for c in range(C):
                    x = g.g[r][c]
                    if x is None or x[0] != 'L':
                        continue
                    for p in livres[:260]:
                        w = p['w']
                        for i, ch in enumerate(w):
                            if ch != x[1]:
                                continue
                            for d in ('h', 'v'):
                                if (r, c, d) in g.usadas:
                                    continue
                                dr, dc = (0, 1) if d == 'h' else (1, 0)
                                ng = g.colocar(w, r - dr * i, c - dc * i, d)
                                if ng:
                                    cand.append((ng.ult_cruz * 3 + len(w) * 0.6 + rng.random() * 2.2, ng, w))
                    if len(cand) > 400:
                        break
                if len(cand) > 400:
                    break
            if not cand:
                # sem cruzamento possível: tenta uma palavra solta em área livre
                solta = []
                for p in livres[:200]:
                    w = p['w']
                    if len(w) > 5:
                        continue
                    for _k in range(10):
                        d = rng.choice('hv')
                        r = rng.randint(1, R - 1) if d == 'v' else rng.randint(0, R - 1)
                        c = rng.randint(1, C - 1) if d == 'h' else rng.randint(0, C - 1)
                        ng = g.colocar(w, r, c, d)
                        if ng:
                            solta.append((rng.random(), ng, w))
                            break
                if not solta:
                    break
                cand = solta
                falhas += 1
            cand.sort(key=lambda t: -t[0])
            top = cand[:6]
            _, g, w = rng.choice(top)
            usados.add(w)
        pont = g.letras() + 0.5 * g.dicas()
        if melhor is None or pont > melhor[0]:
            melhor = (pont, g)
    return melhor[1] if melhor else None


def exportar(g, numero, titulo, mapa):
    elementos = []
    for r in range(g.R):
        for c in range(g.C):
            x = g.g[r][c]
            if x is None or x[0] == 'B':
                continue
            if x[0] == 'L':
                elementos.append({'linha': r + 1, 'coluna': c + 1, 'tipo': 'letra', 'letra_correta': x[1]})
            else:
                ents = x[1]
                if 'h' in ents and 'v' in ents:
                    txt = mapa[ents['h']['w']] + '/' + mapa[ents['v']['w']]
                    elementos.append({'linha': r + 1, 'coluna': c + 1, 'tipo': 'dica', 'texto_dica': txt})
                else:
                    d = 'h' if 'h' in ents else 'v'
                    elementos.append({'linha': r + 1, 'coluna': c + 1, 'tipo': 'dica',
                                      'texto_dica': mapa[ents[d]['w']],
                                      'seta': 'horizontal' if d == 'h' else 'vertical'})
    return {'fase': numero, 'titulo': titulo, 'dimensoes': {'linhas': g.R, 'colunas': g.C}, 'elementos': elementos}


# (primeira fase, quantidade, linhas, colunas, dificuldade máx., comprimento mín., máx., preenchimento mínimo)
PLANO = [
    (3, 1, 6, 6, 1, 3, 5, 0.55),
    (4, 2, 7, 7, 1, 3, 6, 0.55),
    (6, 2, 8, 8, 1, 3, 6, 0.55),
    (8, 6, 9, 9, 1, 3, 6, 0.50),
    (14, 8, 9, 9, 2, 3, 7, 0.52),
    (22, 8, 10, 10, 2, 3, 8, 0.54),
    (30, 8, 10, 10, 3, 3, 9, 0.55),
    (38, 5, 11, 10, 3, 3, 9, 0.55),
]
TITULOS = [
    'Bom de Boca', 'Fio da Meada', 'Ponto de Partida', 'Vento em Popa', 'Passo a Passo', 'Ideia Fixa',
    'Tiro e Queda', 'Mão na Roda', 'Pé na Estrada', 'Cabeça Fria', 'Lance de Mestre', 'Casa de Ferreiro',
    'Faro Fino', 'Tábua de Salvação', 'Pente Fino', 'Sol a Pino', 'Ouro de Tolo', 'Água Mole',
    'Céu de Brigadeiro', 'Barra Limpa', 'Pulo do Gato', 'Cartas na Mesa', 'Ás da Manga', 'Olho Vivo',
    'Voz do Povo', 'Tom Maior', 'Chave de Ouro', 'Muito Barulho', 'Dobro ou Nada', 'Segredo de Estado',
    'Cruzada Real', 'Rota Final', 'Grande Enigma', 'Mestre das Palavras', 'Lenda Viva',
]


def main():
    saida = sys.argv[1]
    os.makedirs(saida, exist_ok=True)
    pal = carregar()
    mapa = {p['w']: p['dica'] for p in pal}
    print(len(pal), 'palavras')
    i = 0
    for ini, qtd, R, C, md, cmin, cmax, fmin in PLANO:
        for k in range(qtd):
            num = ini + k
            rng = random.Random(1000 + num * 7919)
            melhor = None
            for esforco in range(1, 40):
                g = gerar(R, C, pal, rng, md, cmin, cmax, tentativas=30)
                if g and g.letras() / (R * C) >= fmin:
                    melhor = g
                    break
                if g and (melhor is None or g.letras() > melhor.letras()):
                    melhor = g
            dados = exportar(melhor, num, TITULOS[i % len(TITULOS)], mapa)
            i += 1
            with open(os.path.join(saida, 'fase_%d.json' % num), 'w', encoding='utf-8') as f:
                json.dump(dados, f, ensure_ascii=False, indent=1)
            print('fase', num, '%dx%d' % (R, C), 'letras', melhor.letras(), 'dicas', melhor.dicas(),
                  'ocupação %.0f%%' % (100 * (melhor.letras() + melhor.dicas()) / (R * C)))


if __name__ == '__main__':
    main()
