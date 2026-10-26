const conversationList = document.querySelector("#conversation-list");
const newConversationButton = document.querySelector("#new-conversation-button");
const conversationTitle = document.querySelector("#conversation-title");
const conversationMeta = document.querySelector("#conversation-meta");
const conversationActions = document.querySelector("#conversation-actions");
const renameButton = document.querySelector("#rename-button");
const deleteButton = document.querySelector("#delete-button");
const inlinePanel = document.querySelector("#inline-panel");
const messageList = document.querySelector("#message-list");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const sendButton = messageForm.querySelector("button[type='submit']");
const feedback = document.querySelector("#feedback");

let conversations = [];
let activeConversation = null;

function setFeedback(text = "", type = "error") {
  feedback.textContent = text;
  feedback.classList.toggle("success", type === "success");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "请求失败，请稍后重试");
  }
  return data;
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderConversationList() {
  conversationList.replaceChildren();
  if (conversations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "sidebar-empty";
    empty.textContent = "还没有会话";
    conversationList.append(empty);
    return;
  }

  conversations.forEach((conversation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    button.classList.toggle("active", activeConversation?.id === conversation.id);
    const title = document.createElement("span");
    title.textContent = conversation.title;
    const count = document.createElement("small");
    count.textContent = `${conversation.message_count} 条消息`;
    button.append(title, count);
    button.addEventListener("click", () => selectConversation(conversation.id));
    conversationList.append(button);
  });
}

function renderMessages() {
  messageList.replaceChildren();
  if (!activeConversation) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "从左侧选择一个会话，或创建新会话。";
    messageList.append(empty);
    return;
  }

  if (activeConversation.messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "这个会话还是空的，发送第一条消息吧。";
    messageList.append(empty);
    return;
  }

  activeConversation.messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `chat-message ${message.role}`;
    const role = document.createElement("p");
    role.className = "message-role";
    role.textContent = message.role === "user" ? "你" : "AI";
    const content = document.createElement("p");
    content.textContent = message.content;
    article.append(role, content);
    messageList.append(article);
  });
  messageList.scrollTop = messageList.scrollHeight;
}

function renderActiveConversation() {
  const hasConversation = Boolean(activeConversation);
  conversationTitle.textContent = hasConversation
    ? activeConversation.title
    : "请选择或新建会话";
  conversationMeta.textContent = hasConversation
    ? `${activeConversation.messages.length} 条消息`
    : "不同会话的历史消息彼此独立";
  conversationActions.hidden = !hasConversation;
  messageInput.disabled = !hasConversation;
  sendButton.disabled = !hasConversation;
  hideInlinePanel();
  renderConversationList();
  renderMessages();
}

function hideInlinePanel() {
  inlinePanel.hidden = true;
  inlinePanel.replaceChildren();
}

function showTitleForm(heading, initialValue, onSubmit) {
  inlinePanel.replaceChildren();
  inlinePanel.hidden = false;
  const form = document.createElement("form");
  form.className = "inline-form";
  const label = document.createElement("label");
  label.textContent = heading;
  const input = document.createElement("input");
  input.type = "text";
  input.value = initialValue;
  input.required = true;
  label.append(input);
  const actions = document.createElement("div");
  actions.className = "inline-actions";
  actions.append(createButton("取消", "secondary-button", hideInlinePanel));
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary-button compact";
  submit.textContent = "保存";
  actions.append(submit);
  form.append(label, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await onSubmit(input.value);
      hideInlinePanel();
    } catch (error) {
      setFeedback(error.message);
      submit.disabled = false;
    }
  });
  inlinePanel.append(form);
  input.focus();
  input.select();
}

async function loadConversations() {
  try {
    conversations = await requestJson("/api/conversations");
    if (conversations.length > 0) {
      await selectConversation(conversations[0].id);
    } else {
      renderActiveConversation();
    }
  } catch (error) {
    setFeedback(error.message);
  }
}

async function selectConversation(id) {
  try {
    activeConversation = await requestJson(`/api/conversations/${id}`);
    setFeedback();
    renderActiveConversation();
  } catch (error) {
    setFeedback(error.message);
  }
}

newConversationButton.addEventListener("click", () => {
  showTitleForm("新会话名称", "新对话", async (title) => {
    const created = await requestJson("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    conversations.push({ ...created, message_count: 0 });
    activeConversation = created;
    setFeedback("会话已创建。", "success");
    renderActiveConversation();
  });
});

renameButton.addEventListener("click", () => {
  if (!activeConversation) return;
  showTitleForm("重命名会话", activeConversation.title, async (title) => {
    const updated = await requestJson(
      `/api/conversations/${activeConversation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    activeConversation.title = updated.title;
    conversations = conversations.map((conversation) =>
      conversation.id === updated.id ? updated : conversation,
    );
    setFeedback("会话已重命名。", "success");
    renderActiveConversation();
  });
});

deleteButton.addEventListener("click", () => {
  if (!activeConversation) return;
  inlinePanel.replaceChildren();
  inlinePanel.hidden = false;
  const question = document.createElement("p");
  question.textContent = `确定删除会话“${activeConversation.title}”及其全部消息吗？`;
  const actions = document.createElement("div");
  actions.className = "inline-actions";
  actions.append(createButton("取消", "secondary-button", hideInlinePanel));
  const confirmDelete = createButton("确认删除", "danger-button", async () => {
    confirmDelete.disabled = true;
    try {
      const deletedId = activeConversation.id;
      await requestJson(`/api/conversations/${deletedId}`, { method: "DELETE" });
      conversations = conversations.filter((item) => item.id !== deletedId);
      activeConversation = null;
      setFeedback("会话已删除。", "success");
      if (conversations.length > 0) {
        await selectConversation(conversations[0].id);
      } else {
        renderActiveConversation();
      }
    } catch (error) {
      setFeedback(error.message);
      confirmDelete.disabled = false;
    }
  });
  actions.append(confirmDelete);
  inlinePanel.append(question, actions);
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeConversation) return;

  sendButton.disabled = true;
  messageInput.disabled = true;
  setFeedback("正在等待 AI 回复……", "success");
  try {
    const result = await requestJson(
      `/api/conversations/${activeConversation.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageInput.value }),
      },
    );
    activeConversation.messages.push(result.user_message, result.assistant_message);
    conversations = conversations.map((conversation) =>
      conversation.id === result.conversation.id
        ? result.conversation
        : conversation,
    );
    messageInput.value = "";
    setFeedback("回复已收到。", "success");
    renderActiveConversation();
  } catch (error) {
    setFeedback(error.message);
  } finally {
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
});

loadConversations();
