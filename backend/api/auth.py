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
            # Authorization: optional allowlist by email or by hosted domain
            # Configuration (comma-separated values):
            #   ALLOWED_EMAILS=alice@example.com,bob@example.com
            #   ALLOWED_DOMAINS=example.com,another.org
            allowed_emails_raw = os.environ.get('ALLOWED_EMAILS', '')
            allowed_domains_raw = os.environ.get('ALLOWED_DOMAINS', '')
            allowed_emails = {e.strip().lower() for e in allowed_emails_raw.split(',') if e.strip()}
            allowed_domains = {d.strip().lower() for d in allowed_domains_raw.split(',') if d.strip()}

            # If any allowlist is set, enforce membership of either the email or the domain
            if allowed_emails or allowed_domains:
                user_email = (id_info.get('email') or '').lower()
                user_domain = user_email.split('@')[-1] if '@' in user_email else ''
                email_ok = (user_email in allowed_emails) if allowed_emails else False
                domain_ok = (user_domain in allowed_domains) if allowed_domains else False
                if not (email_ok or domain_ok):
                    current_app.logger.warning(f"Unauthorized user trying to access: {user_email}")
                    return jsonify({"error": "forbidden", "message": "Your account is not authorized to access this service."}), 403
            return f(*args, **kwargs)
        return wrapped
    return decorator
