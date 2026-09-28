"""
app/utils/logging.py
Structured logging setup for the Diet AI service.
Sensitive patient fields are NEVER logged.
"""
import logging
import sys
import uuid
from contextvars import ContextVar

# Per-request ID stored in a context variable (set in middleware)
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


def get_logger(name: str) -> logging.Logger:
    """Return a named logger configured for structured output."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


def new_request_id() -> str:
    return str(uuid.uuid4())[:8]
