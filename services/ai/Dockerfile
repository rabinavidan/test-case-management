# See services/auth/Dockerfile's comment and issue #217 — same reasoning
# applies here: main.py needs services.common.* resolvable by its full
# dotted path, which requires building from the repo root and running via
# the full services.ai.main dotted path.
FROM python:3.12-slim
WORKDIR /app
COPY services/ai/requirements.txt services/ai/requirements.txt
RUN pip install --no-cache-dir -r services/ai/requirements.txt
COPY services/ai services/ai
COPY services/common services/common
COPY shared shared
CMD ["uvicorn", "services.ai.main:app", "--host", "0.0.0.0", "--port", "8004"]
