from backend.core.security import create_access_token


def test_create_access_token(monkeypatch) -> None:
    monkeypatch.setattr("backend.core.security.settings.jwt_secret_key", "test-secret")
    token = create_access_token("admin", "admin")
    assert isinstance(token, str)
    assert token.count(".") == 2
