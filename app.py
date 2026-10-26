import json
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from openai import OpenAI


load_dotenv(Path(__file__).with_name(".env"))

app = Flask(__name__, static_folder="frontend", static_url_path="")
app.json.ensure_ascii = False

DATA_FILE = Path(__file__).parent / "data" / "conversations.json"


def load_conversations():
    if not DATA_FILE.exists() or DATA_FILE.stat().st_size == 0:
        return []

    try:
        with DATA_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        app.logger.error("无法读取 conversations.json，将使用空数据")
        return []

    if not isinstance(data, list):
        app.logger.error("conversations.json 顶层不是数组，将使用空数据")
        return []
    return data


def save_conversations():
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as file:
        json.dump(conversations, file, ensure_ascii=False, indent=2)


conversations = load_conversations()
next_conversation_id = max(
    (conversation.get("id", 0) for conversation in conversations),
    default=0,
) + 1
next_message_id = max(
    (
        message.get("id", 0)
        for conversation in conversations
        for message in conversation.get("messages", [])
    ),
    default=0,
) + 1


def find_conversation(conversation_id):
    return next(
        (item for item in conversations if item["id"] == conversation_id),
        None,
    )


def conversation_summary(conversation):
    return {
        "id": conversation["id"],
        "title": conversation["title"],
        "message_count": len(conversation["messages"]),
    }


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/hello")
def hello():
    return jsonify({"message": "你好"})


@app.post("/api/conversations")
def create_conversation():
    global next_conversation_id

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "请求体必须是 JSON 对象"}), 400

    title = data.get("title", "新对话")
    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "title 不能为空"}), 400

    conversation = {
        "id": next_conversation_id,
        "title": title.strip(),
        "messages": [],
    }
    conversations.append(conversation)
    next_conversation_id += 1
    save_conversations()
    return jsonify(conversation), 201


@app.get("/api/conversations")
def list_conversations():
    return jsonify([conversation_summary(item) for item in conversations])


@app.get("/api/conversations/<int:conversation_id>")
def get_conversation(conversation_id):
    conversation = find_conversation(conversation_id)
    if conversation is None:
        return jsonify({"error": "会话不存在"}), 404
    return jsonify(conversation)


@app.patch("/api/conversations/<int:conversation_id>")
def update_conversation(conversation_id):
    conversation = find_conversation(conversation_id)
    if conversation is None:
        return jsonify({"error": "会话不存在"}), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "请求体必须是 JSON 对象"}), 400

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "title 不能为空"}), 400

    conversation["title"] = title.strip()
    save_conversations()
    return jsonify(conversation_summary(conversation))


@app.delete("/api/conversations/<int:conversation_id>")
def delete_conversation(conversation_id):
    conversation = find_conversation(conversation_id)
    if conversation is None:
        return jsonify({"error": "会话不存在"}), 404

    conversations.remove(conversation)
    save_conversations()
    return "", 204


@app.post("/api/conversations/<int:conversation_id>/messages")
def create_conversation_message(conversation_id):
    global next_message_id

    conversation = find_conversation(conversation_id)
    if conversation is None:
        return jsonify({"error": "会话不存在"}), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "请求体必须是 JSON 对象"}), 400

    message_text = data.get("message")
    if not isinstance(message_text, str) or not message_text.strip():
        return jsonify({"error": "message 不能为空"}), 400

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return jsonify({"error": "服务器未配置 DeepSeek API Key"}), 500

    user_content = message_text.strip()
    model_messages = [
        {"role": message["role"], "content": message["content"]}
        for message in conversation["messages"]
    ]
    model_messages.append({"role": "user", "content": user_content})

    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com",
        )
        completion = client.chat.completions.create(
            model="deepseek-flash",
            messages=model_messages,
            stream=False,
        )
        reply = completion.choices[0].message.content
        if not reply:
            raise ValueError("DeepSeek 返回了空回复")
    except Exception:
        app.logger.error("DeepSeek API 调用失败")
        return jsonify({"error": "DeepSeek API 调用失败，请稍后重试"}), 502

    user_message = {
        "id": next_message_id,
        "role": "user",
        "content": user_content,
    }
    next_message_id += 1
    assistant_message = {
        "id": next_message_id,
        "role": "assistant",
        "content": reply,
    }
    next_message_id += 1
    conversation["messages"].extend([user_message, assistant_message])
    save_conversations()

    return jsonify(
        {
            "conversation": conversation_summary(conversation),
            "user_message": user_message,
            "assistant_message": assistant_message,
        }
    ), 201


if __name__ == "__main__":
    app.run(port=5001, debug=True)
