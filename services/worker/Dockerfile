# See services/auth/Dockerfile's comment and issue #217. worker reuses
# services/runs' own database engine/models/population helper directly
# (see main.py's own docstring), so it needs that package alongside its own
# — building from the repo root and running via the full
# services.worker.main dotted path is what makes both resolvable.
FROM python:3.12-slim
WORKDIR /app
COPY services/worker/requirements.txt services/worker/requirements.txt
RUN pip install --no-cache-dir -r services/worker/requirements.txt
COPY services/worker services/worker
COPY services/runs services/runs
COPY services/common services/common
CMD ["python", "-m", "services.worker.main"]
