# Built with the repo root as context (see docker-compose.microservices.yml),
# not services/auth in isolation: main.py imports services.common.* and
# shared.schemas by their full dotted path, and uses relative imports
# (from .database import ...) for its own siblings — exactly how
# tests/services/ already runs this app (`from services.auth.main import
# app`, cwd at the repo root). Isolating the build context to services/auth
# alone can't satisfy either of those; see issue #217.
FROM python:3.12-slim
WORKDIR /app
COPY services/auth/requirements.txt services/auth/requirements.txt
RUN pip install --no-cache-dir -r services/auth/requirements.txt
COPY services/auth services/auth
COPY services/common services/common
COPY shared shared
COPY VERSION VERSION
CMD ["uvicorn", "services.auth.main:app", "--host", "0.0.0.0", "--port", "8001"]
