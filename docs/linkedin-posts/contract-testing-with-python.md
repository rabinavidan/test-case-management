# LinkedIn Post — Contract Testing with Python Libraries

Your microservices pass their tests. Your integration still breaks in production.

That contradiction is what contract testing fixes — and Python has genuinely good tooling for it.

**The problem**

On TestFlow (a test case management platform I've been building), the API is split into 5 FastAPI services — gateway, auth, projects, runs, and an AI service — talking to each other over HTTP. Each service has its own unit and integration tests, all green. None of that guarantees the *runs* service is still sending requests the *projects* service actually understands after either one changes its schema. Mocks drift. Docs go stale. The only test that catches that is one that checks the real contract between the two sides.

**Two Python approaches that solve this differently**

🔹 **Pact (`pact-python`)** — consumer-driven contract testing. The consumer (e.g. the runs service) writes a test describing exactly what it expects from a provider call — request shape, response shape. That test generates a contract file. The provider then replays that contract against its real code in CI. If the provider ever breaks the contract, its own pipeline fails — before anything reaches a shared environment. No live network calls between services in either test.

```python
from pact import Consumer, Provider

pact = Consumer("runs-service").has_pact_with(Provider("projects-service"))

def test_get_test_case():
    pact.given("test case 42 exists").upon_receiving(
        "a request for test case 42"
    ).with_request("GET", "/api/testcases/42").will_respond_with(
        200, body={"id": 42, "title": "Login flow"}
    )
    with pact:
        result = get_test_case(42)
        assert result["title"] == "Login flow"
```

🔹 **Schemathesis** — property-based, schema-driven testing. Point it at an OpenAPI/JSON Schema spec and it generates hundreds of edge-case requests automatically — weird strings, boundary numbers, missing fields — and checks every response actually matches the schema the service advertises. It's less "did we agree on this contract" and more "does the code we shipped actually honor the schema it published." We run it against the FastAPI-generated OpenAPI docs for every service.

```python
import schemathesis

schema = schemathesis.openapi.from_url("http://localhost:8002/openapi.json")

@schema.parametrize()
def test_api(case):
    case.call_and_validate()
```

**Why this matters more as you add services**

Contract tests are fast — no spinning up five containers and hoping the network cooperates. They fail *at the source*, telling you exactly which side broke the agreement, not just "something downstream returned a 500." And they scale linearly instead of combinatorially: N services need N contracts, not N² end-to-end tests.

Full E2E suites still have a place — but they're for verifying user journeys, not for catching "someone renamed a field." Contract tests catch that in seconds, in CI, before it ever reaches staging.

If you're running more than two Python services that talk to each other, this is one of the highest-leverage tests you can add.

#Python #ContractTesting #Pact #Schemathesis #Microservices #TestAutomation #API #SoftwareTesting #FastAPI
