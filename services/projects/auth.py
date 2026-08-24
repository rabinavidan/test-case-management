"""Re-exports the shared stateless JWT verifier — see services/common/auth.py.
Kept as a per-service module so `from .auth import ...` in main.py doesn't
need to change; the actual logic (and the fix for the padding bug that used
to live here as its own copy) lives in one place now.
"""
from services.common.auth import UserClaims, get_current_user, require_admin

__all__ = ["UserClaims", "get_current_user", "require_admin"]
