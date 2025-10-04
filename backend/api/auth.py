import os
from functools import wraps
from flask import request, jsonify, current_app
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests


def require_google_token():
    """Decorator factory verifying Google OAuth2 ID tokens.

    Uses CURRENT Flask app for logging; reads GOOGLE_CLIENT_ID from env.
    """
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            auth_header = request.headers.get('Authorization')
            if not auth_header:
                return jsonify({"error": "Authorization header is missing"}), 401
            parts = auth_header.split()
            if parts[0].lower() != 'bearer' or len(parts) != 2:
                return jsonify({"error": "Invalid Authorization header format. Must be 'Bearer <token>'"}), 401
            token = parts[1]
            GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
            if not GOOGLE_CLIENT_ID:
                current_app.logger.error("ERROR: GOOGLE_CLIENT_ID environment variable not set on the server.")
                return jsonify({"error": "Server configuration error"}), 500
            try:
                id_info = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
                current_app.logger.info(f"Authenticated user: {id_info.get('email')}")
            except ValueError as e:
                # Detect expired token so frontend can attempt a refresh
                msg = str(e)
                current_app.logger.error(f"Token validation failed: {msg}")
                if 'expired' in msg.lower() or 'token expired' in msg.lower():
                    return jsonify({"error": "token_expired", "message": msg}), 401
                return jsonify({"error": f"Invalid token: {msg}"}), 401
            return f(*args, **kwargs)
        return wrapped
    return decorator
