# See services/auth/Dockerfile's comment and issue #217 — same reasoning
# applies here: main.py needs services.common.*, shared.schemas, and its own
# package-relative siblings all resolvable, which requires building from the
# repo root and running via the full services.projects.main dotted path.
FROM python:3.12-slim
WORKDIR /app
COPY services/projects/requirements.txt services/projects/requirements.txt
RUN pip install --no-cache-dir -r services/projects/requirements.txt
COPY services/projects services/projects
COPY services/common services/common
COPY shared shared
CMD ["uvicorn", "services.projects.main:app", "--host", "0.0.0.0", "--port", "8002"]
