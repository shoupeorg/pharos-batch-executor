import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexUrl = new URL("../public/index.html", import.meta.url);
const styleUrl = new URL("../public/style.css", import.meta.url);

test("public UI classes have the required readable retro styling", async () => {
  const [html, css] = await Promise.all([
    readFile(indexUrl, "utf8"),
    readFile(styleUrl, "utf8"),
  ]);

  for (const className of ["pharos-header", "window", "titlebar", "workspace", "panel", "statusbar"]) {
    assert.match(html, new RegExp(`class=["'][^"']*\\b${className}\\b`));
    assert.match(css, new RegExp(`\\.${className}\\s*\\{`));
  }

  assert.match(css, /--blue:\s*#0210ff/i);
  assert.match(css, /body\s*\{[^}]*background:\s*#000/is);
  assert.match(css, /\.panel\s*\{[^}]*color:\s*var\(--ink\)[^}]*background:\s*var\(--paper\)/is);
  assert.match(css, /\.titlebar\s*\{[^}]*background:\s*var\(--blue\)[^}]*color:\s*#fff/is);
  assert.match(css, /\.pharos-header img\s*\{[^}]*width:\s*34px[^}]*height:\s*43px/is);
  assert.match(css, /@media\s*\(max-width:\s*560px\)/i);
});
