import os
import socket
import threading
import webbrowser

from backend.app import create_app
from backend.database import init_db


def find_port(preferred_port):
    for port in range(preferred_port, preferred_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return preferred_port


def main():
    preferred_port = int(os.environ.get("PORT", "5000"))
    port = find_port(preferred_port)

    app = create_app()
    with app.app_context():
        init_db()

    url = f"http://127.0.0.1:{port}/login.html"
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    print("Brew & Bake is running.")
    print(f"Open {url}")
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
