(() => {
  const panel = document.getElementById('pl-chat');
  const launch = document.getElementById('chat-launch');
  const close = document.getElementById('chat-close');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-question');
  const status = document.getElementById('chat-status');
  const controls = [...form.querySelectorAll('button'), ...panel.querySelectorAll('[data-chat-question]')];
  let returnFocus = launch;
  let pending = false;

  function openChat(trigger) {
    if (panel.hidden) returnFocus = trigger;
    panel.hidden = false;
    launch.hidden = true;
    launch.setAttribute('aria-expanded', 'true');
    input.focus({ preventScroll: true });
  }

  function closeChat() {
    panel.hidden = true;
    launch.hidden = false;
    launch.setAttribute('aria-expanded', 'false');
    returnFocus.focus({ preventScroll: true });
  }

  function addMessage(text, kind, sources = [], mode) {
    const bubble = document.createElement('div');
    bubble.className = `chat-message chat-${kind}`;
    const message = document.createElement('p');
    message.textContent = text;
    bubble.append(message);
    const credit = document.createElement('div');
    credit.className = 'chat-sources';
    if (mode === 'general') credit.textContent = 'General AI response';
    for (const source of sources) {
      const url = new URL(source.url, window.location.origin);
      if (url.origin !== window.location.origin && url.protocol !== 'https:') continue;
      const link = document.createElement('a');
      link.href = url.href;
      link.textContent = source.title;
      credit.append(link);
    }
    if (credit.hasChildNodes()) bubble.append(credit);
    log.append(bubble);
    while (log.childElementCount > 24) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  async function send(question) {
    question = question.trim();
    if (!question || pending) return;
    pending = true;
    input.value = '';
    addMessage(question, 'user');
    controls.forEach(button => { button.disabled = true; });
    status.hidden = false;
    status.textContent = 'Looking up an answer…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question }), signal: controller.signal
      });
      const data = await response.json();
      if (typeof data.answer !== 'string') throw new Error('Incomplete answer');
      addMessage(data.answer, 'answer', data.sources, data.mode);
    } catch (_) {
      addMessage('PL Chat could not reach the local server. Try sending your question again.', 'answer');
      if (!input.value) input.value = question;
    } finally {
      clearTimeout(timeout);
      pending = false;
      status.hidden = true;
      controls.forEach(button => { button.disabled = false; });
    }
  }

  document.querySelectorAll('[data-chat-open]').forEach(trigger => {
    trigger.hidden = false;
    trigger.addEventListener('click', () => openChat(trigger));
  });
  document.querySelectorAll('[data-chat-topic]').forEach(trigger => {
    trigger.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openChat(trigger);
      if (pending) input.value = trigger.dataset.chatTopic;
      else send(trigger.dataset.chatTopic);
    });
  });
  panel.querySelectorAll('[data-chat-question]').forEach(button => {
    button.addEventListener('click', () => { send(button.dataset.chatQuestion); input.focus(); });
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    send(input.value);
    input.focus();
  });
  close.addEventListener('click', closeChat);
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeChat();
  });
})();
