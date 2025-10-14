import os
from functools import wraps
from flask import request, jsonify, current_app
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from google.auth import exceptions as google_auth_exceptions


class TokenError(Exception):
    """Base class for token verification errors."""


class TokenExpiredError(TokenError):
    """Raised when the provided token is expired."""


class TokenInvalidError(TokenError):
    """Raised when the provided token is invalid for reasons other than expiry."""


def get_request_user_id_or_error():
    """Call get_request_user_id() and return a tuple (uid, error_response).

    If the token is expired or invalid, the second element will be a Flask
    response tuple (body, status) which callers can return directly. If no
    error occurred the second element is None.
    """
    try:
        uid = get_request_user_id()
        return uid, None
    except TokenExpiredError as e:
        try:
            return None, (jsonify({'error': 'token_expired', 'message': str(e)}), 401)
        except Exception:
            return None, (jsonify({'error': 'token_expired'}), 401)
    except TokenInvalidError as e:
        try:
            return None, (jsonify({'error': 'invalid_token', 'message': str(e)}), 401)
        except Exception:
            return None, (jsonify({'error': 'invalid_token'}), 401)

def _verify_token_and_get_info(token: str, client_id: str):
    """Verify a Google ID token and return decoded claims or raise ValueError.

    Extracted so other modules (e.g. to obtain the uid) can reuse without the
    decorator side effects. Prefers stable unique user id (sub) over email.
    """
    try:
        info = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
        return info
    except (google_auth_exceptions.InvalidValue, ValueError) as e:
        # Normalize Google's InvalidValue into ValueError so callers that
        # only expect ValueError keep working. Preserve the message.
        raise ValueError(str(e)) from e

def get_request_user_id() -> str | None:
    """Return a stable per-user identifier (Google 'sub') for the current request.

    Falls back to email if token not present/invalid. Only intended for use
    inside a request context. Returns None if not determinable.
    """
    auth_header = request.headers.get('Authorization') if request else None
    if not auth_header:
        return None
    parts = auth_header.split()
    if parts[0].lower() != 'bearer' or len(parts) != 2:
        return None
    token = parts[1]
    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    if not client_id:
        return None
    try:
        info = _verify_token_and_get_info(token, client_id)
        return info.get('sub') or info.get('email')
    except (google_auth_exceptions.InvalidValue, ValueError) as e:
        # Distinguish expired tokens from other invalid token errors so callers
        # can surface a specific 'token_expired' response to clients.
        msg = str(e)
        try:
            current_app.logger.info(f"Token verification failed in get_request_user_id: {msg}")
        except Exception:
            pass
        if 'expired' in msg.lower() or 'token expired' in msg.lower() or 'token used too late' in msg.lower():
            raise TokenExpiredError(msg)
        raise TokenInvalidError(msg)
    except Exception as e:
        # Unexpected errors should be treated as invalid token to avoid leaking
        # implementation details; log if possible and raise a TokenInvalidError.
        try:
            current_app.logger.exception("Unexpected error verifying token")
        except Exception:
            pass
        raise TokenInvalidError(str(e) if e else 'token_verification_failed')


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
            except (google_auth_exceptions.InvalidValue, ValueError) as e:
                # Detect expired token so frontend can attempt a refresh
                msg = str(e)
                current_app.logger.error(f"Token validation failed: {msg}")
                if 'expired' in msg.lower() or 'token expired' in msg.lower():
                    return jsonify({"error": "token_expired", "message": msg}), 401
                return jsonify({"error": f"Invalid token: {msg}"}), 401
            except Exception as e:
                # Unexpected errors should be treated as server errors
                current_app.logger.exception("Unexpected error during token verification")
                return jsonify({"error": "server_error", "message": "Token verification failed unexpectedly."}), 500
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
