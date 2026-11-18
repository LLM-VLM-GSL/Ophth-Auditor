#!/usr/bin/env python3
"""Static file server for local tests of the audit page (Python standard library; raters never need it).

    python tests/serve.py [--port 8790] [--web web] [--data <folder>]

Serves --web (default: web/ of this repository) at http://127.0.0.1:<port>/. With --data, the path /data/ is served
from that folder instead of web/data/ (for example an encrypted copy of the test fixture). Listens on 127.0.0.1 only,
sends no directory listings and "Cache-Control: no-cache", and answers /api/* with 404 like a static host does.
Prints the page address once it listens.
"""
import argparse
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    data_dir = None
    # explicit types: on Windows, mimetypes reads the registry, where .js is sometimes text/plain
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                           ".css": "text/css; charset=utf-8", ".json": "application/json", ".bin": "application/octet-stream",
                           ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".svg": "image/svg+xml"})

    def translate_path(self, path):
        p = unquote(urlsplit(path).path)
        if self.data_dir and p.startswith("/data/"):
            parts = [x for x in p[len("/data/"):].split("/") if x not in ("", ".", "..")]
            return os.path.join(self.data_dir, *parts)
        return super().translate_path(path)

    def list_directory(self, path):
        self.send_error(404, "File not found")
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):             # quiet; failed requests only
        if len(args) > 1 and str(args[1])[:1] in ("4", "5"):
            sys.stderr.write("%s %s\n" % (args[0], args[1]))

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionError, OSError):
            pass                                    # the browser stopped reading: normal


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--web", default=os.path.join(ROOT, "web"))
    ap.add_argument("--data", default=None, help="folder served at /data/ instead of <web>/data")
    a = ap.parse_args(argv)
    handler = type("TestHandler", (Handler,), {"data_dir": os.path.abspath(a.data) if a.data else None})
    httpd = ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(handler, directory=os.path.abspath(a.web)))
    httpd.daemon_threads = True
    print("http://127.0.0.1:%d/" % a.port, flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
