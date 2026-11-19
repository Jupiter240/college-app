#!/usr/bin/env python3
"""
Local persistence server for Ayan's College & Internship Command Center.
Serves static files and provides REST endpoints to persist edits to data/app_data.json
and data/default_data.js, plus 1-click re-sync from the Google Sheet.
"""
import datetime
import http.server
import json
import os
import shutil
import socketserver
import urllib.request

import build_initial_data

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
JSON_PATH = os.path.join(DATA_DIR, "app_data.json")
JS_PATH = os.path.join(DATA_DIR, "default_data.js")
XLSX_PATH = os.path.join(DATA_DIR, "original_sheet.xlsx")
PORT = int(os.environ.get("PORT", "8080"))

EXPORT_URL = "https://docs.google.com/spreadsheets/d/1TQQxO4H7hZueiuH2XLK0yEbJjraDqKQWUdeCaIuyg48/export?format=xlsx"


def save_data_files(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    data.setdefault("meta", {})["lastSaved"] = datetime.datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    if os.path.exists(JSON_PATH):
        shutil.copy2(JSON_PATH, os.path.join(BACKUP_DIR, "app_data_prev.json"))
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    with open(JS_PATH, "w", encoding="utf-8") as f:
        f.write("window.INITIAL_APP_DATA = ")
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write(";\n")


class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/data"):
            if not os.path.exists(JSON_PATH):
                data = build_initial_data.build_structured_data()
                save_data_files(data)
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                payload = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(payload.encode("utf-8"))
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/data"):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(raw)
                save_data_files(data)
                resp = {
                    "ok": True,
                    "lastSaved": data["meta"]["lastSaved"],
                }
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(resp).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            return

        if self.path.startswith("/api/sync-google-sheet"):
            try:
                req = urllib.request.Request(
                    EXPORT_URL,
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                with urllib.request.urlopen(req, timeout=15) as response:
                    xlsx_bytes = response.read()
                if len(xlsx_bytes) > 1000 and xlsx_bytes[:2] == b"PK":
                    with open(XLSX_PATH, "wb") as f:
                        f.write(xlsx_bytes)
                data = build_initial_data.build_structured_data()
                save_data_files(data)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "data": data}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    if not os.path.exists(JSON_PATH):
        initial = build_initial_data.build_structured_data()
        save_data_files(initial)
    with ReusableTCPServer(("127.0.0.1", PORT), AppRequestHandler) as httpd:
        print(f"Serving Ayan's College & Internship App at http://localhost:{PORT}")
        httpd.serve_forever()
