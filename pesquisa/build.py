#!/usr/bin/env python3
"""
Gera a versão navegável (HTML) do dossiê a partir do Markdown.

    pip install markdown
    python3 pesquisa/build.py

Reaproveita os tokens de tema do deck (index.html): mesmas cores, mesmas
fontes. Para usar outro tema, troque apenas o bloco :root do CSS.
"""

import re
import pathlib
import markdown

BASE = pathlib.Path(__file__).resolve().parent
SRC = BASE / "ilhabela-negocios-ia.md"
OUT = BASE / "ilhabela-negocios-ia.html"

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Sora:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

/* ============================================================
   TEMA — mesmos tokens do deck (index.html). Para reaproveitar
   este documento com outra identidade, troque apenas este bloco.
   ============================================================ */
:root{
  --ink:#0B0F0E;
  --surface:#141A18;
  --card:#171E1B;
  --line:#26332C;
  --text:#EEF4F1;
  --muted:#8FA39B;
  --mar:#2BE0C8;
  --coral:#FF6A4D;
  --grad:linear-gradient(90deg,var(--mar),var(--coral));
  --f-display:'Archivo Black',sans-serif;
  --f-body:'Sora',sans-serif;
  --f-mono:'IBM Plex Mono',monospace;
  --sidebar:290px;
}

*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:28px}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}}
body{background:var(--ink);color:var(--text);font-family:var(--f-body);
     font-size:16px;line-height:1.72;-webkit-font-smoothing:antialiased}
::selection{background:var(--mar);color:var(--ink)}

