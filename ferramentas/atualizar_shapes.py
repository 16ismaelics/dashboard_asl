"""Atualiza os mapas do painel a partir de novos shapefiles (sem instalar nada).

Uso (na pasta do projeto):
    python3 ferramentas/atualizar_shapes.py CAMINHO/DA/PASTA/COM/OS/SHAPES

A pasta deve conter (os nomes podem ter sufixos):
    Propriedades_*.shp      (imóveis)
    AreasExecutadas_*.shp   (áreas de plantio)
    *Municipios*.shp        (opcional; limites municipais)
Os arquivos .dbf/.shx/.cpg de cada shape devem estar junto.
CPF e caminhos de arquivo são descartados automaticamente.
"""
import glob, os, subprocess, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
data = os.path.join(here, '..', 'data')
src = sys.argv[1] if len(sys.argv) > 1 else '.'

def find(pat):
    m = sorted(glob.glob(os.path.join(src, '**', pat), recursive=True))
    return m[0] if m else None

def enc(shp):
    cpg = shp[:-4] + '.cpg'
    if os.path.exists(cpg):
        c = open(cpg).read().strip().lower()
        return 'cp1252' if '1252' in c else ('latin-1' if '8859' in c else 'utf-8')
    return 'utf-8'

prop, areas, mun = find('Propriedades_*.shp'), find('AreasExecutadas_*.shp'), find('*Municipios*.shp')
if not prop or not areas:
    sys.exit('Não encontrei Propriedades_*.shp e AreasExecutadas_*.shp em ' + src)
with tempfile.TemporaryDirectory() as tmp:
    conv = os.path.join(here, 'shp2geojson.py')
    run = lambda *a: subprocess.run([sys.executable, conv, *a], check=True)
    run(prop, os.path.join(tmp, 'propriedades.geojson'), enc(prop))
    run(areas, os.path.join(tmp, 'areas.geojson'), enc(areas))
    if mun:
        run(mun, os.path.join(tmp, 'municipios.geojson'), enc(mun), '0.002', '4')
    else:
        import shutil; shutil.copy(os.path.join(data, 'municipios.geojson'), tmp)
        # o prep espera o formato original do IBGE; mantém o arquivo já tratado
        print('Sem shape de municípios: mantendo o atual.')
    subprocess.run([sys.executable, os.path.join(here, 'prep_geo.py'), tmp, data], check=True, cwd=here)
print('Pronto. Envie a pasta data/ atualizada para o repositório (ou faça novo deploy).')
