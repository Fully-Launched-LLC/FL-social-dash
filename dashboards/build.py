#!/usr/bin/env python3
"""
Regenerates the dashboards, writing everything into dashboards/dist/ — the
one directory meant to be served (Vercel's Output Directory points here;
see vercel.json). Nothing outside dist/ is ever written by this script.

All three pages are shared, static shells: every client, video, editor, and
Drive link is read live from Supabase after login (social_videos is the
single source of truth). The only thing baked in at build time is the
shared shell code. No client data ever goes into the built HTML, since
dist/ is served publicly and the login gate only runs in the browser.

Rebuild after changing a template or shell.css/shell.js/auth.js. Adding
clients or videos never needs a rebuild.

Usage: python3 dashboards/build.py
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
TEMPLATE_DIR = ROOT / "template"
OPERATOR_DIR = ROOT / "operator"
DIST_DIR = ROOT / "dist"

SHELL_CSS = (TEMPLATE_DIR / "shell.css").read_text()
SHELL_JS = (TEMPLATE_DIR / "shell.js").read_text()
AUTH_JS = (TEMPLATE_DIR / "auth.js").read_text()


def inline_shell(html):
    html = html.replace("/*__SHELL_CSS__*/", SHELL_CSS)
    html = html.replace("/*__SHELL_JS__*/", SHELL_JS)
    html = html.replace("/*__AUTH_JS__*/", AUTH_JS)
    return html


def write(rel_path, html):
    out_path = DIST_DIR / rel_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    print(f"built {out_path.relative_to(ROOT.parent)}")


def main():
    # vercel.json rewrites /clients/<slug> (and the older
    # /clients/<slug>/portal.html) to this one file; it reads the slug from
    # its own URL at runtime.
    write("clients/portal.html", inline_shell((TEMPLATE_DIR / "client-portal.template.html").read_text()))

    write("operator/dashboard.html", inline_shell((OPERATOR_DIR / "dashboard.template.html").read_text()))

    write("editor/dashboard.html", inline_shell((TEMPLATE_DIR / "editor-dashboard.template.html").read_text()))

    # A new client's onboarding, and the "Set a new password" page
    # (/welcome?mode=reset). vercel.json rewrites /welcome here.
    write("welcome.html", inline_shell((TEMPLATE_DIR / "welcome.template.html").read_text()))

    # The Fully Launched logo (white, from fullylaunched.com), shown in each
    # page's sidebar and on the login screen.
    (DIST_DIR / "assets").mkdir(parents=True, exist_ok=True)
    shutil.copy(TEMPLATE_DIR / "logo-white.png", DIST_DIR / "assets" / "logo-white.png")
    print("built dashboards/dist/assets/logo-white.png")


if __name__ == "__main__":
    main()