/* ---------- barra de progresso ---------- */
.belt{position:fixed;top:0;left:0;height:4px;width:100%;background:#1a2320;z-index:80}
.belt-fill{height:100%;width:0;background:var(--grad)}

/* ---------- layout ---------- */
.shell{display:flex;align-items:flex-start;max-width:1500px;margin:0 auto}

nav.toc{
  position:sticky;top:0;flex:0 0 var(--sidebar);width:var(--sidebar);
  height:100vh;overflow-y:auto;padding:34px 20px 60px 26px;
  border-right:1px solid var(--line);background:var(--surface);
}
nav.toc .brand{font-family:var(--f-mono);font-size:10.5px;letter-spacing:.16em;
  color:var(--muted);text-transform:uppercase;margin-bottom:6px}
nav.toc .who{font-family:var(--f-display);font-size:17px;line-height:1.25;margin-bottom:22px}
nav.toc .who span{background:var(--grad);-webkit-background-clip:text;
  background-clip:text;-webkit-text-fill-color:transparent}
nav.toc a{display:block;color:var(--muted);text-decoration:none;font-size:13.5px;
  padding:6px 10px;border-radius:7px;border-left:2px solid transparent;line-height:1.4}
nav.toc a:hover{color:var(--text);background:#1c2522}
nav.toc a.on{color:var(--mar);border-left-color:var(--mar);background:#182220}
nav.toc a:focus-visible{outline:2px solid var(--mar);outline-offset:2px}

main{flex:1 1 auto;min-width:0;padding:56px clamp(20px,4vw,72px) 140px}
.doc{max-width:900px}

/* ---------- tipografia ---------- */
h1{font-family:var(--f-display);font-size:clamp(30px,4.6vw,50px);line-height:1.08;
   letter-spacing:-.02em;margin:0 0 6px}
h2{font-family:var(--f-display);font-size:clamp(22px,3vw,32px);line-height:1.18;
   letter-spacing:-.01em;margin:64px 0 14px;padding-top:22px;border-top:1px solid var(--line)}
h2:first-of-type{border-top:none}
h3{font-family:var(--f-body);font-weight:700;font-size:20px;margin:38px 0 10px;color:var(--mar)}
h4{font-family:var(--f-mono);font-size:12px;letter-spacing:.13em;text-transform:uppercase;
   color:var(--muted);margin:26px 0 8px}
p{margin:0 0 15px}
ul,ol{margin:0 0 16px 22px}
li{margin-bottom:7px}
a{color:var(--mar);text-decoration:none;border-bottom:1px solid rgba(43,224,200,.3)}
a:hover{border-bottom-color:var(--mar)}
strong{color:#fff;font-weight:700}
em{color:var(--muted)}
hr{border:none;border-top:1px solid var(--line);margin:44px 0}

/* ---------- código e diagramas ---------- */
code{font-family:var(--f-mono);font-size:.86em;background:#1b2422;color:var(--mar);
     padding:1px 6px;border-radius:5px}
pre{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--mar);
    border-radius:11px;padding:18px 20px;margin:0 0 20px;overflow-x:auto}
pre code{background:none;color:var(--text);padding:0;font-size:12.5px;line-height:1.6;
         white-space:pre;display:block}

/* ---------- tabelas ---------- */
.tw{overflow-x:auto;margin:0 0 22px;border:1px solid var(--line);border-radius:11px;
    background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:560px;font-size:13.5px}
thead th{background:#1b2422;font-family:var(--f-mono);font-size:10.5px;letter-spacing:.09em;
  text-transform:uppercase;color:var(--muted);text-align:left;padding:11px 14px;
  border-bottom:1px solid var(--line);white-space:nowrap;font-weight:500}
tbody td{padding:11px 14px;border-bottom:1px solid #1e2926;vertical-align:top;line-height:1.55}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#1a2320}

/* ---------- citação / alerta ---------- */
blockquote{border-left:3px solid var(--coral);background:#1d1917;border-radius:0 11px 11px 0;
  padding:16px 20px;margin:0 0 20px}
blockquote p:last-child{margin-bottom:0}
blockquote strong{color:var(--coral)}

/* ---------- cabeçalho do documento ---------- */
header.hero{margin-bottom:44px}
header.hero .kicker{font-family:var(--f-mono);font-size:11px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--mar);margin-bottom:16px}
header.hero .sub{font-size:19px;color:var(--muted);max-width:640px;margin-top:10px}
header.hero .meta{font-family:var(--f-mono);font-size:11.5px;color:var(--muted);
  margin-top:22px;letter-spacing:.06em}

/* ---------- rodapé ---------- */
footer{margin-top:80px;padding-top:24px;border-top:1px solid var(--line);
  font-family:var(--f-mono);font-size:11px;color:var(--muted);letter-spacing:.05em}

/* ---------- responsivo ---------- */
.navtoggle{display:none}
@media(max-width:1000px){
  nav.toc{position:fixed;left:0;top:0;z-index:70;transform:translateX(-100%);
    padding-top:66px;transition:transform .25s ease;box-shadow:0 0 40px rgba(0,0,0,.5)}
  nav.toc.open{transform:translateX(0)}
  main{padding:76px 20px 100px}
  .navtoggle{display:flex;align-items:center;gap:8px;position:fixed;top:14px;left:14px;z-index:75;
    background:var(--surface);border:1px solid var(--line);color:var(--text);
    font-family:var(--f-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
    padding:9px 14px;border-radius:9px;cursor:pointer}
  h2{margin-top:46px}
}
@media print{
  nav.toc,.belt,.navtoggle{display:none}
  body{background:#fff;color:#111}
  main{padding:0}
  h2{page-break-after:avoid}
  .tw,pre{page-break-inside:avoid}
}
"""

JS = """
(function(){
  var belt = document.querySelector('.belt-fill');
  var links = Array.prototype.slice.call(document.querySelectorAll('nav.toc a[href^="#"]'));
  var targets = links.map(function(a){ return document.getElementById(a.getAttribute('href').slice(1)); });
  var toc = document.querySelector('nav.toc');
  var btn = document.querySelector('.navtoggle');

  function onScroll(){
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    belt.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';

    var current = 0;
    for (var i = 0; i < targets.length; i++){
      if (targets[i] && targets[i].getBoundingClientRect().top <= 120) current = i;
    }
    links.forEach(function(a, i){ a.classList.toggle('on', i === current); });
  }

  document.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', onScroll);
  onScroll();

  if (btn){
    btn.addEventListener('click', function(){ toc.classList.toggle('open'); });
    links.forEach(function(a){
      a.addEventListener('click', function(){ toc.classList.remove('open'); });
    });
  }
})();
"""


def slugify(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = text.lower().strip()
    subs = {"á": "a", "à": "a", "â": "a", "ã": "a", "é": "e", "ê": "e", "í": "i",
            "ó": "o", "ô": "o", "õ": "o", "ú": "u", "ç": "c"}
    for k, v in subs.items():
        text = text.replace(k, v)
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    return re.sub(r"[\s-]+", "-", text).strip("-")


def main():
    raw = SRC.read_text(encoding="utf-8")

    # O H1, o bloco "Como ler" e o índice do Markdown viram hero + sidebar no HTML,
    # então o corpo começa direto na primeira seção de conteúdo.
    start = raw.index("## Ponto de partida")
    body_md = raw[start:]

    html = markdown.markdown(
        body_md,
        extensions=["tables", "fenced_code", "attr_list", "sane_lists"],
        output_format="html5",
    )

    # Âncoras nos H2 + coleta do índice lateral.
    toc_items = []

    def anchor(m):
        title = m.group(1)
        slug = slugify(title)
        toc_items.append((slug, re.sub(r"<[^>]+>", "", title)))
        return '<h2 id="%s">%s</h2>' % (slug, title)

    html = re.sub(r"<h2>(.*?)</h2>", anchor, html, flags=re.S)

    # Tabelas ganham container com rolagem horizontal própria.
    html = html.replace("<table>", '<div class="tw"><table>').replace("</table>", "</table></div>")

    nav = "\n".join('<a href="#%s">%s</a>' % (s, t) for s, t in toc_items)

    doc = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ilhabela × IA × Claude Code — Dossiê de pesquisa e brainstorm</title>
<meta name="description" content="Pesquisa profunda e brainstorm estratégico sobre apps, serviços e negócios de IA com base em Ilhabela.">
<style>{CSS}</style>
</head>
<body>
<div class="belt"><div class="belt-fill"></div></div>
<button class="navtoggle" aria-label="Abrir índice">☰ Índice</button>

<div class="shell">
  <nav class="toc" aria-label="Índice do documento">
    <div class="brand">Pesquisa · Julho 2026</div>
    <div class="who">Ilhabela <span>× IA ×</span> Claude Code</div>
    {nav}
  </nav>

  <main>
    <div class="doc">
      <header class="hero">
        <div class="kicker">Dossiê de pesquisa profunda e brainstorm estratégico</div>
        <h1>Ilhabela × IA × Claude&nbsp;Code</h1>
        <p class="sub">Que apps, serviços, produtos e negócios uma pessoa com domínio de IA aplicada
        e Claude Code consegue construir tendo Ilhabela como base — 70 ideias, ranqueadas,
        com as cinco melhores aprofundadas.</p>
        <p class="meta">Preparado para Thuan · Engenharia de Dados &amp; IA · Julho de 2026<br>
        <strong>[FATO]</strong> dado de fonte pública ·
        <strong>[EST]</strong> estimativa com conta visível ·
        <strong>[HIP]</strong> hipótese a testar</p>
      </header>
{html}
      <footer>
        Fonte da verdade: <code>pesquisa/ilhabela-negocios-ia.md</code> ·
        gerado por <code>pesquisa/build.py</code>
      </footer>
    </div>
  </main>
</div>

<script>{JS}</script>
</body>
</html>
"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"{OUT} — {len(doc):,} bytes, {len(toc_items)} seções")


if __name__ == "__main__":
    main()
