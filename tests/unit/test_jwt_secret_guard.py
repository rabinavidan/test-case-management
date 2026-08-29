"""Unit tests for the JWT-secret production guard — a pure function, so no
module reload/import gymnastics needed even though it's exercised at import
time in api/auth.py, services/auth/auth.py, and services/common/auth.py.
"""
import pytest

from api.auth import validate_jwt_secret as api_validate_jwt_secret
from services.common.jwt import validate_jwt_secret as services_validate_jwt_secret


@pytest.mark.parametrize("validate_jwt_secret", [api_validate_jwt_secret, services_validate_jwt_secret])
class TestValidateJwtSecret:
    def test_raises_for_default_secret_in_production(self, validate_jwt_secret):
        with pytest.raises(RuntimeError, match="insecure default"):
            validate_jwt_secret("testflow-dev-secret-change-in-production", is_production=True)

    def test_raises_for_docker_compose_default_secret_in_production(self, validate_jwt_secret):
        with pytest.raises(RuntimeError, match="insecure default"):
            validate_jwt_secret("change-me-in-production", is_production=True)

    def test_allows_default_secret_outside_production(self, validate_jwt_secret):
        validate_jwt_secret("testflow-dev-secret-change-in-production", is_production=False)

    def test_allows_a_real_secret_in_production(self, validate_jwt_secret):
        validate_jwt_secret("a-long-random-secret-nobody-can-guess", is_production=True)
