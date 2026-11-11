import json, sys, glob, os
def analisar(path):
    d = json.load(open(path, encoding='utf-8'))
    R, C = d['dimensoes']['linhas'], d['dimensoes']['colunas']
    g = {(e['linha'], e['coluna']): e for e in d['elementos']}
    palavras = []
    for (r, c), e in g.items():
        if e['tipo'] != 'dica': continue
        t = e['texto_dica']
        dirs = ['h', 'v'] if '/' in t else ['h' if e.get('seta') == 'horizontal' else 'v']
        for dd in dirs:
            dr, dc = (0, 1) if dd == 'h' else (1, 0)
            rr, cc, w = r + dr, c + dc, ''
            while (rr, cc) in g and g[(rr, cc)]['tipo'] == 'letra':
                w += g[(rr, cc)]['letra_correta']; rr += dr; cc += dc
            palavras.append((dd, r + dr, c + dc, w))
    erros = []
    cobertas = set()
    for dd, r, c, w in palavras:
        if len(w) < 2: erros.append('palavra curta %s %s' % (dd, w))
        for i in range(len(w)):
            cobertas.add((r + (i if dd == 'v' else 0), c + (i if dd == 'h' else 0), dd))
    for (r, c), e in g.items():
        if e['tipo'] != 'letra': continue
        if not any((r, c, dd) in cobertas for dd in 'hv'): erros.append('letra órfã %d,%d' % (r, c))
        # corridas de 2+ sem palavra
        if (g.get((r, c + 1), {}).get('tipo') == 'letra' and (r, c, 'h') not in cobertas): erros.append('corrida h sem dica %d,%d' % (r, c))
        if (g.get((r + 1, c), {}).get('tipo') == 'letra' and (r, c, 'v') not in cobertas): erros.append('corrida v sem dica %d,%d' % (r, c))
    return d, R, C, g, palavras, erros
if __name__ == '__main__':
    tot = 0
    for p in sorted(glob.glob(sys.argv[1] + '/fase_*.json'), key=lambda x: int(x.split('_')[-1][:-5])):
        d, R, C, g, pals, err = analisar(p)
        tot += len(err)
        ws = [w for _, _, _, w in pals]
        if len(set(ws)) != len(ws): err.append('palavra repetida')
        print(os.path.basename(p), len(pals), 'palavras', 'OK' if not err else err[:3])
    print('erros totais', tot)
    if len(sys.argv) > 2:
        d, R, C, g, pals, err = analisar(sys.argv[2])
        for r in range(1, R + 1):
            print(''.join(('[' + g[(r, c)]['texto_dica'][:1] + ']' if g[(r, c)]['tipo'] == 'dica' else ' ' + g[(r, c)]['letra_correta'] + ' ') if (r, c) in g else ' # ' for c in range(1, C + 1)))
        for p in pals: print(p)
