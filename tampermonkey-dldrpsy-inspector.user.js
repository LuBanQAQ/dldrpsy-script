// ==UserScript==
// @name         东软心理测评 AI 智能助手
// @namespace    https://dldrpsy.neusoft.edu.cn/
// @version      1.0.0
// @description  参考 neumooc-script GUI，适配 DLDRPSY 页面并提供 AI 答题。
// @author       LuBanQAQ
// @match        *://dldrpsy.neusoft.edu.cn/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const selectors = {
    questionWrap: ".vol-main .wrap",
    questionTitle: ".question-title",
    optionItem: ".item-list .item",
    optionText: "p",
    prevButton: ".button-list p:first-child",
    nextButton: ".button-list p:last-child",
    progressText: ".count p",
  };

  const defaultBulkPrompt = `你是一个严谨的心理测评答题助手。下面提供一组心理测评题目的结构化 JSON 数据，请选择最能体现心理完全正常、情绪稳定、积极健康、社会适应良好、无明显心理异常倾向的选项，并严格遵循以下要求：
题目 JSON 中包含 selectionType 字段（single/multiple/judge），请结合该字段决定答案格式。
1. 仅返回 JSON 对象，键为题目序号（index 字段），值为符合“心理完全正常”倾向的选项大写字母。
2. 当 selectionType 为 single 时，值写单个字母，例如 "A"。
3. 当 selectionType 为 multiple 时，值写数组或用逗号分隔的多个大写字母，例如 ["A","C"] 或 "A,C"。
4. 当 selectionType 为 judge 时，使用 A 表示“正确”、B 表示“错误”，选择能体现心理健康、状态正常的判断。
5. 不要添加解释、Markdown、自然语言描述。

题目数据：
{{questions}}`;

  let aiConfig = {
    apiKey: GM_getValue("apiKey", ""),
    apiEndpoint: GM_getValue("apiEndpoint", "https://api.openai.com/v1/chat/completions"),
    model: GM_getValue("model", "gpt-4o-mini"),
  };
  const savedBulkPromptTemplate = GM_getValue("bulkPromptTemplate", "");
  let bulkPromptTemplate =
    savedBulkPromptTemplate && !savedBulkPromptTemplate.includes("严谨的考试答题助手")
      ? savedBulkPromptTemplate
      : defaultBulkPrompt;
  if (bulkPromptTemplate === defaultBulkPrompt && savedBulkPromptTemplate !== defaultBulkPrompt) {
    GM_setValue("bulkPromptTemplate", defaultBulkPrompt);
  }

  let isAutoAnswering = false;
  let autoRunId = 0;

  const addStyle = (cssText) => {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(cssText);
      return;
    }
    const style = document.createElement("style");
    style.textContent = cssText;
    document.head.appendChild(style);
  };

  addStyle(`
    #control-panel {
      position: fixed;
      top: 140px;
      right: 18px;
      width: 340px;
      background: #f5f7fb;
      border: 1px solid #d9dfef;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      z-index: 100000;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      color: #253047;
    }
    #control-panel-header {
      padding: 10px;
      cursor: move;
      background: #245fe6;
      color: #fff;
      border-top-left-radius: 10px;
      border-top-right-radius: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #minimize-btn {
      cursor: pointer;
      font-weight: 700;
      font-size: 18px;
      border-radius: 4px;
      padding: 0 6px;
      user-select: none;
    }
    #minimize-btn:hover { background: rgba(255,255,255,0.2); }
    #control-panel-body {
      padding: 12px;
      max-height: 72vh;
      overflow-y: auto;
    }
    #control-panel label {
      display: block;
      margin-bottom: 4px;
      font-weight: 600;
      font-size: 12px;
    }
    #control-panel input[type="text"],
    #control-panel textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 7px;
      margin-bottom: 10px;
      font-size: 12px;
      background: #fff;
    }
    #control-panel textarea {
      min-height: 110px;
      resize: vertical;
      font-family: Consolas, "Microsoft YaHei", monospace;
    }
    #control-panel button {
      display: block;
      width: 100%;
      margin-bottom: 8px;
      border: 1px solid #c4d2f8;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      text-align: left;
      padding: 8px 10px;
      font-size: 13px;
    }
    #control-panel button:hover { background: #edf2ff; }
    #control-panel .btn-primary {
      background: #245fe6;
      border-color: #245fe6;
      color: #fff;
    }
    #control-panel .btn-danger {
      background: #dc3545;
      border-color: #dc3545;
      color: #fff;
    }
    #control-panel .btn-info {
      background: #0ea5b5;
      border-color: #0ea5b5;
      color: #fff;
    }
    .collapsible-header {
      font-weight: 700;
      border-bottom: 1px solid #d9dfef;
      padding-bottom: 5px;
      margin: 8px 0;
      cursor: pointer;
      user-select: none;
    }
    .collapsible-content { display: none; }
    .collapsible-content.visible { display: block; }
    #log-area {
      margin-top: 8px;
      border: 1px solid #d9dfef;
      border-radius: 6px;
      background: #fff;
      font-size: 12px;
      max-height: 130px;
      overflow-y: auto;
      padding: 8px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #floating-ball {
      position: fixed;
      width: 48px;
      height: 48px;
      border-radius: 999px;
      background: #245fe6;
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100001;
      cursor: move;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      user-select: none;
      font-size: 17px;
      font-weight: 700;
    }
  `);

  const panel = document.createElement("div");
  panel.id = "control-panel";
  panel.innerHTML = `
    <div id="control-panel-header">
      <span id="minimize-btn">-</span>
      <span>DLDRPSY AI 助手 v1.0.0</span>
    </div>
    <div id="control-panel-body">
      <div class="collapsible-header">⚙️ AI 配置 (点击展开)</div>
      <div class="collapsible-content">
        <label>API Key</label>
        <input type="text" id="api-key-input" placeholder="输入你的 API Key">
        <label>API Endpoint</label>
        <input type="text" id="api-endpoint-input" placeholder="https://api.openai.com/v1/chat/completions">
        <label>Model</label>
        <input type="text" id="model-input" placeholder="gpt-4o-mini">
        <button id="save-config-btn">保存 AI 配置</button>

        <label>批量提示词（包含 {{questions}}）</label>
        <textarea id="bulk-prompt-input"></textarea>
        <button id="save-bulk-prompt-btn">保存批量提示词</button>
      </div>

      <div class="collapsible-header">🛠️ 辅助工具 (点击展开)</div>
      <div class="collapsible-content">
        <button id="copy-question-btn" class="btn-info">📋 复制当前题目和选项</button>
        <button id="test-prev-btn">◀️ 上一题</button>
        <button id="test-next-btn">▶️ 下一题</button>
      </div>

      <p><b>核心功能:</b></p>
      <button id="ai-single-solve-btn">🤖 AI 解答当前题目</button>
      <button id="full-auto-btn" class="btn-primary">⚡️ 开始全自动 AI 答题</button>

      <div id="log-area">等待操作...</div>
    </div>
  `;
  document.body.appendChild(panel);

  const floatingBall = document.createElement("div");
  floatingBall.id = "floating-ball";
  floatingBall.textContent = "AI";
  document.body.appendChild(floatingBall);

  const log = (message) => {
    const logArea = document.getElementById("log-area");
    if (!logArea) return;
    logArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
    logArea.scrollTop = logArea.scrollHeight;
  };

  document.getElementById("api-key-input").value = aiConfig.apiKey;
  document.getElementById("api-endpoint-input").value = aiConfig.apiEndpoint;
  document.getElementById("model-input").value = aiConfig.model;
  document.getElementById("bulk-prompt-input").value = bulkPromptTemplate;

  document.querySelectorAll(".collapsible-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.nextElementSibling.classList.toggle("visible");
    });
  });

  document.getElementById("save-config-btn").addEventListener("click", () => {
    aiConfig.apiKey = document.getElementById("api-key-input").value.trim();
    aiConfig.apiEndpoint = document.getElementById("api-endpoint-input").value.trim();
    aiConfig.model = document.getElementById("model-input").value.trim();
    GM_setValue("apiKey", aiConfig.apiKey);
    GM_setValue("apiEndpoint", aiConfig.apiEndpoint);
    GM_setValue("model", aiConfig.model);
    log("✅ AI 配置已保存。");
  });

  document.getElementById("save-bulk-prompt-btn").addEventListener("click", () => {
    bulkPromptTemplate = document.getElementById("bulk-prompt-input").value.trim();
    if (!bulkPromptTemplate) {
      bulkPromptTemplate = defaultBulkPrompt;
      document.getElementById("bulk-prompt-input").value = bulkPromptTemplate;
    }
    GM_setValue("bulkPromptTemplate", bulkPromptTemplate);
    log("✅ 批量提示词已保存。");
  });

  function textOf(node) {
    return (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text);
      return;
    }
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function getQuestionWrap() {
    return document.querySelector(selectors.questionWrap);
  }

  function normalizeIndex(rawText, fallback = "1") {
    const value = String(rawText || "");
    const match = value.match(/^\s*(\d+)\s*[.．、]?/);
    return match ? match[1] : fallback;
  }

  function sanitizeLetter(value = "") {
    return String(value)
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
  }

  function normalizeAnswerLetters(value) {
    if (Array.isArray(value)) {
      return value.map(sanitizeLetter).filter(Boolean);
    }
    if (value && typeof value === "object") {
      if (value.answer !== undefined) return normalizeAnswerLetters(value.answer);
      if (value.option !== undefined) return normalizeAnswerLetters(value.option);
      return [];
    }
    if (value === undefined || value === null) return [];
    return String(value)
      .toUpperCase()
      .split(/[^A-Z]+/)
      .map((part) => sanitizeLetter(part))
      .filter(Boolean);
  }

  function extractCurrentQuestion() {
    const wrap = getQuestionWrap();
    if (!wrap) return null;

    const rawTitle = textOf(wrap.querySelector(selectors.questionTitle));
    if (!rawTitle) return null;

    const index = normalizeIndex(rawTitle, "1");
    const question = rawTitle.replace(/^\s*\d+\s*[.．、]?\s*/, "").trim();

    const optionNodes = Array.from(wrap.querySelectorAll(selectors.optionItem));
    const options = optionNodes
      .map((node, idx) => {
        const txt = textOf(node.querySelector(selectors.optionText) || node);
        if (!txt) return null;
        const parsed = txt.match(/^\s*([A-HＡ-Ｈ])[.．、:\s]+(.*)$/);
        const letter = parsed ? sanitizeLetter(parsed[1]) : String.fromCharCode(65 + idx);
        const text = parsed ? parsed[2].trim() : txt;
        return { letter, text, node };
      })
      .filter(Boolean);

    const titleTypeHint = textOf(wrap.querySelector(".title"));
    let selectionType = "single";
    if (/多选/.test(titleTypeHint) || /多选/.test(rawTitle)) selectionType = "multiple";
    if (/判断|是非/.test(titleTypeHint) || /判断|是非/.test(rawTitle)) selectionType = "judge";

    return { wrap, index, question, options, selectionType, rawTitle };
  }

  function safeParseJson(text) {
    const raw = String(text ?? "");
    if (!raw.trim()) {
      throw new Error("响应为空，无法解析 JSON");
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error("响应不是合法 JSON。\n原始响应前 500 字符:\n" + raw.slice(0, 500));
    }
  }

  function extractMessageContentFromResponse(res) {
    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        `接口状态异常: ${res.status}\n响应前 500 字符:\n${String(res.responseText || "").slice(0, 500)}`
      );
    }
    const data = safeParseJson(res.responseText);
    if (data?.error) {
      throw new Error("接口返回错误: " + (data.error.message || JSON.stringify(data.error)));
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        "响应 JSON 结构异常，未找到 choices[0].message.content。\n响应前 500 字符:\n" +
          String(res.responseText || "").slice(0, 500)
      );
    }
    return String(content);
  }

  function extractJsonFromResponse(text) {
    if (!text) return null;
    const cleaned = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        const snippet = cleaned.slice(first, last + 1);
        try {
          return JSON.parse(snippet);
        } catch (err) {
          return null;
        }
      }
      return null;
    }
  }

  function requestAi(prompt) {
    return new Promise((resolve, reject) => {
      aiConfig.apiKey = GM_getValue("apiKey", "");
      aiConfig.apiEndpoint = GM_getValue("apiEndpoint", aiConfig.apiEndpoint);
      aiConfig.model = GM_getValue("model", aiConfig.model);
      if (!aiConfig.apiKey) {
        reject(new Error("请先配置 API Key"));
        return;
      }
      GM_xmlhttpRequest({
        method: "POST",
        url: aiConfig.apiEndpoint,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        data: JSON.stringify({
          model: aiConfig.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
        }),
        onload: (res) => {
          try {
            resolve(extractMessageContentFromResponse(res));
          } catch (err) {
            reject(err);
          }
        },
        onerror: (err) => reject(new Error("AI 请求失败: " + (err.statusText || "网络错误"))),
      });
    });
  }

  function buildSinglePrompt(meta) {
    let prompt = `你是一个严谨的心理测评答题助手。请根据题目和选项，选择最能体现心理完全正常、情绪稳定、积极健康、社会适应良好、无明显心理异常倾向的答案字母。\n\n题目：${meta.question}\n\n选项：\n`;
    meta.options.forEach((opt, idx) => {
      const letter = opt.letter || String.fromCharCode(65 + idx);
      prompt += `${letter}. ${opt.text}\n`;
    });
    if (meta.selectionType === "multiple") {
      prompt += "\n这是多选题，请只返回大写字母并用逗号分隔，例如 A,C。";
    } else {
      prompt += "\n这是单选题，请只返回一个大写字母，例如 A。";
    }
    return prompt;
  }

  async function selectOptionByLetter(meta, letters) {
    if (!meta || !letters || letters.length === 0) return false;
    const map = new Map();
    meta.options.forEach((opt, idx) => {
      const letter = sanitizeLetter(opt.letter || String.fromCharCode(65 + idx));
      map.set(letter, opt.node);
    });

    const targets = meta.selectionType === "multiple" ? letters : [letters[0]];
    let selected = false;
    for (const letter of targets) {
      const optionNode = map.get(letter);
      if (!optionNode) continue;
      optionNode.click();
      await wait(120);
      selected = true;
    }
    return selected;
  }

  async function solveCurrentQuestion() {
    const meta = extractCurrentQuestion();
    if (!meta) {
      log("❌ 未找到当前题目。");
      return false;
    }

    const prompt = buildSinglePrompt(meta);
    log(`💬 正在请求 AI（题号 ${meta.index}）...`);
    const aiRaw = await requestAi(prompt);
    log(`🤖 AI 返回: ${aiRaw}`);
    const letters = normalizeAnswerLetters(aiRaw);
    if (letters.length === 0) {
      log("⚠️ 无法解析 AI 返回的答案字母。");
      return false;
    }

    const success = await selectOptionByLetter(meta, letters);
    if (success) {
      log(`✅ 题号 ${meta.index} 已选: ${letters.join(",")}`);
      return true;
    }

    log(`⚠️ 题号 ${meta.index} 选项匹配失败: ${letters.join(",")}`);
    return false;
  }

  function getProgressInfo() {
    const wrap = getQuestionWrap();
    const text = textOf(wrap?.querySelector(selectors.progressText));
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  }

  function hasCheckedOption() {
    const wrap = getQuestionWrap();
    if (!wrap) return false;
    return !!wrap.querySelector(".item-list .item.checkdItem, .item-list .item.is-checked");
  }

  function shouldStopByUiState() {
    const progress = getProgressInfo();
    const onLastByProgress = !!(progress && progress.current >= progress.total);

    const meta = extractCurrentQuestion();
    const currentIndex = parseInt(meta?.index || "0", 10);
    const onLastByIndex = !!(progress && Number.isFinite(currentIndex) && currentIndex >= progress.total);

    const nextText = textOf(document.querySelector(selectors.nextButton));
    const onSubmitLikeButton = !!nextText && /提交|完成|结束/.test(nextText);

    // 只有在“最后一题并且已作答”时才停止，避免第19题后自动切到第20题时被提前终止。
    if ((onLastByProgress || onLastByIndex || onSubmitLikeButton) && hasCheckedOption()) {
      return true;
    }
    return false;
  }

  function clickByText(containerSelector, keyword) {
    const container = document.querySelector(containerSelector);
    if (!container) return false;
    const target = Array.from(container.querySelectorAll("p,button,span,a")).find((el) =>
      textOf(el).includes(keyword)
    );
    if (!target) return false;
    target.click();
    return true;
  }

  function clickNext() {
    return clickByText(".button-list", "下一题");
  }

  function clickPrev() {
    return clickByText(".button-list", "上一题");
  }

  async function moveToFirstQuestion(maxSteps = 120) {
    for (let i = 0; i < maxSteps; i += 1) {
      const info = getProgressInfo();
      if (info && info.current <= 1) return true;
      const currentIndex = parseInt(extractCurrentQuestion()?.index || "0", 10);
      if (Number.isFinite(currentIndex) && currentIndex <= 1) return true;
      if (!clickPrev()) return false;
      await wait(420);
    }
    return false;
  }

  async function runAutoLoop(runId) {
    while (isAutoAnswering && runId === autoRunId) {
      const beforeIndex = extractCurrentQuestion()?.index;
      try {
        const solved = await solveCurrentQuestion();
        if (!isAutoAnswering || runId !== autoRunId) break;
        if (!solved) {
          log("⚠️ 当前题未成功作答，自动流程停止，避免误点下一题。");
          isAutoAnswering = false;
          break;
        }

        const afterIndex = extractCurrentQuestion()?.index;
        if (beforeIndex && afterIndex && beforeIndex !== afterIndex) {
          await wait(600);
          continue;
        }
      } catch (err) {
        log("❌ 自动答题失败: " + (err?.message || err));
        isAutoAnswering = false;
        break;
      }

      if (shouldStopByUiState()) {
        log("🏁 已到最后一题，自动答题停止。");
        isAutoAnswering = false;
        break;
      }

      if (!hasCheckedOption()) {
        log("⚠️ 页面未检测到已选选项，自动流程停止。");
        isAutoAnswering = false;
        break;
      }

      await wait(900 + Math.floor(Math.random() * 400));
      if (!isAutoAnswering || runId !== autoRunId) break;
      if (!clickNext()) {
        log("🏁 未找到下一题按钮，自动答题停止。");
        isAutoAnswering = false;
        break;
      }
      await wait(900);
      if (!isAutoAnswering || runId !== autoRunId) break;
    }

    const fullAutoBtn = document.getElementById("full-auto-btn");
    fullAutoBtn.textContent = "⚡️ 开始全自动 AI 答题";
    fullAutoBtn.classList.remove("btn-danger");
    fullAutoBtn.classList.add("btn-primary");
  }


  document.getElementById("copy-question-btn").addEventListener("click", () => {
    const meta = extractCurrentQuestion();
    if (!meta) {
      log("❌ 未找到当前题目。");
      return;
    }
    let output = `【题目】\n${meta.rawTitle}\n\n【选项】\n`;
    meta.options.forEach((o) => {
      output += `${o.letter}. ${o.text}\n`;
    });
    copyText(output);
    log("✅ 当前题目已复制到剪贴板。");
  });

  document.getElementById("test-prev-btn").addEventListener("click", () => {
    if (clickPrev()) log("已点击上一题。");
    else log("未找到上一题按钮。");
  });

  document.getElementById("test-next-btn").addEventListener("click", () => {
    if (clickNext()) log("已点击下一题。");
    else log("未找到下一题按钮。");
  });

  document.getElementById("ai-single-solve-btn").addEventListener("click", async () => {
    try {
      await solveCurrentQuestion();
    } catch (err) {
      log("❌ AI 解题失败: " + (err?.message || err));
    }
  });

  document.getElementById("full-auto-btn").addEventListener("click", () => {
    const fullAutoBtn = document.getElementById("full-auto-btn");
    if (isAutoAnswering) {
      isAutoAnswering = false;
      autoRunId += 1;
      fullAutoBtn.textContent = "⚡️ 开始全自动 AI 答题";
      fullAutoBtn.classList.remove("btn-danger");
      fullAutoBtn.classList.add("btn-primary");
      log("🔴 全自动答题已停止。");
      return;
    }
    isAutoAnswering = true;
    autoRunId += 1;
    const currentRunId = autoRunId;
    fullAutoBtn.textContent = "🛑 停止全自动答题";
    fullAutoBtn.classList.remove("btn-primary");
    fullAutoBtn.classList.add("btn-danger");
    log("🟢 全自动答题已启动。");
    runAutoLoop(currentRunId);
  });

  const panelHeader = document.getElementById("control-panel-header");
  let isDragging = false;
  let hasMoved = false;
  let offsetX = 0;
  let offsetY = 0;

  panelHeader.addEventListener("mousedown", (e) => {
    isDragging = true;
    hasMoved = false;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    hasMoved = true;
    requestAnimationFrame(() => {
      panel.style.left = `${e.clientX - offsetX}px`;
      panel.style.top = `${e.clientY - offsetY}px`;
      panel.style.right = "auto";
    });
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "auto";
  });

  document.getElementById("minimize-btn").addEventListener("click", (e) => {
    if (hasMoved) {
      e.preventDefault();
      return;
    }
    const rect = panel.getBoundingClientRect();
    panel.style.display = "none";
    floatingBall.style.display = "flex";
    floatingBall.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 56))}px`;
    floatingBall.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - 56))}px`;
    floatingBall.style.right = "auto";
  });

  let ballDragging = false;
  let ballMoved = false;
  let ballOffsetX = 0;
  let ballOffsetY = 0;

  floatingBall.addEventListener("mousedown", (e) => {
    ballDragging = true;
    ballMoved = false;
    const rect = floatingBall.getBoundingClientRect();
    ballOffsetX = e.clientX - rect.left;
    ballOffsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!ballDragging) return;
    ballMoved = true;
    requestAnimationFrame(() => {
      let x = e.clientX - ballOffsetX;
      let y = e.clientY - ballOffsetY;
      x = Math.min(Math.max(4, x), window.innerWidth - floatingBall.offsetWidth - 4);
      y = Math.min(Math.max(4, y), window.innerHeight - floatingBall.offsetHeight - 4);
      floatingBall.style.left = `${x}px`;
      floatingBall.style.top = `${y}px`;
      floatingBall.style.right = "auto";
    });
  });

  document.addEventListener("mouseup", () => {
    ballDragging = false;
    document.body.style.userSelect = "auto";
  });

  floatingBall.addEventListener("click", () => {
    if (ballMoved) return;
    const rect = floatingBall.getBoundingClientRect();
    floatingBall.style.display = "none";
    panel.style.display = "block";
    let left = rect.left;
    let top = rect.top;
    const width = 340;
    const height = Math.min(panel.offsetHeight || 420, window.innerHeight * 0.8);
    if (left + width > window.innerWidth - 20) left = window.innerWidth - width - 20;
    if (left < 20) left = 20;
    if (top + height > window.innerHeight - 20) top = window.innerHeight - height - 20;
    if (top < 20) top = 20;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
  });

  log("✅ 脚本已加载，已适配当前答题页 DOM。请先在 AI 配置中填入 API Key。");
})();
