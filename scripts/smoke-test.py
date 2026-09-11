"""Run the real JS client against a temporary migrated backend on loopback.

Run with the sibling backend's Python venv. Never reads the deployed database.
"""
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time


extension = Path(__file__).resolve().parent.parent
backend = extension.parent / "job-tracker-backend"
sys.path.insert(0, str(backend))


def main():
    with tempfile.TemporaryDirectory(prefix="job-tracker-close-smoke-") as scratch:
        os.environ["DATABASE_URL"] = f"sqlite:///{Path(scratch) / 'smoke.sqlite'}"

        from alembic import command
        from alembic.config import Config
        from fastapi import FastAPI
        import uvicorn
        from app.database import engine
        from app.main import app

        assert engine.url.get_backend_name() == "sqlite", "Smoke test requires SQLite"
        config = Config(str(backend / "alembic.ini"))
        config.set_main_option("script_location", str(backend / "alembic"))
        command.upgrade(config, "head")
        proxy = FastAPI()
        proxy.mount("/api", app)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
            server = uvicorn.Server(uvicorn.Config(proxy, log_level="error"))
            thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
            thread.start()
            try:
                deadline = time.monotonic() + 10
                while not server.started:
                    if not thread.is_alive() or time.monotonic() > deadline:
                        raise RuntimeError("Local smoke server did not start")
                    time.sleep(0.05)
                subprocess.run(
                    ["node", str(extension / "scripts" / "smoke-client.mjs"),
                     f"http://127.0.0.1:{port}"],
                    check=True, timeout=30,
                )
            finally:
                server.should_exit = True
                thread.join(timeout=10)
                engine.dispose()


if __name__ == "__main__":
    main()
