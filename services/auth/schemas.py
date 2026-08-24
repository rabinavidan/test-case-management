"""Re-exports the schemas shared with the monolith — see shared/schemas.py
for what was unified (including a real bug this fixed: this service's
TokenResponse never declared `token_type`, so its responses were silently
missing it) and why.
"""
from shared.schemas import UserRegister, UserLogin, UserResponse, TokenResponse

__all__ = ["UserRegister", "UserLogin", "UserResponse", "TokenResponse"]
