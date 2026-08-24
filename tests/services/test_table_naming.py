"""services/*/models.py — table naming.

Models used to be schema-qualified (`__table_args__ = {"schema": "auth"}`
etc.), which only works against Postgres and is why tests/services/ needed
the SQLite ATTACH-DATABASE workaround to run at all (see the git history of
tests/services/conftest.py). Tables are now named with a `<service>_`
prefix instead — this test pins that contract directly, since a model
losing its prefix wouldn't necessarily fail any other test (SQLite doesn't
care about cross-service name collisions the way schema-qualification was
guarding against), it would just silently reintroduce the coupling this
change removes.
"""
from services.auth import models as auth_models
from services.projects import models as projects_models
from services.runs import models as runs_models


def test_no_model_declares_a_postgres_schema():
    for models_module in (auth_models, projects_models, runs_models):
        for name in dir(models_module):
            obj = getattr(models_module, name)
            table_args = getattr(obj, "__table_args__", None)
            assert not (isinstance(table_args, dict) and "schema" in table_args), (
                f"{models_module.__name__}.{name} still declares a Postgres schema "
                f"via __table_args__ — this service's tables should be table-name "
                f"prefixed instead (see this file's module docstring)."
            )


def test_tables_are_prefixed_with_their_owning_service():
    assert auth_models.User.__tablename__ == "auth_users"
    assert projects_models.Project.__tablename__ == "projects_projects"
    assert projects_models.TestSuite.__tablename__ == "projects_test_suites"
    assert projects_models.TestCase.__tablename__ == "projects_test_cases"
    assert runs_models.TestRun.__tablename__ == "runs_test_runs"
    assert runs_models.TestResult.__tablename__ == "runs_test_results"
