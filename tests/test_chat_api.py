import importlib
from types import SimpleNamespace

import pytest


@pytest.fixture
def chat_app(tmp_path, monkeypatch):
    monkeypatch.setenv("LAB5_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-placeholder-key")

    import app

    importlib.reload(app)

    def fake_openai(**kwargs):
        assert kwargs["api_key"] == "test-placeholder-key"

        def create(**request):
            assert request["messages"][-1] == {"role": "user", "content": "你好"}
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="固定回复"))]
            )

        return SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        )

    monkeypatch.setattr(app, "OpenAI", fake_openai)
    return app


def test_conversation_crud_with_message(chat_app):
    client = chat_app.app.test_client()

    created = client.post("/api/conversations", json={"title": "测试会话"})
    assert created.status_code == 201
    conversation_id = created.json["id"]

    message = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"message": "你好"},
    )
    assert message.status_code == 201
    assert message.json["assistant_message"]["content"] == "固定回复"

    detail = client.get(f"/api/conversations/{conversation_id}")
    assert detail.status_code == 200
    assert [item["content"] for item in detail.json["messages"]] == [
        "你好",
        "固定回复",
    ]

    updated = client.patch(
        f"/api/conversations/{conversation_id}", json={"title": "更新后的会话"}
    )
    assert updated.status_code == 200
    assert client.get(f"/api/conversations/{conversation_id}").json["title"] == "更新后的会话"

    deleted = client.delete(f"/api/conversations/{conversation_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/conversations/{conversation_id}").status_code == 404
    assert chat_app.DATA_FILE.read_text(encoding="utf-8").strip() == "[]"


def test_empty_message_does_not_create_record(chat_app):
    client = chat_app.app.test_client()
    created = client.post("/api/conversations", json={"title": "测试会话"})
    conversation_id = created.json["id"]

    response = client.post(
        f"/api/conversations/{conversation_id}/messages", json={"message": " "}
    )
    assert response.status_code == 400
    assert response.json["error"] == "message 不能为空"
    assert client.get(f"/api/conversations/{conversation_id}").json["messages"] == []
