import os, json, logging
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

from .schemas import AIGenerateRequest, AIGenerateResponse, AIGeneratedTestCase
from .auth import require_admin, UserClaims

logger = logging.getLogger("ai")
PROJECTS_SERVICE_URL = os.getenv("PROJECTS_SERVICE_URL", "http://projects:8002")

app = FastAPI(title="AI Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai"}


@app.post("/api/suites/{suite_id}/testcases/generate", response_model=AIGenerateResponse)
async def generate(suite_id: int, payload: AIGenerateRequest,
                   _: UserClaims = Depends(require_admin)):
    # Get suite name from projects service
    suite_name = f"Suite {suite_id}"
    try:
        resp = httpx.get(f"{PROJECTS_SERVICE_URL}/internal/suites/{suite_id}", timeout=5)
        if resp.status_code == 404:
            raise HTTPException(404, "Suite not found")
        suite_name = resp.json().get("name", suite_name)
    except HTTPException:
        raise
    except Exception:
        pass

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(503, "AI generation unavailable: ANTHROPIC_API_KEY not configured")

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        system = (
            "You are a senior QA engineer. Generate detailed, actionable test cases for the given feature. "
            "Respond with a JSON object matching exactly this schema:\n"
            '{"test_cases": [{"title": str, "description": str, "steps": str, '
            '"expected_result": str, "priority": "low"|"medium"|"high"|"critical"}]}'
        )
        user = (
            f"Suite: {suite_name}\n"
            f"Feature description: {payload.feature_description}\n"
            f"Generate exactly {payload.count} test cases."
        )
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
        test_cases = parsed.get("test_cases", [])
        logger.info(f"AI generated {len(test_cases)} test cases for suite={suite_id}")
        return AIGenerateResponse(
            test_cases=[AIGeneratedTestCase(**tc) for tc in test_cases],
            model=message.model,
        )
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned invalid JSON; try again")
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        raise HTTPException(502, f"AI generation failed: {str(e)}")
