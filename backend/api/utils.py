from flask import request
from flask_cors import CORS
import logging


def safe_get_json(request):
    """
    Safely get JSON from request, returning an empty dict if body is empty,
    or raising a ValueError if JSON is invalid. This function mirrors the
    previous helper but is testable and independent from app globals.
    """
    try:
        data = request.get_data() or b''
        if not data or data.strip() == b'':
            return {}
        # force=True to parse invalid content types as JSON if possible
        return request.get_json(force=True) or {}
    except Exception as e:
        raise ValueError(f"Invalid JSON: {e}")


def register_request_logging(app):
    """Register before/after request handlers for logging and CORS."""
    # Configure basic logging to stdout
    logging.basicConfig(level=logging.INFO)

    CORS(app, origins=[
        "http://localhost:8000",
        "http://localhost:8080",
        "https://portfoliopilot-335283962900.us-west1.run.app"
    ], supports_credentials=True)

    @app.before_request
    def log_api_call():
        app.logger.info("%s %s", request.method, request.path)

    @app.after_request
    def log_errors(response):
        if response.status_code >= 400:
            app.logger.error(
                "%s %s -> %s %s",
                request.method,
                request.path,
                response.status_code,
                response.get_data(as_text=True),
            )
        # Always echo the request's Origin if present
        origin = request.headers.get('Origin')
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
        else:
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:8000'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', 'Content-Type,Authorization')
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
        return response
